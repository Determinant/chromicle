/* global chrome */

export enum MsgType {
    updatePatterns = "updatePatterns",
    getPatterns = "getPatterns",
    updateCalendars = "updateCalendars",
    getCalendars = "getCalendars",
    getCalEvents = "getCalEvents",
    updateConfig = "updateConfig",
    getConfig = "getConfig",
    getGraphData = "getGraphData"
}

function stringifyMsgType(mt: MsgType): string { return MsgType[mt]; }

function parseMsgType(s: string): MsgType {
    switch (s) {
        case "updatePatterns": return MsgType.updatePatterns;
        case "getPatterns": return MsgType.getPatterns;
        case "updateCalendars" : return MsgType.updateCalendars;
        case "getCalendars": return MsgType.getCalendars;
        case "updateConfig": return MsgType.updateConfig;
        case "getConfig": return MsgType.getConfig;
        case "getGraphData": return MsgType.getGraphData;
        default: console.error("unreachable");
    }
}

export class Msg<T> {
    id: number;
    mt: MsgType;
    data: T;
    constructor(id: number, mt: MsgType, data: T) {
        this.id = id;
        this.mt = mt;
        this.data = data;
    }
    genResp(data: T) { return new Msg(this.id, this.mt, data); }
    deflate() {
        return {
            id: this.id,
            mt: stringifyMsgType(this.mt),
            data: this.data
        }
    }
    static inflate = <T>(obj: {id: number, mt: MsgType, data: T}) => (
        new Msg(obj.id, parseMsgType(obj.mt), obj.data)
    );
}

export class MsgClient {
    requestCallback: {
        ids: number[],
        inFlight: {[id: number]: (msg: Msg<any>) => any; },
        maxId: number
    };
    port: chrome.runtime.Port;

    constructor(channelName: string) {
        let port = chrome.runtime.connect({name: channelName});
        const rcb = this.requestCallback;
        port.onMessage.addListener(function(msg) {
            console.log(msg);
            let cb = rcb.inFlight[msg.id];
            console.assert(cb !== undefined);
            rcb.ids.push(msg.id);
            cb(msg);
        });
        this.port = port;
        this.requestCallback = {inFlight: {}, ids: [], maxId: 0};
    }

    sendMsg({ mt, data }: { mt: MsgType, data: any }) {
        const rcb = this.requestCallback;
        let cb;
        let pm = new Promise(resolve => { cb = resolve; });
        let id;
        if (rcb.ids.length > 0) {
            id = rcb.ids.pop();
        } else {
            id = rcb.maxId++;
        }
        rcb.inFlight[id] = cb;
        this.port.postMessage((new Msg(id, mt, data)).deflate());
        return pm;
    }
}
