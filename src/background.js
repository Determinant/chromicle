import * as gapi from './gapi';

let patterns = [];
let calendars = {};
let calData = {};

chrome.runtime.onConnect.addListener(function(port) {
    console.assert(port.name == 'main');
    port.onMessage.addListener(function(msg) {
        console.log(msg);
        if (msg.type == 0) {
            patterns = msg.data;
        }
        else if (msg.type == 1) {
            port.postMessage({ id: msg.id, type: 1, data: patterns });
        }
        else if (msg.type == 2) {
            calendars = msg.data;
        }
        else if (msg.type == 3) {
            port.postMessage({ id: msg.id, type: 3, data: calendars });
        }
        else if (msg.type == 4) {
            calData[msg.data.id].getEvents(new Date(msg.data.start), new Date(msg.data.end))
                .catch(e => {
                    console.log(`cannot load calendar ${msg.data.id}`, e);
                    return [];
                })
                .then(data => {
                console.log(data);
                let resp = { id: msg.id, type: 4, data: data.map(e => {
                    return {
                        id: e.id,
                        start: e.start.getTime(),
                        end: e.end.getTime()
                    }
                })};
                console.log(resp);
                port.postMessage(resp);
            });
        }
        else if (msg.type == 5) {
            calendars = msg.data;
            for (let id in calendars) {
                if (!calData.hasOwnProperty(id))
                    calData[id] = new gapi.GCalendar(id, calendars[id].summary);
            }
        }
        else {
            console.error("unknown msg type");
        }
    });
});

chrome.browserAction.onClicked.addListener(function() {
    chrome.tabs.create({url: 'index.html'});
});

