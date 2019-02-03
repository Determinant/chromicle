/* global chrome */
const gapi_base = 'https://www.googleapis.com/calendar/v3';

const GApiError = {
    invalidSyncToken: 1,
    otherError: 2,
};

function to_params(dict) {
    return Object.entries(dict).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function getAuthToken() {
    return new Promise(resolver =>
        chrome.identity.getAuthToken(
            {interactive: true}, token => resolver(token)));
}

function getCalendars(token) {
    return fetch(`${gapi_base}/users/me/calendarList?${to_params({access_token: token})}`,
            { method: 'GET', async: true })
        .then(response => response.json())
        .then(data => data.items);
}

function getColors(token) {
    return fetch(`${gapi_base}/colors?${to_params({access_token: token})}`,
        { method: 'GET', async: true })
        .then(response => response.json());
}

function getEvent(calId, eventId, token) {
    return fetch(`${gapi_base}/calendars/${calId}/events/${eventId}?${to_params({access_token: token})}`,
        { method: 'GET', async: true })
        .then(response => response.json());
}

function getEvents(calId, token, syncToken, resultsPerRequest=100) {
    let results = [];
    const singleFetch = (pageToken, syncToken) => fetch(`${gapi_base}/calendars/${calId}/events?${to_params({
            access_token: token,
            pageToken,
            syncToken,
            maxResults: resultsPerRequest
        })}`, { method: 'GET', async: true })
            .then(response => {
                if (response.status === 200)
                    return response.json();
                else if (response.status == 410)
                    throw GApiError.invalidSyncToken;
                else throw GApiError.otherErrors;
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

class GCalendar {
    constructor(calId, name) {
        this.calId = calId;
        this.name = name;
        this.token = getAuthToken();
        this.syncToken = '';
        this.cache = {};
    }

    static dateToCacheKey(date) {
        return Math.floor(date / 8.64e7);
    }

    getSlot(k) {
        if (!this.cache[k])
            this.cache[k] = {};
        return this.cache[k];
    }

    static slotStartDate(k) { return new Date(k * 8.64e7); }
    static slotEndDate(k) { return new Date((k + 1) * 8.64e7); }

    addEvent(e) {
        let ks = GCalendar.dateToCacheKey(e.start);
        let ke = GCalendar.dateToCacheKey(new Date(e.end.getTime() - 1));
        if (ks === ke)
            this.getSlot(ks)[e.id] = {
                start: e.start,
                end: e.end,
                id: e.id,
                summary: e.summary};
        else
        {
            this.getSlot(ks)[e.id] = {
                start: e.start,
                end: GCalendar.slotEndDate(ks),
                id: e.id,
                summary: e.summary};
            this.getSlot(ke)[e.id] = {
                start: GCalendar.slotStartDate(ke),
                end: e.end,
                id: e.id,
                summary: e.summary};
            for (let k = ks + 1; k < ke; k++)
                this.getSlot(k)[e.id] = {
                    start: GCalendar.slotStartDate(k),
                    end: GCalendar.slotEndDate(k),
                    id: e.id,
                    summary: e.summary};
        }
    }

    removeEvent(e) {
        let ks = GCalendar.dateToCacheKey(e.start);
        let ke = GCalendar.dateToCacheKey(new Date(e.end.getTime() - 1));
        for (let k = ks; k <= ke; k++)
            delete this.getSlot(k)[e.id];
    }

    getSlotEvents(k, start, end) {
        let s = this.getSlot(k);
        let results = [];
        for (let id in s) {
            if (!(s[id].start >= end || s[id].end <= start))
            {
                results.push({
                    id,
                    start: s[id].start < start ? start: s[id].start,
                    end: s[id].end > end ? end: s[id].end,
                    summary: s[id].summary
                });
            }
        }
        return results;
    }

    getCachedEvents(start, end) {
        let ks = GCalendar.dateToCacheKey(start);
        let ke = GCalendar.dateToCacheKey(new Date(end.getTime() - 1));
        let results = this.getSlotEvents(ks, start, end);
        for (let k = ks + 1; k < ke; k++)
        {
            let s = this.getSlot(k);
            for (let id in s)
                results.push(s[id]);
        }
        if (ke > ks)
            results.push(...this.getSlotEvents(ke, start, end));
        return results;
    }

    sync() {
        return this.token.then(token => getEvents(this.calId, token, this.syncToken).then(r => {
            this.syncToken = r.nextSyncToken;
            let pm_results = r.results.map(e => e.start ? Promise.resolve(e) : getEvent(this.calId, e.id, token));
            return Promise.all(pm_results).then(results => results.forEach(e => {
                e.start = new Date(e.start.dateTime);
                e.end = new Date(e.end.dateTime);
                if (e.status === 'confirmed')
                    this.addEvent(e);
                else if (e.status === 'cancelled')
                    this.removeEvent(e);
            }));
        })).catch(e => {
            if (e == GApiError.invalidSyncToken) {
                this.syncToken = '';
                this.sync();
            } else throw e;
        });
    }

    getEvents(start, end) {
        return this.sync().then(() => this.getCachedEvents(start, end));
    }
}
