/* global chrome */

import LRU from "lru-cache";

const gapiBase = 'https://www.googleapis.com/calendar/v3';

export enum GApiError {
    invalidSyncToken = "invalidSyncToken",
    invalidAuthToken = "invalidAuthToken",
    notLoggedIn = "notLoggedIn",
    notLoggedOut = "notLoggedOut",
    fetchError = "fetchError",
    otherError = "otherError",
}

function toParams(dict: Object) {
    return Object.entries(dict).filter(([k, v] : string[]) => v)
        .map(([k, v]: string[]) => (
            `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
        )).join('&');
}

async function _getAuthToken(interactive = false): Promise<string> {
    let [token, ok]: [string, boolean] = await new Promise(resolver =>
        chrome.identity.getAuthToken(
            { interactive },
            token => resolver([token, !chrome.runtime.lastError])));
    if (ok) return token;
    else throw GApiError.notLoggedIn;
}

function _removeCachedAuthToken(token: string) {
    return new Promise(resolver =>
        chrome.identity.removeCachedAuthToken({ token }, () => resolver()));
}

export class Auth {
    _loggedIn: boolean;

    constructor() {
        this._loggedIn = null;
    }

    async loggedIn(): Promise<boolean> {
        if (this._loggedIn === null)
        {
            try {
                await _getAuthToken(false);
                this._loggedIn = true;
            } catch(_) {
                this._loggedIn = false;
            }
        }
        return this._loggedIn;
    }

    async getAuthToken(): Promise<string> {
        let b = await this.loggedIn();
        //if (b) return _getAuthToken(false);
        // FIXME: Chrome OS dev has a bug
        if (b) return _getAuthToken(true);
        else throw GApiError.notLoggedIn;
    }

    async login(): Promise<void> {
        let b = await this.loggedIn();
        if (!b) {
            await _getAuthToken(true);
            this._loggedIn = true;
        }
        else throw GApiError.notLoggedOut;
    }

    async logout(): Promise<void> {
        let token = await this.getAuthToken();
        this._loggedIn = false;
        let response = await fetch(
            `https://accounts.google.com/o/oauth2/revoke?${toParams({ token })}`,
            { method: 'GET' });
        //if (response.status === 200)
        await _removeCachedAuthToken(token);
        //else throw GApiError.otherError;
    }
}

export type GCalendarColor = {
    background: string
};

export type GCalendarMeta = {
    name: string,
    color: GCalendarColor,
    enabled: boolean
};

export async function getCalendars(token: string): Promise<any> {
    let response = await fetch(
        `${gapiBase}/users/me/calendarList?${toParams({access_token: token})}`,
        { method: 'GET' });
    try {
        return (await response.json()).items;
    } catch (err) {
        console.log(err);
        throw GApiError.fetchError;
    }
}

export async function getColors(token: string): Promise<any> {
    let response = await fetch(
        `${gapiBase}/colors?${toParams({access_token: token})}`,
        { method: 'GET' });
    try {
        return response.json();
    } catch (err) {
        console.log(err);
        throw GApiError.fetchError;
    }
}

async function getEvent(calId: string, eventId: string, token: string): Promise<any> {
    let response = await fetch(
        `${gapiBase}/calendars/${calId}/events/${eventId}?${toParams({access_token: token})}`,
        { method: 'GET' });
    return response.json();
}

function getEvents(calId: string, token: string,
                syncToken=null as string,
                timeMin=null as string,
                timeMax=null as string,
                resultsPerRequest=100 as number):
                    Promise<{ results: any[], nextSyncToken: string }> {
    let results = [] as any[];
    const singleFetch = async (pageToken: string, syncToken: string):
            Promise<{nextSyncToken: string, results: any[]}> => {
        let response;
        try {
            response = await fetch(`${gapiBase}/calendars/${calId}/events?${toParams({
                access_token: token,
                pageToken,
                syncToken,
                timeMin,
                timeMax,
                maxResults: resultsPerRequest
            })}`, { method: 'GET' });
        } catch (err) {
            console.log(err);
            throw GApiError.fetchError;
        }
        switch (response.status) {
            case 200: {
                let data = await response.json();
                results.push(...data.items);
                if (data.nextPageToken) {
                    return singleFetch(data.nextPageToken, '');
                } else {
                    return ({
                        nextSyncToken: data.nextSyncToken,
                        results
                    });
                }
                break;
            }
            case 410: throw GApiError.invalidSyncToken; break;
            case 401: throw GApiError.invalidAuthToken; break;
            default: throw GApiError.otherError;
        }
    };

    return singleFetch('', syncToken);
}

export type GCalendarOptions = {
    maxCachedItems: number,
    nDaysPerSlot: number,
    largeQuery: number
};

type EventFlat = {
    start: number,
    end: number,
    id: string
};

class Event {
    start: Date;
    end: Date;
    id: string;

    constructor(start: Date, end: Date, id: string) {
        this.start = start;
        this.end = end;
        this.id = id;
    }

    deflate() {
        return {
            start: this.start.getTime(),
            end: this.end.getTime(),
            id: this.id
        };
    }

    static inflate = (obj: EventFlat) => (
        new Event(new Date(obj.start), new Date(obj.end), obj.id)
    );
}

export type GCalendarEventFlat = {
    start: number,
    end: number,
    id: string,
    summary: string
};

export class GCalendarEvent {
    start: Date;
    end: Date;
    id: string;
    summary: string;

    constructor(start: Date, end: Date, id: string, summary: string) {
        this.start = start;
        this.end = end;
        this.id = id;
        this.summary = summary;
    }

    deflate() {
        return {
            start: this.start.getTime(),
            end: this.end.getTime(),
            id: this.id,
            summary: this.summary
        };
    }

    static inflate = (obj: GCalendarEventFlat) => (
        new GCalendarEvent(new Date(obj.start), new Date(obj.end), obj.id, obj.summary)
    );
}

type GCalendarSlot = { [id: string]: Event };
type GCalendarSlotFlat = { [id: string]: EventFlat };

export type GCalendarFlat = {
    calId: string,
    name: string,
    syncToken: string,
    cache: {k: number, v: GCalendarSlotFlat, e: number}[],
    eventMeta: { [id: string]: { keys: number[], summary: string } },
    options: GCalendarOptions,
    divider: number
};

export class GCalendar {
    calId: string;
    name: string;
    syncToken: string;
    cache: LRU<number, GCalendarSlot>;
    eventMeta: { [id: string]: { keys: Set<number>, summary: string } };
    options: GCalendarOptions;
    divider: number;
    auth: Auth;

    constructor(calId: string, name: string, auth: Auth,
                options={maxCachedItems: 100, nDaysPerSlot: 10, largeQuery: 10}) {
        this.calId = calId;
        this.name = name;
        this.auth = auth;
        this.syncToken = '';
        this.cache = new LRU<number, GCalendarSlot>({
            max: options.maxCachedItems,
            dispose: (k, v) => this.onRemoveSlot(k, v)
        });
        this.eventMeta = {};
        this.options = options;
        this.divider = 8.64e7 * this.options.nDaysPerSlot;
    }

    deflate() {
        let cache = this.cache.dump().map(t => {
            let slot: GCalendarSlotFlat = {};
            for (let id in t.v)
                slot[id] = t.v[id].deflate();
            return { k: t.k, v: slot, e: t.e };
        });

        let eventMeta: { [id: string]: { keys: number[], summary: string } } = {};
        for (let id in this.eventMeta) {
            let m = this.eventMeta[id];
            eventMeta[id] = { keys: Array.from(m.keys), summary: m.summary };
        }

        return {
            calId: this.calId,
            name: this.name,
            syncToken: this.syncToken,
            cache,
            eventMeta,
            options: this.options,
            divider: this.divider
        }
    }

    static inflate(obj: GCalendarFlat, auth: Auth) {
        let cache = obj.cache.map(t => {
            let slot: GCalendarSlot = {};
            for (let id in t.v)
                slot[id] = Event.inflate(t.v[id]);
            return { k: t.k, v: slot, e: t.e };
        });

        let eventMeta: { [id: string]: { keys: Set<number>, summary: string } } = {};
        for (let id in obj.eventMeta) {
            let m = obj.eventMeta[id];
            eventMeta[id] = { keys: new Set(m.keys), summary: m.summary };
        }

        let gcal = new GCalendar(obj.calId, obj.name, auth, obj.options);
        gcal.syncToken = obj.syncToken;
        gcal.cache.load(cache);
        gcal.eventMeta = eventMeta;
        gcal.divider = obj.divider;
        return gcal;
    }

    get token() { return this.auth.getAuthToken(); }

    dateToCacheKey(date: Date) {
        return Math.floor(date.getTime() / this.divider);
    }

    dateRangeToCacheKeys(range: { start: Date, end: Date }) {
        return {
            start: this.dateToCacheKey(range.start),
            end: this.dateToCacheKey(new Date(range.end.getTime() - 1))
        };
    }

    getSlot(k: number) {
        if (!this.cache.has(k))
        {
            let res = {};
            this.cache.set(k, res);
            return res;
        }
        else return this.cache.get(k);
    }

    onRemoveSlot(k: number, v: GCalendarSlot) {
        for (let id in v) {
            console.assert(this.eventMeta.hasOwnProperty(id));
            let keys = this.eventMeta[id].keys;
            keys.delete(k);
            if (keys.size === 0)
                delete this.eventMeta[id];
        }
    }

    slotStartDate(k: number) { return new Date(k * this.divider); }
    slotEndDate(k: number) { return new Date((k + 1) * this.divider); }

    addEvent(e: {start: Date, end: Date, id: string, summary: string}, evict = false) {
        //console.log('adding event', e);
        this.removeEvent(e);
        let r = this.dateRangeToCacheKeys(e);
        let ks = r.start;
        let ke = r.end;
        let t = this.cache.length;
        let keys = new Set();
        for (let i = ks; i <= ke; i++)
        {
            keys.add(i);
            if (!this.cache.has(i)) t++;
        }
        this.eventMeta[e.id] = {
            keys,
            summary: e.summary,
        };
        if (!evict && t > this.options.maxCachedItems) return;
        if (ks === ke)
            this.getSlot(ks)[e.id] = new Event(e.start, e.end, e.id);
        else
        {
            this.getSlot(ks)[e.id] = new Event(e.start, this.slotEndDate(ks), e.id);
            this.getSlot(ke)[e.id] = new Event(this.slotStartDate(ke), e.end, e.id);
            for (let k = ks + 1; k < ke; k++)
                this.getSlot(k)[e.id] = new Event(this.slotStartDate(k), this.slotEndDate(k), e.id);
        }
    }

    removeEvent(e: {id: string}) {
        if (!this.eventMeta.hasOwnProperty(e.id))
            return;
        let keys = this.eventMeta[e.id].keys;
        keys.forEach(k => delete this.getSlot(k)[e.id]);
        delete this.eventMeta[e.id];
    }

    getSlotEvents(k: number, r: {start: Date, end: Date}) {
        let s = this.getSlot(k);
        //console.log(s);
        let results = [];
        for (let id in s) {
            if (!(s[id].start >= r.end || s[id].end <= r.start))
            {
                results.push(new GCalendarEvent(
                    s[id].start < r.start ? r.start: s[id].start,
                    s[id].end > r.end ? r.end: s[id].end,
                    id,
                    this.eventMeta[id].summary
                ));
            }
        }
        return results;
    }

    getCachedEvents(_r: {start: Date, end: Date}) {
        let r = this.dateRangeToCacheKeys(_r);
        let ks = r.start;
        let ke = r.end;
        let results = this.getSlotEvents(ks, _r);
        for (let k = ks + 1; k < ke; k++)
        {
            let s = this.getSlot(k);
            for (let id in s)
                results.push(new GCalendarEvent(
                    s[id].start,
                    s[id].end,
                    s[id].id,
                    this.eventMeta[id].summary));
        }
        if (ke > ks)
            results.push(...this.getSlotEvents(ke, _r));
        return results;
    }

    async sync() {
        try {
            let token = await this.token;
            let r = await getEvents(this.calId, token, this.syncToken);
            let results = await Promise.all(
                r.results.map(e => e.start ? Promise.resolve(e) : getEvent(this.calId, e.id, token)));
            results.forEach(e => {
                e.start = new Date(e.start.dateTime);
                e.end = new Date(e.end.dateTime);
                if (e.status === 'confirmed')
                    this.addEvent(e);
                else if (e.status === 'cancelled')
                    this.removeEvent(e);
            });
            this.syncToken = r.nextSyncToken;
        } catch(err) {
            if (err === GApiError.invalidSyncToken) {
                this.syncToken = '';
                this.sync();
            } else throw err;
        }
    }

    async getEvents(start: Date, end: Date, sync = false): Promise<{ events: GCalendarEvent[], changed: boolean }> {
        let r = this.dateRangeToCacheKeys({ start, end });
        let query = {
            start: null as number,
            end: null as number
        };
        for (let k = r.start; k <= r.end; k++)
            if (!this.cache.has(k))
            {
                if (query.start === null)
                    query.start = k;
                query.end = k;
            }
        //console.log(`start: ${start} end: ${end}`);
        if (query.start !== null)
        {
            console.assert(query.start <= query.end);
            if (query.end - query.start + 1 > this.options.largeQuery) {
                console.log(`encounter large query, use direct fetch`);
                let token = await this.token;
                let r = await getEvents(this.calId, token, null,
                                        start.toISOString(), end.toISOString());
                let events = r.results.map(e => {
                    console.assert(e.start);
                    e.start = new Date(e.start.dateTime);
                    e.end = new Date(e.end.dateTime);
                    return e;
                }).filter(e => !(e.start >= end || e.end <= start)).map(e => (
                    new GCalendarEvent(
                        e.start < start ? start: e.start,
                        e.end > end ? end: e.end,
                        e.id,
                        e.summary)
                ));
                return { events, changed: false };
            }

            console.log(`fetching short event list`);
            let token = await this.token;
            let r = await getEvents(this.calId, token, null,
                                    this.slotStartDate(query.start).toISOString(),
                                    this.slotEndDate(query.end).toISOString());
            r.results.forEach(e => {
                if (e.status === 'confirmed')
                {
                    console.assert(e.start);
                    e.start = new Date(e.start.dateTime);
                    e.end = new Date(e.end.dateTime);
                    this.addEvent(e, true);
                }
            });
            if (this.syncToken === '')
                this.syncToken = r.nextSyncToken;
            if (sync) await this.sync();
            let events = await this.getCachedEvents({ start, end });
            return { events, changed: true };
        }
        else
        {
            console.log(`cache hit`);
            if (sync) await this.sync();
            let events = await this.getCachedEvents({ start, end });
            return { events, changed: false };
        }
    }
}
