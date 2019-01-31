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
        timeRange: null,
        token: gapi.getAuthToken(),
        patternGraphData: default_chart_data,
        calendarGraphData: default_chart_data,
        activePattern: null
    };

    cached = {
        calendars: {}
    };

    updatePattern = (field, idx, value) => {
        let patterns = this.state.patterns;
        patterns[idx][field] = value;
        this.setState({ patterns });
    };

    removePattern = idx => {
        let patterns = this.state.patterns;
        patterns.splice(idx, 1);
        for (let i = 0; i < patterns.length; i++)
            patterns[i].idx = i;
        this.setState({ patterns });
    };

    newPattern = () => {
        let patterns = [PatternEntry.defaultPatternEntry(), ...this.state.patterns];
        for (let i = 1; i < patterns.length; i++)
            patterns[i].idx = i;
        this.setState({ patterns });
    };

    analyze = () => {
        if (!(this.state.startDate && this.state.endDate)) {
            alert("Please choose a valid time range.");
            return;
        }
        let start = this.state.startDate.toDate();
        let end = this.state.endDate.toDate();
        console.log(start, end);
        let event_pms = [];
        for (let id in this.cached.calendars)
            event_pms.push(this.cached.calendars[id].cal.getEvents(start, end)
                .then(r => { return { id, events: r }; })
                .catch(e => {
                    console.log(`cannot load calendar ${id}`);
                    return { id, events: [] };
                }));

        Promise.all(event_pms).then(all_events => {
            let events = {};
            let results = {}; // pattern idx => time
            let cal_results = {}; // cal id => time
            all_events.forEach(e => events[e.id] = e.events);
            for (let i = 0; i < this.state.patterns.length; i++)
                results[i] = 0;
            for (let id in this.cached.calendars) {
                if (!events[id]) continue;
                let patterns = filterPatterns(this.state.patterns, this.cached.calendars[id].name);
                events[id].forEach(event => {
                    patterns.forEach(p => {
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
                    name: this.cached.calendars[id].name,
                    value: (cal_results[id] / 60.0),
                    color: this.cached.calendars[id].color.background});
            }
            //console.log(patternGraphData, calendarGraphData);
            this.setState({ patternGraphData, calendarGraphData });
        });
    };

    loadPatterns = () => {
        let token = this.state.token;
        let colors = token.then(gapi.getColors).then(color => {
            return color.calendar;
        });
        let cals = token.then(gapi.getCalendars);
        Promise.all([colors, cals]).then(([colors, items]) => {
            items.forEach(item => {
                this.cached.calendars[item.id] = {
                    name: item.summary,
                    color: colors[item.colorId],
                    cal: new gapi.GCalendar(item.id, item.summary)
                };
            });
            this.setState({ patterns: items.map((item, idx) => {
                return new PatternEntry(item.summary, idx,
                    new Pattern(item.id, false, item.summary, item.summary),
                    Pattern.anyPattern());
            })});
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
                                            cached={this.cached}
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
                                                <Button variant="contained" color="primary" onClick={this.loadPatterns}>Load</Button>
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
