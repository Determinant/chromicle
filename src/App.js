/* global chrome */
import React from 'react';
import PropTypes from 'prop-types';
import 'typeface-roboto';
import 'react-dates/initialize';
import 'react-dates/lib/css/_datepicker.css';
import { DateRangePicker } from 'react-dates';
import { withStyles } from '@material-ui/core/styles';
import { MuiThemeProvider } from '@material-ui/core/styles';
import cyan from '@material-ui/core/colors/cyan';
import CssBaseline from '@material-ui/core/CssBaseline';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import Logo from './Logo';
import * as gapi from './gapi';
import { msgType, Msg } from './msg';
import { Pattern, PatternEntry } from './pattern';
import PieChart from './Chart';
import PatternTable from './PatternTable';
import theme from './theme';

const default_chart_data = [
    {name: 'Work', value: 10, color: cyan[300]},
    {name: 'Wasted', value: 10, color: cyan[300]}];

function filterPatterns(patterns, calName) {
    return patterns.filter(p => {
        return p.cal.regex.test(calName);
    });
}

const styles = theme => ({
    root: {
        display: 'flex',
        height: '100vh',
    },
    appBar: {
        zIndex: theme.zIndex.drawer + 1,
        transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
    title: {
        flexGrow: 1,
    },
    sectionTitle: {
        flex: '0 0 auto'
    },
    appBarSpacer: theme.mixins.toolbar,
    content: {
        flexGrow: 1,
        padding: theme.spacing.unit * 3,
        overflow: 'auto',
    },
    buttonSpacer: {
        marginBottom: theme.spacing.unit * 4,
    },
    fab: {
        margin: theme.spacing.unit,
    },
});

class Dashboard extends React.Component {
    state = {
        patterns: [],
        calendars: [],
        timeRange: null,
        token: gapi.getAuthToken(),
        patternGraphData: default_chart_data,
        calendarGraphData: default_chart_data,
        activePattern: null
    };

    constructor(props) {
        super(props);
        let port = chrome.runtime.connect({name: 'main'});
        const getCallBack = rcb => this.requestCallback;
        port.onMessage.addListener(function(msg) {
            console.log(msg);
            let rcb = getCallBack(msg.type);
            let cb = rcb.inFlight[msg.id];
            console.assert(cb !== undefined);
            rcb.ids.push(msg.id);
            cb(msg);
        });
        this.port = port;
        this.requestCallback = {inFlight: {}, ids: [], maxId: 0};
        this.sendMsg({ type: msgType.getPatterns }).then(msg => {
            this.setState({ patterns: msg.data.map(p => PatternEntry.revive(p)) });
        });
        this.sendMsg({ type: msgType.getCalendars }).then(msg => {
            this.setState({ calendars: msg.data });
        });
    }

    updatePattern = (field, idx, value) => {
        let patterns = this.state.patterns;
        patterns[idx][field] = value;
        this.setState({ patterns });
        this.sendMsg({ type: msgType.updatePatterns, data: patterns });
    };

    removePattern = idx => {
        let patterns = this.state.patterns;
        patterns.splice(idx, 1);
        for (let i = 0; i < patterns.length; i++)
            patterns[i].idx = i;
        this.setState({ patterns });
        this.sendMsg({ type: msgType.updatePatterns, data: patterns });
    };

    newPattern = () => {
        let patterns = [PatternEntry.defaultPatternEntry(0), ...this.state.patterns];
        for (let i = 1; i < patterns.length; i++)
            patterns[i].idx = i;
        this.setState({ patterns });
        this.sendMsg({ type: msgType.updatePatterns, data: patterns });
    };

    loadPatterns = patterns => {
        this.setState({ patterns });
        this.sendMsg({ type: msgType.updatePatterns, data: patterns });
    };

    loadCalendars = calendars => {
        this.setState({ calendars });
        this.sendMsg({ type: msgType.updateCalendars, data: calendars });
    };

    sendMsg = ({ type, data }) => {
        let rcb = this.requestCallback;
        let cb;
        let pm = new Promise(resolve => { cb = resolve; });
        let id;
        if (rcb.ids.length > 0) {
            id = rcb.ids.pop();
        } else {
            id = rcb.maxId++;
        }
        rcb.inFlight[id] = cb;
        this.port.postMessage((new Msg(id, type, data)).deflate());
        return pm;
    }

    getCalEvents = (id, start, end) => {
        return this.sendMsg({ type: msgType.getCalEvents, data: { id,
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
            alert("Please choose a valid time range.");
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

    load = () => {
        let token = this.state.token;
        let colors = token.then(gapi.getColors).then(color => {
            return color.calendar;
        });
        let cals = token.then(gapi.getCalendars);
        Promise.all([colors, cals]).then(([colors, items]) => {
            var cals = {};
            items.forEach(item => {
                cals[item.id] = {
                    name: item.summary,
                    color: colors[item.colorId],
                    //cal: new gapi.GCalendar(item.id, item.summary)
                }});
            this.loadCalendars(cals);
            this.loadPatterns(items.map((item, idx) => {
                return new PatternEntry(item.summary, idx,
                    new Pattern(item.id, false, item.summary, item.summary),
                    Pattern.anyPattern());
            }));
        });
    };

    render() {
        const { classes } = this.props;

        return (
            <MuiThemeProvider theme={theme}>
                <div className={classes.root}>
                    <AppBar
                        position="absolute"
                        className={classes.appBar}>
                        <Toolbar className={classes.toolbar}>
                            <Typography component="h1" variant="h6" color="inherit" noWrap className={classes.title}>
                                <Logo style={{width: '2em', verticalAlign: 'bottom', marginRight: '0.2em'}}/>Chromicle
                            </Typography>
                        </Toolbar>
                    </AppBar>
                    <main className={classes.content}>
                        <div className={classes.appBarSpacer} />
                        <Grid container  spacing={16}>
                            <CssBaseline />
                            <Grid item md={6} xs={12}>
                                <FormControl fullWidth={true}>
                                    <FormGroup>
                                        <Typography variant="h6" component="h1" gutterBottom>
                                            Event Patterns
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
                                                isOutsideRange={() => false}/>
                                        </div>
                                    </FormGroup>
                                    <div className={classes.buttonSpacer} />
                                    <Grid container spacing={16}>
                                        <Grid item md={6} xs={12}>
                                            <FormGroup>
                                                <Button variant="contained" color="primary" onClick={this.load}>Load</Button>
                                            </FormGroup>
                                        </Grid>
                                        <Grid item md={6} xs={12}>
                                            <FormGroup>
                                                <Button variant="contained" color="primary" onClick={this.analyze}>Analyze</Button>
                                            </FormGroup>
                                        </Grid>
                                    </Grid>
                                </FormControl>
                            </Grid>
                            <Grid item md={6} xs={12}>
                                <Typography variant="h6" component="h1" gutterBottom>
                                    Graph
                                </Typography>
                                <PieChart
                                    patternGraphData={this.state.patternGraphData}
                                    calendarGraphData={this.state.calendarGraphData}/>
                            </Grid>
                        </Grid>
                    </main>
                </div>
            </MuiThemeProvider>);
    }
}

Dashboard.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(Dashboard);
