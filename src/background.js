import * as gapi from './gapi';
import { msgType, Msg } from './msg';

let patterns = [];
let calendars = {};
let calData = {};

chrome.runtime.onConnect.addListener(function(port) {
    console.assert(port.name == 'main');
    port.onMessage.addListener(function(_msg) {
        let msg = Msg.inflate(_msg);
        console.log(msg);
        if (msg.type == msgType.updatePatterns) {
            patterns = msg.data;
        }
        else if (msg.type == msgType.getPatterns) {
            port.postMessage(msg.genResp(patterns));
        }
        else if (msg.type == msgType.updateCalendars) {
            calendars = msg.data;
            for (let id in calendars) {
                if (!calData.hasOwnProperty(id))
                    calData[id] = new gapi.GCalendar(id, calendars[id].summary);
            }
        }
        else if (msg.type == msgType.getCalendars) {
            port.postMessage(msg.genResp(calendars));
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

