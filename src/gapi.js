/* global chrome */
import LRU from "lru-cache";
const gapi_base = 'https://www.googleapis.com/calendar/v3';

const GApiError = Object.freeze({
    invalidSyncToken: Symbol("invalidSyncToken"),
    notLoggedIn: Symbol("notLoggedIn"),
    notLoggedOut: Symbol("notLoggedOut"),
    otherError: Symbol("otherError"),
});

function to_params(dict) {
    return Object.entries(dict).filter(([k, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

let loggedIn = null;

function _getAuthToken(interactive = false) {
    return new Promise(resolver =>
        chrome.identity.getAuthToken(
            { interactive }, token => resolver([token, !chrome.runtime.lastError])))
            .then(([token, ok]) => {
                if (ok) return token;
                else throw GApiError.notLoggedIn;
            });
}

function _removeCachedAuthToken(token) {
    return new Promise(resolver =>
        chrome.identity.removeCachedAuthToken({ token }, () => resolver()));
}

export function getLoggedIn() {
    if (loggedIn === null)
    {
        return _getAuthToken(false)
            .then(() => loggedIn = true)
            .catch(() => loggedIn = false)
            .then(() => loggedIn);
    }
    else return Promise.resolve(loggedIn);
}

export function getAuthToken() {
    return getLoggedIn().then(b => {
        if (b) return _getAuthToken(false);
        else throw GApiError.notLoggedIn;
    });
}

export function login() {
    return getLoggedIn().then(b => {
        if (!b) return _getAuthToken(true).then(() => loggedIn = true);
        else throw GApiError.notLoggedOut;
    });
}

export function logout() {
    return getAuthToken().then(token => {
        return fetch(`https://accounts.google.com/o/oauth2/revoke?${to_params({ token })}`,
                    { method: 'GET', async: true }).then(response => {
            //if (response.status === 200)
            return _removeCachedAuthToken(token);
            //else throw GApiError.otherError;
        });
    }).then(() => loggedIn = false);
}

export function getCalendars(token) {
    return fetch(`${gapi_base}/users/me/calendarList?${to_params({access_token: token})}`,
            { method: 'GET', async: true })
        .then(response => response.json())
        .then(data => data.items);
}

export function getColors(token) {
    return fetch(`${gapi_base}/colors?${to_params({access_token: token})}`,
        { method: 'GET', async: true })
        .then(response => response.json());
}

function getEvent(calId, eventId, token) {
    return fetch(`${gapi_base}/calendars/${calId}/events/${eventId}?${to_params({access_token: token})}`,
        { method: 'GET', async: true })
        .then(response => response.json());
}

function getEvents(calId, token, syncToken=null, timeMin=null, timeMax=null, resultsPerRequest=100) {
    let results = [];
    const singleFetch = (pageToken, syncToken) => fetch(`${gapi_base}/calendars/${calId}/events?${to_params({
            access_token: token,
            pageToken,
            syncToken,
            timeMin,
            timeMax,
            maxResults: resultsPerRequest
        })}`, { method: 'GET', async: true })
            .then(response => {
                if (response.status === 200)
                    return response.json();
                else if (response.status === 410)
                    throw GApiError.invalidSyncToken;
                else throw GApiError.otherError;
            })
            .then(data => {
                results.push(...data.items);
                if (data.nextPageToken) {
                    return singleFetch(data.nextPageToken, '');
                } else {
                    return ({
                        nextSyncToken: data.nextSyncToken,
                        results
                    });
                }
            })

    return singleFetch('', syncToken);
}

export class GCalendar {
    constructor(calId, name, options={maxCachedItems: 100, nDaysPerSlot: 10, largeQuery: 10}) {
        this.calId = calId;
        this.name = name;
        this.syncToken = '';
        this.cache = new LRU({
            max: options.maxCachedItems,
            dispose: (k, v) => this.onRemoveSlot(k, v)
        });
        this.eventMeta = {};
        this.options = options;
        this.divider = 8.64e7 * this.options.nDaysPerSlot;
    }

    get token() { return getAuthToken(); }

    dateToCacheKey(date) {
        return Math.floor(date / this.divider);
    }

    dateRangeToCacheKeys(range) {
        return {
            start: this.dateToCacheKey(range.start),
            end: this.dateToCacheKey(new Date(range.end.getTime() - 1))
        };
    }

    getSlot(k) {
        if (!this.cache.has(k))
        {
            let res = {};
            this.cache.set(k, res);
            return res;
        }
        else return this.cache.get(k);
    }

    onRemoveSlot(k, v) {
        for (let id in v) {
            console.assert(this.eventMeta[id]);
            let keys = this.eventMeta[id].keys;
            keys.delete(k);
            if (keys.size === 0)
                delete this.eventMeta[id];
        }
    }

    slotStartDate(k) { return new Date(k * this.divider); }
    slotEndDate(k) { return new Date((k + 1) * this.divider); }

    addEvent(e, evict = false) {
        //console.log('adding event', e);
        if (this.eventMeta.hasOwnProperty(e.id))
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
            this.getSlot(ks)[e.id] = {
                start: e.start,
                end: e.end,
                id: e.id };
        else
        {
            this.getSlot(ks)[e.id] = {
                start: e.start,
                end: this.slotEndDate(ks),
                id: e.id };
            this.getSlot(ke)[e.id] = {
                start: this.slotStartDate(ke),
                end: e.end,
                id: e.id };
            for (let k = ks + 1; k < ke; k++)
                this.getSlot(k)[e.id] = {
                    start: this.slotStartDate(k),
                    end: this.slotEndDate(k),
                    id: e.id};
        }
    }

    removeEvent(e) {
        let keys = this.eventMeta[e.id].keys;
        console.assert(keys);
        keys.forEach(k => delete this.getSlot(k)[e.id]);
        delete this.eventMeta[e.id];
    }

    getSlotEvents(k, start, end) {
        let s = this.getSlot(k);
        //console.log(s);
        let results = [];
        for (let id in s) {
            if (!(s[id].start >= end || s[id].end <= start))
            {
                results.push({
                    id,
                    start: s[id].start < start ? start: s[id].start,
                    end: s[id].end > end ? end: s[id].end,
                    summary: this.eventMeta[id].summary
                });
            }
        }
        return results;
    }

    getCachedEvents(_r) {
        let r = this.dateRangeToCacheKeys(_r);
        let ks = r.start;
        let ke = r.end;
        let results = this.getSlotEvents(ks, _r.start, _r.end);
        for (let k = ks + 1; k < ke; k++)
        {
            let s = this.getSlot(k);
            for (let id in s)
                results.push(s[id]);
        }
        if (ke > ks)
            results.push(...this.getSlotEvents(ke, _r.start, _r.end));
        return results;
    }

    sync() {
        return this.token.then(token => getEvents(this.calId, token, this.syncToken).then(r => {
            let pms = r.results.map(e => e.start ? Promise.resolve(e) : getEvent(this.calId, e.id, token));
            return Promise.all(pms).then(results => {
                results.forEach(e => {
                    e.start = new Date(e.start.dateTime);
                    e.end = new Date(e.end.dateTime);
                    if (e.status === 'confirmed')
                        this.addEvent(e);
                    else if (e.status === 'cancelled')
                        this.removeEvent(e);
                });
                this.syncToken = r.nextSyncToken;
            });
        })).catch(e => {
            if (e === GApiError.invalidSyncToken) {
                this.syncToken = '';
                this.sync();
            } else throw e;
        });
    }

    getEvents(start, end) {
        let r = this.dateRangeToCacheKeys({ start, end });
        let query = {};
        for (let k = r.start; k <= r.end; k++)
            if (!this.cache.has(k))
            {
                if (!query.hasOwnProperty('start'))
                    query.start = k;
                query.end = k;
            }
        //console.log(`start: ${start} end: ${end}`);
        if (query.hasOwnProperty('start'))
        {
            console.assert(query.start <= query.end);
            if (query.end - query.start + 1 > this.options.largeQuery) {
                console.log(`encounter large query, use direct fetch`);
                return this.token.then(token => getEvents(this.calId, token, null,
                        start.toISOString(), end.toISOString()).then(r => {
                    let results = [];
                    r.results.forEach(e => {
                        console.assert(e.start);
                        e.start = new Date(e.start.dateTime);
                        e.end = new Date(e.end.dateTime);
                        results.push(e);
                    });
                    return results.filter(e => !(e.start >= end || e.end <= start)).map(e => {
                        return {
                            id: e.id,
                            start: e.start < start ? start: e.start,
                            end: e.end > end ? end: e.end,
                            summary: e.summary,
                        };
                    });
                }));
            }

            console.log(`fetching short event list`);
            return this.token.then(token => getEvents(this.calId, token, null,
                this.slotStartDate(query.start).toISOString(),
                this.slotEndDate(query.end).toISOString()).then(r => {
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
                })).then(() => this.sync())
                .then(() => this.getCachedEvents({ start, end }));
        }
        else
        {
            console.log(`cache hit`);
            return this.sync().then(() => this.getCachedEvents({ start, end }));
        }
    }
}
