import * as gapi from './gapi';
import { msgType, Msg } from './msg';
import { Duration } from './duration';
import moment from 'moment';
import { getChartData } from './Chart';
import { PatternEntry } from './pattern';

let mainPatterns = [];
let analyzePatterns = [];
let calendars = {};
let calData = {};
let config = {
    trackedPeriods: [
        {name: 'Today', start: Duration.days(1), end: Duration.days(0)},
        {name: 'Yesterday', start: Duration.days(2), end: Duration.days(1)},
        {name: 'This Week', start: Duration.weeks(1), end: Duration.weeks(0)},
        {name: 'This Month', start: Duration.months(1), end: Duration.months(0)}]
};
let mainGraphData = [];
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
                trackedPeriods: items.config.trackedPeriods.map(p => ({
                    name: p.name,
                    start: Duration.inflate(p.start),
                    end: Duration.inflate(p.end),
                }))
            };
            calendars = items.calendars;
            mainPatterns = items.mainPatterns.map(p => PatternEntry.inflate(p));
            analyzePatterns = items.analyzePatterns.map(p => PatternEntry.inflate(p));
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

function getCalEvents(id, start, end) {
    if (!calData.hasOwnProperty(id))
        calData[id] = new gapi.GCalendar(id, calendars[id].summary);
    return calData[id].getEvents(new Date(start), new Date(end))
        .catch(e => {
            console.log(`cannot load calendar ${id}`, e);
            calendars[id].enabled = false;
            return [];
        });
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
        pms.push(getChartData(
            start.toDate(),
            end.toDate(),
            mainPatterns,
            calendars,
            (id, start,end) => getCalEvents(id, start, end).then(d => d.map(e => ({
                id: e.id,
                start: e.start.getTime(),
                end: e.end.getTime()
            })))).then(results => {
            mainGraphData[i] = {
                name: p.name, start, end,
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
    port.onMessage.addListener(function(_msg) {
        let msg = Msg.inflate(_msg);
        console.log(msg);
        switch (msg.type) {
        case msgType.updatePatterns: {
            let patterns = msg.data.patterns.map(p => PatternEntry.inflate(p));
            if (msg.data.id == 'analyze')
                analyzePatterns = patterns;
            else
                mainPatterns = patterns;
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case msgType.getPatterns: {
            let patterns;
            if (msg.data.id == 'analyze')
                patterns = analyzePatterns;
            else
                patterns = mainPatterns;
            port.postMessage(msg.genResp(patterns.map(p => p.deflate())));
            break;
        }
        case msgType.updateCalendars: {
            calendars = msg.data;
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case msgType.getCalendars: {
            let cals = calendars;
            if (msg.data.enabledOnly)
            {
                cals = Object.keys(calendars)
                    .filter(id => calendars[id].enabled)
                    .reduce((res, id) => (res[id] = calendars[id], res), {});
            }
            port.postMessage(msg.genResp(cals));
            break;
        }
        case msgType.getCalEvents: {
            getCalEvents(msg.data.id, msg.data.start, msg.data.end).then(data => {
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
        case msgType.updateConfig: {
            config.trackedPeriods = msg.data.trackedPeriods.map(p => ({
                name: p.name,
                start: Duration.inflate(p.start),
                end: Duration.inflate(p.end)
            }));
            dirtyMetadata = true;
            port.postMessage(msg.genResp(null));
            break;
        }
        case msgType.getConfig: {
            let res = {};
            msg.data.forEach(prop => res[prop] = config[prop]);
            port.postMessage(msg.genResp(res));
            break;
        }
        case msgType.getGraphData: {
            (msg.data.sync ? updateMainGraphData() : Promise.resolve()).then(() => (
                port.postMessage(msg.genResp(mainGraphData.map(d => ({
                    name: d.name,
                    start: d.start.toISOString(),
                    end: d.end.toISOString(),
                    data: d.data
                }))))
            ));
            break;
        }
        default: console.error("unknown msg type");
        }
    });
});
