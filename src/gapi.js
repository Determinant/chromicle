/* global chrome */
const gapi_base = 'https://www.googleapis.com/calendar/v3';

function to_params(dict) {
    return Object.entries(dict).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function getAuthToken() {
    return new Promise(resolver =>
        chrome.identity.getAuthToken(
            {interactive: true}, token => resolver(token)));
}

export function getCalendars(token) {
    return fetch(gapi_base + '/users/me/calendarList?' + to_params({access_token: token}),
            { method: 'GET', async: true })
        .then(response => response.json())
        .then(data => data.items);
}

export function genEventsGetter(calId, timeMin, timeMax) {
    return token => fetch(gapi_base + '/calendars/' + calId + '/events?' + to_params({
        access_token: token,
        timeMin,
        timeMax
    }), { method: 'GET', async: true })
        .then(response => {
            if (response.status === 200)
                return response.json()
            else throw `got response ${response.status}`;
        })
        .catch(e => { console.log(e); return []; })
        .then(data => data.items);
}

export function getColors(token) {
    return fetch(gapi_base + '/colors?' + to_params({access_token: token}), { method: 'GET', async: true })
        .then(response => response.json());
}
