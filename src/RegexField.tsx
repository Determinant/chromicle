import React from 'react';
import { Theme, withStyles } from '@material-ui/core/styles';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';

import { Pattern, PatternEntry } from './pattern';
import { GCalendarMeta } from './gapi';

const styles = (theme: Theme) => ({
    fieldNoRegex: {
        width: 200
    },
    fieldRegex: {
        marginRight: '0.5em'
    }
});

type RegexFieldProps = {
    classes: {
        fieldRegex: string,
        fieldNoRegex: string
    },
    options: {[id: string]: Pattern},
    theme: Theme,
    value: Pattern,
    onChange: (p: Pattern) => void
};

class RegexField extends React.Component<RegexFieldProps> {
    render() {
        const { classes } = this.props;
        let items: React.ReactElement<typeof MenuItem>[] = [];
        var pitems = this.props.options;
        const p0 = Pattern.emptyPattern();
        pitems[p0.id] = p0;
        for (let id in pitems)
        {
            const label = !pitems[id].isEmpty ? pitems[id].label :
                <span style={{color: this.props.theme.palette.primary.dark}}>Custom</span>;
            items.push(<MenuItem key={id} value={id}>{label}</MenuItem>);
        }
        const selectOnClick = (event: React.ChangeEvent<HTMLSelectElement>) => {
            let value;
            if (pitems[event.target.value].label == null) {
                value = new Pattern(0, true,
                    this.props.value.isRegex ?
                    this.props.value.value :
                    `^${this.props.value.value}$`, null);
            } else {
                value = pitems[event.target.value];
            }
            this.props.onChange(value);
        };

        const regexTextOnChange = (event: React.ChangeEvent<HTMLInputElement>) => (
            this.props.onChange(new Pattern(0, true, event.target.value, null))
        );

        const className = this.props.value.isRegex ? classes.fieldRegex: classes.fieldNoRegex;
        return (
            <FormControl>
                <span>
                    <Select
                        value={this.props.value.id}
                        onChange={selectOnClick}
                        className={className}>{items}
                    </Select>
                    {this.props.value.label == null && (
                        <TextField
                            value={this.props.value.value}
                            onChange={regexTextOnChange} />
                    )}
                </span>
            </FormControl>);
    }
}

const RegexFieldWithStyles = withStyles(styles)(RegexField);

type CalendarFieldProps = {
    calendars: {[id: string]: GCalendarMeta},
    theme: Theme,
    onChange: (field: string, value: Pattern) => void,
    value: PatternEntry
};

export function CalendarField(props: CalendarFieldProps) {
    let options: {[id: string]: Pattern} = {};
    for (let id in props.calendars) {
        options[id] = new Pattern(id, false,
            props.calendars[id].name,
            props.calendars[id].name);
    }
    return (
        <RegexFieldWithStyles
            value={props.value.cal}
            options={options}
            onChange={value => props.onChange('cal', value)}
            theme={props.theme} />);
}

type EventFieldProps = {
    theme: Theme,
    value: PatternEntry,
    onChange: (field: string, value: Pattern) => void
};

export function EventField(props: EventFieldProps) {
    let wildcard = Pattern.anyPattern();
    let options: { [id: string]: Pattern } = {};
    options[wildcard.id] = wildcard;
    return (
        <RegexFieldWithStyles
            value={props.value.event}
            options={options}
            onChange={value => props.onChange('event', value)}
            theme={props.theme} />);
}
