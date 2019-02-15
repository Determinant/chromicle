import { GCalendarEvent, GCalendarMeta } from './gapi';
import { PatternEntry } from './pattern';
import { defaultChartColor} from './theme';

export type PatternGraphData = {
    name: string,
    value: number,
    color: string
};

export type GraphData = {
    name: string,
    start: Date,
    end: Date,
    data: PatternGraphData[]
};

export function getGraphData(
        start: Date, end: Date,
        patterns: PatternEntry[], calendars: { [id: string]: GCalendarMeta },
        calEventsGetter: (id: string, start: Date, end: Date) => Promise<GCalendarEvent[]>) {
    if (start >= end) return Promise.resolve({ patternGraphData: [], calendarGraphData: [] });
    let event_pms = [];
    for (let id in calendars)
    {
        if (!calendars[id].enabled) continue;
        let filtered = patterns.filter(p => p.cal.regex.test(calendars[id].name));
        if (filtered.length > 0)
            event_pms.push(calEventsGetter(id, start, end)
                .then(r => { return { id, events: r, filtered }; }));
    }
    return Promise.all(event_pms).then(all_events => {
        let events: {[id: string]: GCalendarEvent[]} = {};
        let patternsByCal: {[id: string]: PatternEntry[]} = {};
        let results: {[idx: number]: number} = {};
        let cal_results: {[id: string]: number} = {};

        all_events.forEach(e => {
            events[e.id] = e.events;
            patternsByCal[e.id] = e.filtered;
        });

        for (let i = 0; i < patterns.length; i++)
            results[i] = 0;
        for (let id in calendars) {
            if (!events[id]) continue;
            events[id].forEach(event => {
                patternsByCal[id].forEach(p => {
                    if (!p.event.regex.test(event.summary)) {
                        console.log(event.summary, p.event.regex);
                        return;
                    }
                    if (!cal_results.hasOwnProperty(id)) {
                        cal_results[id] = 0;
                    }
                    let duration = (event.end.getTime() - event.start.getTime()) / 60000;
                    results[p.idx] += duration;
                    cal_results[id] += duration;
                });
            });
        }
        let patternGraphData = [];
        let calendarGraphData = [];
        const filterMarginal = (data: PatternGraphData[]) => {
            let sum = 0;
            let majorParts = [];
            let minorSum = 0;
            data.forEach(d => sum += d.value);
            data.forEach(d => {
                let ratio = d.value / sum;
                if (ratio < 1e-2) minorSum += d.value;
                else majorParts.push(d);
            });
            majorParts.push({
                name: 'Other',
                value: minorSum,
                color: defaultChartColor,
            });
            return majorParts;
        };
        for (let i = 0; i < patterns.length; i++) {
            patternGraphData.push({
                name: patterns[i].name,
                value: results[i] / 60.0,
                color: patterns[i].color.background});
        }
        for (let id in cal_results) {
            calendarGraphData.push({
                name: calendars[id].name,
                value: (cal_results[id] / 60.0),
                color: calendars[id].color.background});
        }
        return {start, end,
                patternGraphData: filterMarginal(patternGraphData),
                calendarGraphData: filterMarginal(calendarGraphData) };
    });
}
