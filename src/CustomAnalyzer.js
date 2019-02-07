import React from 'react';
import PropTypes from 'prop-types';
import 'react-dates/initialize';
import 'react-dates/lib/css/_datepicker.css';
import { DateRangePicker } from 'react-dates';
import { withStyles } from '@material-ui/core/styles';
import cyan from '@material-ui/core/colors/cyan';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import * as gapi from './gapi';
import { msgType, MsgClient } from './msg';
import { Pattern, PatternEntry } from './pattern';
import PieChart from './Chart';
import PatternTable from './PatternTable';
import Snackbar from './Snackbar';
import AlertDialog from './Dialog';

const default_chart_data = [
    {name: 'Work', value: 10, color: cyan[300]},
    {name: 'Wasted', value: 10, color: cyan[300]}];

function filterPatterns(patterns, calName) {
    return patterns.filter(p => {
        return p.cal.regex.test(calName);
    });
}

const styles = theme => ({
    buttonSpacer: {
        marginBottom: theme.spacing.unit * 4,
    },
});

class CustomAnalyzer extends React.Component {
    state = {
        patterns: [],
        calendars: {},
        startDate: null,
        endDate: null,
        patternGraphData: default_chart_data,
        calendarGraphData: default_chart_data,
        snackBarOpen: false,
        snackBarMsg: 'unknown',
        snackBarVariant: 'error',
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
    };

    constructor(props) {
        super(props);
        this.msgClient = new MsgClient('main');
        this.msgClient.sendMsg({
            type: msgType.getPatterns,
            data: { id: 'analyze' }
        }).then(msg => {
            this.setState({ patterns: msg.data.map(p => PatternEntry.revive(p)) });
        });
        this.msgClient.sendMsg({ type: msgType.getCalendars, data: { enabledOnly: true }}).then(msg => {
            this.setState({ calendars: msg.data });
        });
        gapi.getLoggedIn().then(b => !b &&
            this.handleSnackbarOpen('Not logged in. Operating in offline mode.', 'warning'));
        this.dialogPromiseResolver = null;
    }

    updatePattern = (field, idx, value) => {
        let patterns = this.state.patterns;
        patterns[idx][field] = value;
        this.msgClient.sendMsg({
            type: msgType.updatePatterns,
            data: { id: 'analyze', patterns }
        }).then(() => this.setState({ patterns }));
    };

    removePattern = idx => {
        let patterns = this.state.patterns;
        patterns.splice(idx, 1);
        for (let i = 0; i < patterns.length; i++)
            patterns[i].idx = i;
        this.msgClient.sendMsg({
            type: msgType.updatePatterns,
            data: { id: 'analyze', patterns }
        }).then(() => this.setState({ patterns }));
    };

    newPattern = () => {
        let patterns = [PatternEntry.defaultPatternEntry(0), ...this.state.patterns];
        for (let i = 1; i < patterns.length; i++)
            patterns[i].idx = i;
        this.msgClient.sendMsg({
            type: msgType.updatePatterns,
            data: { id: 'analyze', patterns }
        }).then(() => this.setState({ patterns }));
    };

    loadPatterns = patterns => {
        this.msgClient.sendMsg({
            type: msgType.updatePatterns,
            data: { id: 'analyze', patterns }
        }).then(() => this.setState({ patterns }));
    };

    getCalEvents = (id, start, end) => {
        return this.msgClient.sendMsg({ type: msgType.getCalEvents, data: { id,
            start: start.getTime(),
            end: end.getTime() } })
            .then(({ data }) => data.map(e => {
                return {
                    id: e.id,
                    start: new Date(e.start),
                    end: new Date(e.end) }
            }));
    }

    analyze = () => {
        if (!(this.state.startDate && this.state.endDate)) {
            this.handleSnackbarOpen('Please choose a valid time range.', 'error');
            return;
        }
        let start = this.state.startDate.startOf('day').toDate();
        let end = this.state.endDate.startOf('day').toDate();
        let event_pms = [];
        let cals = this.state.calendars;
        for (let id in cals)
        {
            let patterns = filterPatterns(this.state.patterns, cals[id].name);
            if (patterns.length > 0)
                event_pms.push(this.getCalEvents(id, start, end)
                    .then(r => { return { id, events: r, patterns }; }));
        }
        Promise.all(event_pms).then(all_events => {
            console.log(all_events);
            let events = {};
            let patterns = {};
            let results = {}; // pattern idx => time
            let cal_results = {}; // cal id => time
            all_events.forEach(e => {
                events[e.id] = e.events;
                patterns[e.id] = e.patterns;
            });
            for (let i = 0; i < this.state.patterns.length; i++)
                results[i] = 0;
            for (let id in cals) {
                if (!events[id]) continue;
                events[id].forEach(event => {
                    patterns[id].forEach(p => {
                        if (!p.event.regex.test(event.summary)) return;
                        if (!cal_results.hasOwnProperty(id)) {
                            cal_results[id] = 0;
                        }
                        let duration = (event.end - event.start) / 60000;
                        results[p.idx] += duration;
                        cal_results[id] += duration;
                    });
                });
            }
            let patternGraphData = [];
            let calendarGraphData = [];
            for (let i = 0; i < this.state.patterns.length; i++) {
                patternGraphData.push({ name: this.state.patterns[i].name, value: results[i] / 60.0 });
            }
            for (let id in cal_results) {
                calendarGraphData.push({
                    name: cals[id].name,
                    value: (cal_results[id] / 60.0),
                    color: cals[id].color.background});
            }
            console.log(patternGraphData, calendarGraphData);
            this.setState({ patternGraphData, calendarGraphData });
        });
    };

    reset = () => {
        this.handleDialogOpen("Reset", "Are you sure to reset the patterns?").then(ans => {
            if (!ans) return;
            this.loadPatterns([]);
            this.setState({ startDate: null, endDate: null });
        });
    }

    default = () => {
        this.handleDialogOpen("Load Default", "Load the calendars as patterns?").then(ans => {
            if (!ans) return;
            this.loadPatterns(Object.keys(this.state.calendars).map((id, idx) => {
                let item = this.state.calendars[id];
                return new PatternEntry(item.name, idx,
                    new Pattern(id, false, item.name, item.name),
                    Pattern.anyPattern());
            }));
        });
    }

    handleSnackbarClose = (event, reason) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
    }

    handleSnackbarOpen = (msg, variant) => {
        this.setState({ snackBarOpen: true, snackBarMsg: msg, snackBarVariant: variant });
    }

    handleDialogOpen = (title, message) => {
        let pm = new Promise(resolver => {
            this.dialogPromiseResolver = resolver
        });
        this.setState({ dialogOpen: true, dialogMsg: {title, message} });
        return pm;
    }

    handleDialogClose = result => {
        this.dialogPromiseResolver(result);
        this.setState({ dialogOpen: false });
    }

    render() {
        const { classes } = this.props;

        return (
            <Grid container  spacing={16}>
                <AlertDialog
                    title={this.state.dialogMsg.title}
                    message={this.state.dialogMsg.message}
                    open={this.state.dialogOpen}
                    handleClose={this.handleDialogClose}/>
                <Snackbar
                    message={this.state.snackBarMsg}
                    open={this.state.snackBarOpen}
                    variant={this.state.snackBarVariant}
                    onClose={this.handleSnackbarClose}/>
                <Grid item md={6} xs={12}>
                    <FormControl fullWidth={true}>
                        <FormGroup>
                            <Typography variant="h6" component="h1" gutterBottom>
                                Analyzed Events
                                <IconButton
                                    style={{marginBottom: '0.12em', marginLeft: '0.5em'}}
                                    onClick={() => this.newPattern()}><AddCircleIcon /></IconButton>
                            </Typography>
                            <PatternTable
                                patterns={this.state.patterns}
                                calendars={this.state.calendars}
                                onRemovePattern={this.removePattern}
                                onUpdatePattern={this.updatePattern} />
                        </FormGroup>
                        <FormGroup>
                            <Typography variant="h6" component="h1" gutterBottom>
                                Time Range
                            </Typography>
                            <div style={{textAlign: 'center'}}>
                                <DateRangePicker
                                    startDate={this.state.startDate}
                                    startDateId="start_date_id"
                                    endDate={this.state.endDate}
                                    endDateId="end_date_id"
                                    onDatesChange={({ startDate, endDate }) => {
                                        this.setState({ startDate, endDate });
                                    }} 
                                    focusedInput={this.state.focusedInput}
                                    onFocusChange={focusedInput => this.setState({ focusedInput })}
                                    isOutsideRange={() => false} />
                            </div>
                        </FormGroup>
                        <div className={classes.buttonSpacer} />
                        <Grid container spacing={16}>
                            <Grid item md={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.default}>Load Default</Button>
                                </FormGroup>
                            </Grid>
                            <Grid item md={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.reset}>Reset</Button>
                                </FormGroup>
                            </Grid>
                            <Grid item md={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.analyze}>Analyze</Button>
                                </FormGroup>
                            </Grid>
                        </Grid>
                    </FormControl>
                </Grid>
                <Grid item md={6} xs={12}>
                    <Typography variant="h6" component="h1" gutterBottom>
                        Results
                    </Typography>
                    <PieChart
                        patternGraphData={this.state.patternGraphData}
                        calendarGraphData={this.state.calendarGraphData}/>
                </Grid>
            </Grid>
        );
    }
}

CustomAnalyzer.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(CustomAnalyzer);
