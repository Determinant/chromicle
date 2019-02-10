import moment from 'moment';

export class Duration {
    constructor(value, unit) {
        this.value = value
        this.unit = unit
    }

    toMoment() {
        let m = moment.duration(this.value, this.unit);
        if (m.isValid()) return m;
        return null;
    }

    static days(n) { return new Duration(n, 'days'); }
    static weeks(n) { return new Duration(n, 'weeks'); }
    static months(n) { return new Duration(n, 'months'); }

    deflate() { return { value: this.value, unit: this.unit }; }
    static inflate = obj => new Duration(obj.value, obj.unit);
}
