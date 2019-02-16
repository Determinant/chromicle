export type PatternFlat = {
    id: number | string,
    isRegex: boolean,
    value: string,
    label: string
}

export class Pattern {
    id: number | string;
    isRegex: boolean;
    value: string;
    label: string;

    constructor(id: number | string, isRegex: boolean, value: string, label: string) {
        this.id = id;
        this.isRegex = isRegex;
        this.value = value;
        this.label = label;
    }

    get regex() { return new RegExp(this.isRegex ? this.value : `^${this.value}$`); }
    get isEmpty() { return this.label === null; }
    deflate() {
        return {
            id: this.id,
            isRegex: this.isRegex,
            value: this.value,
            label: this.label
        };
    }
    static emptyPattern = () => new Pattern(0, true, '', null);
    static anyPattern = () => new Pattern('any', true, '.*', 'Any');
    static inflate = (obj: PatternFlat) => new Pattern(obj.id, obj.isRegex, obj.value, obj.label);
}

export type PatternEntryColor = {
    background: string
}

export type PatternEntryFlat = {
    name: string,
    idx: number,
    cal: PatternFlat,
    event: PatternFlat,
    color: PatternEntryColor
}

export class PatternEntry {
    name: string;
    idx: number;
    cal: Pattern;
    event: Pattern; 
    color: PatternEntryColor;

    constructor(name: string, idx: number,
                calPattern: Pattern, eventPattern: Pattern,
                color: PatternEntryColor) {
        this.name = name;
        this.idx = idx;
        this.cal = calPattern;
        this.event = eventPattern;
        this.color = color;
    }

    deflate() {
        return {
            name: this.name,
            idx: this.idx,
            cal: this.cal.deflate(),
            event: this.event.deflate(),
            color: this.color
        };
    }

    static defaultPatternEntry = (idx: number) => (
        new PatternEntry('', idx,
            Pattern.emptyPattern(),
            Pattern.anyPattern(), {background: null}));

    static inflate = (obj: PatternEntryFlat) => (
        new PatternEntry(obj.name, obj.idx,
            Pattern.inflate(obj.cal),
            Pattern.inflate(obj.event), obj.color)
    );
}
