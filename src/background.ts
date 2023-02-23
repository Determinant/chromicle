import * as gapi from './gapi';
import { MsgType, Msg } from './msg';
import { Duration, TrackedPeriod, TrackedPeriodFlat } from './duration';
import moment from 'moment';
import { GraphData, getGraphData } from './graph';
import { PatternEntry, PatternEntryFlat } from './pattern';

let mainPatterns: PatternEntry[] = [];
let analyzePatterns: PatternEntry[] = [];
let calendars: {[id: string]: gapi.GCalendarMeta} = {};
let calData: {[id: string]: gapi.GCalendar} = {};
let config = {
    trackedPeriods: [
        new TrackedPeriod('Today', Duration.days(1), Duration.days(0)),
        new TrackedPeriod('Yesterday', Duration.days(2), Duration.days(1)),
        new TrackedPeriod('This Week', Duration.weeks(1), Duration.weeks(0)),
        new TrackedPeriod('This Month', Duration.months(1), Duration.months(0))] as TrackedPeriod[],
    overrideNewTab: false
};
let mainGraphData: GraphData[] = [];
let dirtyMetadata = false;
let dirtyCalData = false;
let loadPromise: Promise<void> = null;
let auth = new gapi.Auth();

enum ChromeError {
    storageGetError = "storageGetError",
    storageSetError = "storageSetError"
}

const chromeStorageGet = (keys: string[]): Promise<any> => (
    new Promise(resolver => chrome.storage.local.get(keys, items => {
        if (chrome.runtime.lastError) throw ChromeError.storageGetError;
        resolver(items);
    }))
);

const chromeStorageSet = (obj: {[key: string]: any}): Promise<void> => (
    new Promise(resolver => chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) throw ChromeError.storageSetError;
        resolver();
    }))
);

async function loadMetadata() {
    try {
        let items = await chromeStorageGet(['calendars', 'config', 'mainPatterns', 'analyzePatterns']);
        if (!items.hasOwnProperty('config'))
            console.log("no saved metadata");
        else
        {
            config = {
                trackedPeriods: items.config.trackedPeriods.map((p: TrackedPeriodFlat) => TrackedPeriod.inflate(p)),
                overrideNewTab: items.config.overrideNewTab
            };
            calendars = items.calendars;
            mainPatterns = items.mainPatterns.map((p: PatternEntryFlat) => PatternEntry.inflate(p));
            analyzePatterns = items.analyzePatterns.map((p: PatternEntryFlat) => PatternEntry.inflate(p));
            console.log('metadata loaded');
        }
    } catch (_) {
        console.error("error while loading saved metadata");
    }
}

async function saveMetadata() {
    await chromeStorageSet({
        calendars,
        config: {
            trackedPeriods: config.trackedPeriods.map(p => p.deflate()),
            overrideNewTab: config.overrideNewTab
        },
        mainPatterns: mainPatterns.map(p => p.deflate()),
        analyzePatterns: analyzePatterns.map(p => p.deflate())
    });
    console.log('metadata saved');
}

async function loadCachedCals() {
    try {
        let items = await chromeStorageGet(['calData']);
        if (!items.hasOwnProperty('calData'))
            console.log("no cached cals");
        else
        {
            let calDataFlat: {[id: string]: gapi.GCalendarFlat} = items.calData;
            console.log(calDataFlat);
            for (let id in calDataFlat) {
                calData[id] = gapi.GCalendar.inflate(calDataFlat[id], auth);
            }
            console.log("cached cals loaded");
        }
    } catch (e) {
        console.log(e);
        console.error("error while loading cached cals");
    }
}

async function saveCachedCals() {
    let calDataFlat: {[id: string]: gapi.GCalendarFlat} = {};
    for (let id in calData) {
        if (!(calendars.hasOwnProperty(id) &&
            calendars[id].enabled)) continue;
        calDataFlat[id] = calData[id].deflate();
    }
    try {
        await chromeStorageSet({ calData: calDataFlat });
        console.log('cached data saved');
    } catch (_) {
        console.log("failed to save cached data");
    }
}

function getCalData(id: string) {
    if (!calData.hasOwnProperty(id))
        calData[id] = new gapi.GCalendar(id, calendars[id].name, auth);
    return calData[id];
}

function handleGApiError(id: string, err: gapi.GApiError) {
    if (err === gapi.GApiError.fetchError) {
        console.log(`${id}: fetch error`);
    } else if (err === gapi.GApiError.invalidAuthToken) {
        console.log(`${id}: invalid auth token`);
        calendars[id].enabled = false;
    } else if (err === gapi.GApiError.notLoggedIn) {
        console.log(`${id}: not logged in`);
    } else {
        console.log(`${id}: ${err}`);
        calendars[id].enabled = false;
    }
}

async function getCalEvents(id: string, start: Date, end: Date) {
    let gcal = getCalData(id);
    try {
        let res = await gcal.getEvents(new Date(start), new Date(end));
        dirtyCalData = dirtyCalData || res.changed;
        return res.events;
    } catch(err) {
        handleGApiError(id, err);
        console.log(`cannot load calendar ${id}`);
        return [];
    }
}

function updateMainGraphData() {
    console.log('refreshing graph data');
    console.log(mainGraphData);
    let pms = [];
    for (let i = 0; i < config.trackedPeriods.length; i++)
    {
        let p = config.trackedPeriods[i];
        let startD = p.start.toMoment();
        let endD = p.end.toMoment();
        if (!(startD && endD)) return;
        let start = moment().add(1, 'days').startOf('day');
        if (endD.valueOf() == 0) {
            switch (p.start.unit) {
                case 'days': start = moment().add(1, 'days').startOf('day'); break;
                case 'weeks': start = moment().add(1, 'weeks').startOf('isoWeek'); break;
                case 'months': start = moment().add(1, 'months').startOf('month'); break;
                default:
            }
        }
        let end = start.clone();
        start.subtract(startD);
        end.subtract(endD);
        pms.push(getGraphData(
            start.toDate(), end.toDate(), mainPatterns, calendars,
            getCalEvents
        ).then(r => {
            mainGraphData[i] = {
                    name: p.name,
                    start: start.toDate(),
                    end: end.toDate(),
                    data: r.patternGraphData
            };
        }));
    }
    return Promise.all(pms);
}

async function pollSync() {
    console.log('poll');
    /* sync all enabled calendars */
    let pms = [];
    for (let id in calendars) {
        if (!calendars[id].enabled) continue;
        pms.push(getCalData(id).sync().catch(err => {
            handleGApiError(id, err);
            console.log(`cannot sync calendar ${id}`);
        }));
    }
    (await Promise.all(pms)).forEach(b => b && (dirtyCalData = true));
    /* update the tracked graph data */
    await updateMainGraphData();
    pms = [];
    /* save the storage if state is changed */
    if (dirtyMetadata)
        pms.push(saveMetadata().then(() => dirtyMetadata = false));
    if (dirtyCalData)
        pms.push(saveCachedCals().then(() => dirtyCalData = false));
    await Promise.all(pms);
    /* setup the next loop */
    return new Promise<void>(resolver => (
        window.setTimeout(() => { resolver(); pollSync();}, 10000)
    ));
}

function handleMsg(port: chrome.runtime.Port) {
    console.assert(port.name == 'main');
    port.onMessage.addListener(_msg => {
        let msg = Msg.inflate<any>(_msg);
        console.log(msg);
        switch (msg.opt) {
        case MsgType.updatePatterns: {
            let patterns = msg.data.patterns.map((p: PatternEntryFlat) => PatternEntry.inflate(p));
            if (msg.data.id == 'analyze')
                analyzePatterns = patterns;
            else
                mainPatterns = patterns;
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case MsgType.getPatterns: {
            let patterns;
            if (msg.data.id == 'analyze')
                patterns = analyzePatterns;
            else
                patterns = mainPatterns;
            port.postMessage(msg.genResp(patterns.map(p => p.deflate())));
            break;
        }
        case MsgType.updateCalendars: {
            calendars = msg.data;
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case MsgType.getCalendars: {
            let cals = calendars;
            if (msg.data.enabledOnly)
            {
                cals = Object.keys(calendars)
                    .filter(id => calendars[id].enabled)
                    .reduce((res, id) => (res[id] = calendars[id], res), {} as {[id: string]: gapi.GCalendarMeta});
            }
            port.postMessage(msg.genResp(cals));
            break;
        }
        case MsgType.getCalEvents: {
            getCalEvents(msg.data.id, new Date(msg.data.start), new Date(msg.data.end)).then(data => {
                console.log(data);
                let resp = msg.genResp(data.map(e => e.deflate()));
                console.log(resp);
                port.postMessage(resp);
            });
            break;
        }
        case MsgType.updateConfig: {
            for (let prop in msg.data) {
                if (prop === 'trackedPeriods') {
                    config.trackedPeriods = msg.data.trackedPeriods.map((p: TrackedPeriodFlat) => TrackedPeriod.inflate(p));
                } else if (prop == 'overrideNewTab') {
                    config.overrideNewTab = msg.data.overrideNewTab as boolean;
                }
            }
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case MsgType.getConfig: {
            let res: {[prop: string]: any} = {};
            msg.data.forEach((prop: string) => {
                if (prop === 'trackedPeriods')
                    res.trackedPeriods = config.trackedPeriods.map(p => p.deflate());
                else if (prop === 'overrideNewTab')
                    res.overrideNewTab = config.overrideNewTab;
            });
            port.postMessage(msg.genResp(res));
            break;
        }
        case MsgType.getGraphData: {
            (async () => {
                await (msg.data.sync ? updateMainGraphData().then(() => {}) : Promise.resolve());
                if (mainGraphData.length === 0)
                {
                    await loadPromise;
                    await updateMainGraphData();
                }
                port.postMessage(msg.genResp(mainGraphData.map(d => ({
                    name: d.name,
                    start: d.start.toISOString(),
                    end: d.end.toISOString(),
                    data: d.data
                }))));
            })();
            break;
        }
        case MsgType.clearCache: {
            calData = {};
            port.postMessage(msg.genResp(null));
            break;
        }
        case MsgType.fetchCalendars: {
            (async () => {
                let token = await auth.getAuthToken();
                let results = await gapi.getCalendars(token);
                port.postMessage(msg.genResp(results));
            })();
            break;
        }
        case MsgType.fetchColors: {
            (async () => {
                let token = await auth.getAuthToken();
                let results = await gapi.getColors(token);
                port.postMessage(msg.genResp(results));
            })();
            break;
        }
        case MsgType.login: {
            (async () => {
                let succ = true;
                try {
                    await auth.login();
                } catch (_) {
                    succ = false;
                }
                port.postMessage(msg.genResp(succ));
            })();
            break;
        }
        case MsgType.logout: {
            (async () => {
                let succ = true;
                try {
                    await auth.logout();
                } catch (_) {
                    succ = false;
                }
                port.postMessage(msg.genResp(succ));
            })();
            break;
        }
        case MsgType.getLoggedIn: {
            auth.loggedIn().then(b => port.postMessage(msg.genResp(b)));
            break;
        }
        default: console.error("unknown msg opt");
        }
    });
}

loadPromise = (async () => {
    await Promise.all([loadMetadata(), loadCachedCals()]);
    pollSync();
})();

chrome.runtime.onConnect.addListener(handleMsg);

chrome.tabs.onCreated.addListener(function(tab) {
    if (tab.url === "chrome://newtab/") {
        if (config.overrideNewTab) {
            chrome.tabs.update(tab.id, {
                url: chrome.extension.getURL("tab.html")
            });
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.create({ url: "index.html" });
});
