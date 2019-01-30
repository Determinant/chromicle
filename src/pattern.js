export class Pattern {
    constructor(id, isRegex, value, label) {
        this.id = id;
        this.isRegex = isRegex;
        this.value = value;
        this.label = label;
    }

    get regex() { return new RegExp(this.isRegex ? this.value : `^${this.value}$`); }
    get isEmpty() { return this.label === null; }
    static emptyPattern = () => new Pattern(0, true, '', null);
    static anyPattern = () => new Pattern('any', true, '.*', 'Any');
}

export class PatternEntry {
    constructor(name, idx, calPattern, eventPattern) {
        this.name = name;
        this.idx = idx;
        this.cal = calPattern;
        this.event = eventPattern;
    }

    static defaultPatternEntry = (idx) => new PatternEntry('', idx, Pattern.emptyPattern(), Pattern.anyPattern());
}
