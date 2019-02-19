/* global chrome */

export enum MsgType {
    updatePatterns = "updatePatterns",
    getPatterns = "getPatterns",
    updateCalendars = "updateCalendars",
    getCalendars = "getCalendars",
    getCalEvents = "getCalEvents",
    updateConfig = "updateConfig",
    getConfig = "getConfig",
    getGraphData = "getGraphData",
    clearCache = "clearCache"
}

function stringifyMsgType(opt: MsgType): string { return MsgType[opt]; }

function parseMsgType(s: string): MsgType {
    switch (s) {
        case "updatePatterns": return MsgType.updatePatterns;
        case "getPatterns": return MsgType.getPatterns;
        case "updateCalendars" : return MsgType.updateCalendars;
        case "getCalendars": return MsgType.getCalendars;
        case "getCalEvents": return MsgType.getCalEvents;
        case "updateConfig": return MsgType.updateConfig;
        case "getConfig": return MsgType.getConfig;
        case "getGraphData": return MsgType.getGraphData;
        case "clearCache": return MsgType.clearCache;
        default: console.error(`unknown MsgType: ${s}`);
    }
}

export class Msg<T> {
    id: number;
    opt: MsgType;
    data: T;
    constructor(id: number, opt: MsgType, data: T) {
        this.id = id;
        this.opt = opt;
        this.data = data;
    }
    genResp(data: T) { return new Msg(this.id, this.opt, data); }
    deflate() {
        return {
            id: this.id,
            opt: stringifyMsgType(this.opt),
            data: this.data
        }
    }
    static inflate = <T>(obj: {id: number, opt: MsgType, data: T}) => (
        new Msg(obj.id, parseMsgType(obj.opt), obj.data)
    );
}

export class MsgClient {
    requestCallback: {
        ids: number[],
        inFlight: {[id: number]: (msg: Msg<any>) => void; },
        maxId: number
    };
    port: chrome.runtime.Port;

    constructor(channelName: string) {
        let port = chrome.runtime.connect({name: channelName});
        this.requestCallback = {inFlight: {}, ids: [], maxId: 0};
        const rcb = this.requestCallback;
        port.onMessage.addListener((msg) => {
            console.log(msg);
            let cb = rcb.inFlight[msg.id];
            console.assert(cb !== undefined);
            rcb.ids.push(msg.id);
            cb(msg);
        });
        this.port = port;
    }

    sendMsg({ opt, data }: { opt: MsgType, data: any }): Promise<Msg<any>> {
        const rcb = this.requestCallback;
        let cb;
        let pm = new Promise<Msg<any>>(resolve => { cb = resolve; });
        let id;
        if (rcb.ids.length > 0) {
            id = rcb.ids.pop();
        } else {
            id = rcb.maxId++;
        }
        rcb.inFlight[id] = cb;
        this.port.postMessage((new Msg(id, opt, data)).deflate());
        return pm;
    }
}
