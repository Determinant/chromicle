import React from 'react';
import PropTypes from 'prop-types';
import 'react-dates/initialize';
import 'react-dates/lib/css/_datepicker.css';
import { DateRangePicker } from 'react-dates';
import { Theme, withStyles } from '@material-ui/core/styles';
import cyan from '@material-ui/core/colors/cyan';
import deepOrange from '@material-ui/core/colors/deepOrange';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import * as gapi from './gapi';
import { MsgType, MsgClient } from './msg';
import { Pattern, PatternEntry, PatternEntryFlat } from './pattern';
import { AnalyzePieChart } from './Chart';
import { getGraphData } from './graph';
import PatternTable from './PatternTable';
import Snackbar from './Snackbar';
import AlertDialog from './Dialog';
import moment from 'moment';

const defaultChartData = [
    {name: 'Work', value: 10, color: cyan[300]},
    {name: 'Wasted', value: 10, color: deepOrange[300]}];

const styles = (theme: Theme) => ({
    buttonSpacer: {
        marginBottom: theme.spacing.unit * 4,
    },
});

class Analyze extends React.Component<{classes: {buttonSpacer: string}}> {
    msgClient: MsgClient;
    dialogPromiseResolver: (r: boolean) => void;

    state = {
        patterns: [] as PatternEntry[],
        calendars: {} as { [id: string]: gapi.GCalendarMeta },
        startDate: null as moment.Moment,
        endDate: null as moment.Moment,
        patternGraphData: defaultChartData,
        calendarGraphData: defaultChartData,
        snackBarOpen: false,
        snackBarMsg: 'unknown',
        snackBarVariant: 'error',
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
        focusedInput: null as any
    };

    constructor(props: any) {
        super(props);

        this.msgClient = new MsgClient('main');

        this.msgClient.sendMsg({
            opt: MsgType.getPatterns,
            data: { id: 'analyze' }
        }).then(msg => {
            this.setState({
                patterns: msg.data.map((p: PatternEntryFlat) => PatternEntry.inflate(p))
            });
        });

        this.msgClient.sendMsg({
            opt: MsgType.getCalendars,
            data: { enabledOnly: true }
        }).then(msg => {
            this.setState({ calendars: msg.data });
        });

        gapi.getLoggedIn().then(b => !b &&
            this.handleSnackbarOpen('Not logged in. Operating in offline mode.', 'warning'));

        this.dialogPromiseResolver = null;
    }

    loadPatterns = (patterns: PatternEntry[]) => {
        this.msgClient.sendMsg({
            opt: MsgType.updatePatterns,
            data: { id: 'analyze', patterns: patterns.map(p => p.deflate()) }
        }).then(() => this.setState({ patterns }));
    };

    updatePattern = (field: string, idx: number, value: PatternEntry[]) => {
        let patterns = this.state.patterns;
        // hack here
        (patterns[idx] as {[key: string]: any})[field] = value;
        this.loadPatterns(patterns);
    };

    removePattern = (idx: number) => {
        let patterns = this.state.patterns;
        patterns.splice(idx, 1);
        for (let i = 0; i < patterns.length; i++)
            patterns[i].idx = i;
        this.loadPatterns(patterns);
    };

    newPattern = () => {
        let patterns = [PatternEntry.defaultPatternEntry(0), ...this.state.patterns];
        for (let i = 1; i < patterns.length; i++)
            patterns[i].idx = i;
        this.loadPatterns(patterns);
    };

    getCalEvents = async (id: string, start: Date, end: Date): Promise<gapi.GCalendarEvent[]> => {
        let { data } = await this.msgClient.sendMsg({
            opt: MsgType.getCalEvents,
            data: { id,
                    start: start.getTime(),
                end: end.getTime() }
        });
        return data.map((_e: gapi.GCalendarEventFlat) => (
            gapi.GCalendarEvent.inflate(_e)
        ));
    }

    analyze = () => {
        if (!(this.state.startDate && this.state.endDate)) {
            this.handleSnackbarOpen('Please choose a valid time range.', 'error');
            return;
        }
        let start = this.state.startDate.startOf('day').toDate();
        let end = this.state.endDate.startOf('day').toDate();
        getGraphData(start, end,
                    this.state.patterns,
                    this.state.calendars,
                    this.getCalEvents).then(results => {
            this.setState(results);
        });
    }

    reset = () => {
        this.openDialog("Reset", "Are you sure to reset the patterns?").then(ans => {
            if (!ans) return;
            this.loadPatterns([]);
            this.setState({ startDate: null, endDate: null });
        });
    }

    loadDefaultPatterns() {
        let patterns = [];
        let idx = 0;
        for (let id in this.state.calendars) {
            let cal = this.state.calendars[id];
            if (!cal.enabled) continue;
            patterns.push(new PatternEntry(cal.name, idx++,
                new Pattern(id, false, cal.name, cal.name),
                Pattern.anyPattern(),
                cal.color));
        }
        console.log(patterns);
        this.loadPatterns(patterns);
    }

    default = () => {
        this.openDialog("Load Default", "Load the calendars as patterns?").then(ans => {
            if (!ans) return;
            this.loadDefaultPatterns();
        });
    }

    handleSnackbarClose = (event: React.SyntheticEvent<{}>, reason: string) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
    }

    handleSnackbarOpen = (msg: string, variant: any) => {
        this.setState({ snackBarOpen: true, snackBarMsg: msg, snackBarVariant: variant });
    }

    openDialog(title: string, message: string) {
        let pm = new Promise(resolver => {
            this.dialogPromiseResolver = resolver
        });
        this.setState({ dialogOpen: true, dialogMsg: {title, message} });
        return pm;
    }

    handleDialogClose = (result: boolean) => {
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
                                    onDatesChange={({ startDate, endDate }:
                                                    { startDate: moment.Moment, endDate: moment.Moment }) => {
                                        this.setState({ startDate, endDate });
                                    }}
                                    focusedInput={this.state.focusedInput}
                                    onFocusChange={(focusedInput: any) => this.setState({ focusedInput })}
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
                    <AnalyzePieChart
                        patternGraphData={this.state.patternGraphData}
                        calendarGraphData={this.state.calendarGraphData}/>
                </Grid>
            </Grid>
        );
    }
}


export default withStyles(styles)(Analyze);
