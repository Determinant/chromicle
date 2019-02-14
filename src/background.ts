import * as gapi from './gapi';
import { MsgType, Msg } from './msg';
import { Duration, TrackPeriod, TrackPeriodFlat } from './duration';
import moment from 'moment';
import { GraphData, getGraphData } from './graph';
import { PatternEntry, PatternEntryFlat } from './pattern';

let mainPatterns: PatternEntry[] = [];
let analyzePatterns: PatternEntry[] = [];
let calendars: {[id: string]: gapi.GCalendarMeta} = {};
let calData: {[id: string]: gapi.GCalendar} = {};
let config = {
    trackedPeriods: [
        new TrackPeriod('Today', Duration.days(1), Duration.days(0)),
        new TrackPeriod('Yesterday', Duration.days(2), Duration.days(1)),
        new TrackPeriod('This Week', Duration.weeks(1), Duration.weeks(0)),
        new TrackPeriod('This Month', Duration.months(1), Duration.months(0))] as TrackPeriod[]
};
let mainGraphData: GraphData[] = [];
let dirtyMetadata = false;

function loadMetadata() {
    return new Promise(resolver => chrome.storage.local.get([
        'calendars', 'config', 'mainPatterns', 'analyzePatterns',
    ], function(items) {
        if (chrome.runtime.lastError)
            console.error("error while loading saved metadata");
        else if (!items.hasOwnProperty('config'))
            console.log("no saved metadata");
        else
        {
            console.log('metadata loaded');
            config = {
                trackedPeriods: items.config.trackedPeriods.map((p: TrackPeriod) => ({
                    name: p.name,
                    start: Duration.inflate(p.start),
                    end: Duration.inflate(p.end),
                }))
            };
            calendars = items.calendars;
            mainPatterns = items.mainPatterns.map((p: PatternEntryFlat) => PatternEntry.inflate(p));
            analyzePatterns = items.analyzePatterns.map((p: PatternEntryFlat) => PatternEntry.inflate(p));
        }
        resolver();
    }));
}

function saveMetadata() {
    return new Promise(resolver => chrome.storage.local.set({
        calendars,
        config: {
            trackedPeriods: config.trackedPeriods.map(p => ({
                name: p.name,
                start: p.start.deflate(),
                end: p.end.deflate()
            }))
        },
        mainPatterns: mainPatterns.map(p => p.deflate()),
        analyzePatterns: analyzePatterns.map(p => p.deflate())
    }, function() {
        console.log('metadata saved');
        resolver();
    }));
}

async function getCalEvents(id: string, start: Date, end: Date) {
    if (!calData.hasOwnProperty(id))
        calData[id] = new gapi.GCalendar(id, calendars[id].name);
    try {
        let res = await calData[id].getEvents(new Date(start), new Date(end));
        return res;
    } catch(err) {
        console.log(`cannot load calendar ${id}`, err);
        calendars[id].enabled = false;
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
        let start = moment().endOf('day');
        if (endD.valueOf() == 0) {
            switch (p.start.unit) {
                case 'days': start = moment().endOf('day'); break;
                case 'weeks': start = moment().endOf('week'); break;
                case 'months': start = moment().endOf('month'); break;
                default:
            }
        }
        let end = start.clone();
        start.subtract(startD);
        end.subtract(endD);
        pms.push(getGraphData(
            start.toDate(), end.toDate(), mainPatterns, calendars,
            getCalEvents
        ).then(results => {
            mainGraphData[i] = {
                    name: p.name,
                    start: start.toDate(),
                    end: end.toDate(),
                    data: results.patternGraphData
            };
        }));
    }
    return Promise.all(pms);
}

async function pollSync() {
    console.log('poll');
    await updateMainGraphData();
    if (dirtyMetadata)
        await saveMetadata().then(() => dirtyMetadata = false);
    return new Promise(resolver => (
        window.setTimeout(() => { resolver(); pollSync();}, 10000)
    ));
}

loadMetadata().then(() => pollSync());

chrome.runtime.onConnect.addListener(function(port) {
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
                let resp = msg.genResp(data.map(e => {
                    return {
                        id: e.id,
                        start: e.start.getTime(),
                        end: e.end.getTime()
                    }
                }));
                console.log(resp);
                port.postMessage(resp);
            });
            break;
        }
        case MsgType.updateConfig: {
            config.trackedPeriods = msg.data.trackedPeriods.map((p: TrackPeriodFlat) => ({
                name: p.name,
                start: Duration.inflate(p.start),
                end: Duration.inflate(p.end)
            }));
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case MsgType.getConfig: {
            let res: {[prop: string]: any} = {};
            msg.data.forEach((prop: string) => {
                if (prop == 'trackedPeriods')
                    res.trackedPeriods = config.trackedPeriods.map(p => p.deflate())
            });
            port.postMessage(msg.genResp(res));
            break;
        }
        case MsgType.getGraphData: {
            (msg.data.sync ? updateMainGraphData().then(() => {}) : Promise.resolve()).then(() => (
                port.postMessage(msg.genResp(mainGraphData.map(d => ({
                    name: d.name,
                    start: d.start.toISOString(),
                    end: d.end.toISOString(),
                    data: d.data
                }))))
            ));
            break;
        }
        default: console.error("unknown msg opt");
        }
    });
});
