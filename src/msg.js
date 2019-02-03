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