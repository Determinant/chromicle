import moment from 'moment';

export type TimeUnit = moment.unitOfTime.DurationConstructor;

export class Duration {
    value: number;
    unit: TimeUnit;
    constructor(value: number, unit: TimeUnit) {
        this.value = value
        this.unit = unit
    }

    isValid() { return moment.duration(this.value, this.unit).isValid(); }
    toMoment() {
        let m = moment.duration(this.value, this.unit);
        if (m.isValid()) return m;
        return null;
    }

    static days(n: number) { return new Duration(n, 'days'); }
    static weeks(n: number) { return new Duration(n, 'weeks'); }
    static months(n: number) { return new Duration(n, 'months'); }

    deflate() { return { value: this.value, unit: this.unit }; }
    static inflate = (obj: { value: number, unit: TimeUnit }) => new Duration(obj.value, obj.unit);
}

export type TrackPeriod = {
    name: string,
    start: Duration,
    end: Duration
};
