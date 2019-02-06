import * as gapi from './gapi';
import { msgType, Msg } from './msg';

let mainPatterns = [];
let analyzePatterns = [];
let calendars = {};
let calData = {};

chrome.runtime.onConnect.addListener(function(port) {
    console.assert(port.name == 'main');
    port.onMessage.addListener(function(_msg) {
        let msg = Msg.inflate(_msg);
        console.log(msg);
        if (msg.type == msgType.updatePatterns) {
            if (msg.data.id == 'analyze')
                analyzePatterns = msg.data.patterns;
            else
                mainPatterns = msg.data.patterns;
            port.postMessage(msg.genResp(null));
        }
        else if (msg.type == msgType.getPatterns) {
            let patterns;
            if (msg.data.id == 'analyze')
                patterns = analyzePatterns;
            else
                patterns = mainPatterns;
            port.postMessage(msg.genResp(patterns));
        }
        else if (msg.type == msgType.updateCalendars) {
            calendars = msg.data;
            for (let id in calendars) {
                if (!calData.hasOwnProperty(id))
                    calData[id] = new gapi.GCalendar(id, calendars[id].summary);
            }
            port.postMessage(msg.genResp(null));
        }
        else if (msg.type == msgType.getCalendars) {
            let cals = calendars;
            if (msg.data.enabledOnly)
            {
                cals = Object.keys(calendars)
                    .filter(id => calendars[id].enabled)
                    .reduce((res, id) => (res[id] = calendars[id], res), {});
            }
            port.postMessage(msg.genResp(cals));
        }
        else if (msg.type == msgType.getCalEvents) {
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
        }
        else {
            console.error("unknown msg type");
        }
    });
});

chrome.browserAction.onClicked.addListener(function() {
    chrome.tabs.create({url: 'index.html'});
});

