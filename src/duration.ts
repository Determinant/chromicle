import moment from 'moment';

export type TimeUnit = moment.unitOfTime.DurationConstructor;

export type DurationFlat = {
    value: number,
    unit: string
};

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
    static inflate = (obj: DurationFlat) => new Duration(obj.value, obj.unit as TimeUnit);
}


export type TrackPeriodFlat = {
    name: string,
    start: DurationFlat,
    end: DurationFlat
};

export class TrackPeriod {
    name: string;
    start: Duration;
    end: Duration;

    constructor(name: string, start: Duration, end: Duration) {
        this.name = name;
        this.start = start;
        this.end = end;
    }

    deflate() {
        return {
            name: this.name,
            start: this.start.deflate(),
            end: this.end.deflate()
        };
    }

    static inflate = (obj: TrackPeriodFlat) => (
        new TrackPeriod(obj.name, Duration.inflate(obj.start), Duration.inflate(obj.end))
    );
}
