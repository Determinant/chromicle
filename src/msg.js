/* global chrome */
const _updatePatterns = "updatePatterns";
const _getPatterns = "getPatterns";
const _updateCalendars = "updateCalendars";
const _getCalendars = "getCalendars";
const _getCalEvents = "getCalEvents";

export const msgType = Object.freeze({
    updatePatterns: Symbol(_updatePatterns),
    getPatterns: Symbol(_getPatterns),
    updateCalendars: Symbol(_updateCalendars),
    getCalendars: Symbol(_getCalendars),
    getCalEvents: Symbol(_getCalEvents),
});

function stringifyMsgType(mt) {
    switch (mt) {
        case msgType.updatePatterns: return _updatePatterns;
        case msgType.getPatterns: return _getPatterns;
        case msgType.updateCalendars: return _updateCalendars;
        case msgType.getCalendars: return _getCalendars;
        case msgType.getCalEvents: return _getCalEvents;
    }
}

function parseMsgType(s) {
    switch(s) {
        case _updatePatterns: return msgType.updatePatterns;
        case _getPatterns: return msgType.getPatterns;
        case _updateCalendars: return msgType.updateCalendars;
        case _getCalendars: return msgType.getCalendars;
        case _getCalEvents: return msgType.getCalEvents;
    }
}

export class Msg {
    constructor(id, type, data) {
        this.id = id;
        this.type = type;
        this.data = data;
    }
    genResp(data) { return new Msg(this.id, this.type, data); }
    deflate() {
        return {
            id: this.id,
            type: stringifyMsgType(this.type),
            data: this.data
        }
    }
    static inflate = obj => new Msg(obj.id, parseMsgType(obj.type), obj.data);
}

export class MsgClient {
    constructor(channelName) {
        let port = chrome.runtime.connect({name: channelName});
        const getCallBack = rcb => this.requestCallback;
        port.onMessage.addListener(function(msg) {
            console.log(msg);
            let rcb = getCallBack(msg.type);
            let cb = rcb.inFlight[msg.id];
            console.assert(cb !== undefined);
            rcb.ids.push(msg.id);
            cb(msg);
        });
        this.port = port;
        this.requestCallback = {inFlight: {}, ids: [], maxId: 0};
    }

    sendMsg = ({ type, data }) => {
        let rcb = this.requestCallback;
        let cb;
        let pm = new Promise(resolve => { cb = resolve; });
        let id;
        if (rcb.ids.length > 0) {
            id = rcb.ids.pop();
        } else {
            id = rcb.maxId++;
        }
        rcb.inFlight[id] = cb;
        this.port.postMessage((new Msg(id, type, data)).deflate());
        return pm;
    }
}
