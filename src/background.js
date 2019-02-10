import * as gapi from './gapi';
import { msgType, Msg } from './msg';
import { Duration } from './duration';

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

chrome.runtime.onConnect.addListener(function(port) {
    console.assert(port.name == 'main');
    port.onMessage.addListener(function(_msg) {
        let msg = Msg.inflate(_msg);
        console.log(msg);
        switch (msg.type) {
        case msgType.updatePatterns: {
            if (msg.data.id == 'analyze')
                analyzePatterns = msg.data.patterns;
            else
                mainPatterns = msg.data.patterns;
            port.postMessage(msg.genResp(null));
            break;
        }
        case msgType.getPatterns: {
            let patterns;
            if (msg.data.id == 'analyze')
                patterns = analyzePatterns;
            else
                patterns = mainPatterns;
            port.postMessage(msg.genResp(patterns));
            break;
        }
        case msgType.updateCalendars: {
            calendars = msg.data;
            for (let id in calendars) {
                if (!calData.hasOwnProperty(id))
                    calData[id] = new gapi.GCalendar(id, calendars[id].summary);
            }
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
            calData[msg.data.id].getEvents(new Date(msg.data.start), new Date(msg.data.end))
                .catch(e => {
                    console.log(`cannot load calendar ${msg.data.id}`, e);
                    return [];
                })
                .then(data => {
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
            for (let prop in msg.data)
                config[prop] = msg.data[prop];
            port.postMessage(msg.genResp(null));
            break;
        }
        case msgType.getConfig: {
            let res = {};
            msg.data.forEach(prop => res[prop] = config[prop]);
            port.postMessage(msg.genResp(res));
            break;
        }
        default: console.error("unknown msg type");
        }
    });
});

chrome.browserAction.onClicked.addListener(function() {
    chrome.tabs.create({url: 'index.html'});
});

