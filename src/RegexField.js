import React from 'react';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import { Pattern } from './pattern';

class RegexField extends React.Component {
    render() {
        var pitems = this.props.options;
        var p0 = new Pattern.emptyPattern();
        let items = [];
        pitems[p0.id] = p0;
        for (let id in pitems)
            items.push(
                <MenuItem key={id} value={id}>
                    {!pitems[id].isEmpty ?
                        pitems[id].label :
                        <span style={{color: this.props.theme.palette.primary.dark}}>Custom</span>}
                </MenuItem>);
        return (
            <FormControl>
            <span>
            <Select
                value={this.props.value.id}
                onChange={event => {
                    let value;
                    if (pitems[event.target.value].label == null) {
                        value = new Pattern(0, true,
                            this.props.value.isRegex ?
                            this.props.value.value :
                            `^${this.props.value.value}$`, null);
                    } else {
                        value = pitems[event.target.value];
                    }
                    this.props.onChange({target: {value}});
                }}
                className={this.props.value.isRegex ?
                        this.props.fieldStyles.regex :
                        this.props.fieldStyles.noRegex}>{items}</Select>
            {this.props.value.label == null && (
                <TextField
                 value={this.props.value.value}
                 onChange={event =>
                    this.props.onChange({target: { value: new Pattern(0, true, event.target.value, null)}})} />
            )}
            </span>
            </FormControl>);
    }
}

export function CalendarField(props) {
    let options = {};
    for (let id in props.cached.calendars) {
        options[id] = new Pattern(id, false,
            props.cached.calendars[id].name,
            props.cached.calendars[id].name);
    }
    return (
        <RegexField
            value={props.value}
            options={options}
            fieldStyles={props.fieldStyles}
            onChange={props.onChange}
            theme={props.theme} />);
}

export function EventField(props) {
    let any = Pattern.anyPattern();
    let options = {};
    options[any.id] = any;
    return (
        <RegexField
            value={props.value}
            options={options}
            fieldStyles={props.fieldStyles}
            onChange={props.onChange}
            theme={props.theme}/>);
}
