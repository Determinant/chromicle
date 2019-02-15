import React from 'react';
import PropTypes from 'prop-types';
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

class RegexField extends React.Component<{
            classes: {
                fieldRegex: string,
                fieldNoRegex: string
            },
            options: {[id: string]: Pattern},
            theme: Theme,
            value: Pattern,
            onChange: (p: Pattern) => void
        }>{
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
        const selectOnClick = (event: { target: { value: any }}) => {
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

        const regexTextOnChange = (event: { target: { value: any }}) => this.props.onChange(
            new Pattern(0, true, event.target.value, null));

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

export function CalendarField(props: {
            calendars: {[id: string]: GCalendarMeta},
            theme: Theme,
            onChange: (field: string, value: Pattern) => void,
            value: PatternEntry
        }) {
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

export function EventField(props: {
            theme: Theme,
            value: PatternEntry,
            onChange: (field: string, value: Pattern) => void
        }) {
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
