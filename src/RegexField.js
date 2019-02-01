import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import { Pattern } from './pattern';

const styles = theme => ({
    fieldNoRegex: {
        width: 200
    },
    fieldRegex: {
        marginRight: '0.5em'
    }
});

class RegexField extends React.Component {
    render() {
        const { classes } = this.props;
        let items = [];
        var pitems = this.props.options;
        const p0 = new Pattern.emptyPattern();
        pitems[p0.id] = p0;
        for (let id in pitems)
        {
            const label = !pitems[id].isEmpty ? pitems[id].label :
                <span style={{color: this.props.theme.palette.primary.dark}}>Custom</span>;
            items.push(<MenuItem key={id} value={id}>{label}</MenuItem>);
        }
        const selectOnClick = event => {
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
        };

        const regexTextOnChange = event => this.props.onChange({
            target: { value: new Pattern(0, true, event.target.value, null)}});

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

RegexField.propTypes = {
    classes: PropTypes.object.isRequired,
};

const RegexFieldWithStyles = withStyles(styles)(RegexField);

export function CalendarField(props) {
    let options = {};
    for (let id in props.calendars) {
        options[id] = new Pattern(id, false,
            props.calendars[id].name,
            props.calendars[id].name);
    }
    return (
        <RegexFieldWithStyles
            value={props.value}
            options={options}
            onChange={props.onChange}
            theme={props.theme} />);
}

export function EventField(props) {
    let any = Pattern.anyPattern();
    let options = {};
    options[any.id] = any;
    return (
        <RegexFieldWithStyles
            value={props.value}
            options={options}
            onChange={props.onChange}
            theme={props.theme} />);
}
