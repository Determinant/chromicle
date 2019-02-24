import React from 'react';
import 'react-dates/initialize';
import 'react-dates/lib/css/_datepicker.css';
import { DateRangePicker, FocusedInputShape } from 'react-dates';
import { Theme, withStyles } from '@material-ui/core/styles';
import cyan from '@material-ui/core/colors/cyan';
import deepOrange from '@material-ui/core/colors/deepOrange';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import moment from 'moment';

import PatternTable from './PatternTable';
import AlertDialog from './Dialog';
import Snackbar, { SnackbarVariant } from './Snackbar';
import * as gapi from './gapi';
import { MsgType, MsgClient } from './msg';
import { Pattern, PatternEntry, PatternEntryFlat } from './pattern';
import { AnalyzePieChart } from './Chart';
import { getGraphData, PatternGraphData } from './graph';

const defaultChartData = [] as PatternGraphData[];

const styles = (theme: Theme) => ({
    buttonSpacer: {
        marginBottom: theme.spacing.unit * 4,
    },
});

type AnalyzeProps = {
    classes: { buttonSpacer: string }
};

class Analyze extends React.Component<AnalyzeProps> {
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
        snackBarVariant: 'error' as SnackbarVariant,
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
        focusedInput: null as FocusedInputShape
    };

    constructor(props: AnalyzeProps) {
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

        this.msgClient.sendMsg({
            opt: MsgType.getLoggedIn,
            data: {}
        }).then(msg => {
            if (!msg.data)
                this.openSnackbar('Not logged in. Operating in offline mode.',
                                    'warning' as SnackbarVariant);
        });

        this.dialogPromiseResolver = null;
    }

    loadPatterns(patterns: PatternEntry[]) {
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

    analyze = async () => {
        if (!(this.state.startDate && this.state.endDate)) {
            this.openSnackbar('Please choose a valid time range.',
                            'error' as SnackbarVariant);
            return;
        }
        let start = this.state.startDate.startOf('day').toDate();
        let end = this.state.endDate.startOf('day').toDate();
        let r = await getGraphData(start, end,
                    this.state.patterns,
                    this.state.calendars,
                    this.getCalEvents);
        this.setState({ patternGraphData: r.patternGraphData,
                        calendarGraphData: r.calendarGraphData });
    }

    reset = async () => {
        let ans = this.openDialog("Reset", "Are you sure to reset the patterns?");
        if (!ans) return;
        this.loadPatterns([]);
        this.setState({ startDate: null, endDate: null });
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
        this.loadPatterns(patterns);
    }

    loadDefault = async () => {
        let ans = await this.openDialog("Load Default", "Load the calendars as patterns?");
        if (!ans) return;
        this.loadDefaultPatterns();
    }

    openSnackbar(msg: string, variant: SnackbarVariant) {
        this.setState({ snackBarOpen: true, snackBarMsg: msg, snackBarVariant: variant });
    }

    openDialog(title: string, message: string) {
        let pm = new Promise(resolver => {
            this.dialogPromiseResolver = resolver
        });
        this.setState({ dialogOpen: true, dialogMsg: { title, message } });
        return pm;
    }

    handleSnackbarClose = (event: React.SyntheticEvent<{}>, reason: string) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
    }

    handleDialogClose = (ans: boolean) => {
        this.dialogPromiseResolver(ans);
        this.setState({ dialogOpen: false });
    }

    render() {
        const { classes } = this.props;

        return (
            <Grid container spacing={16} style={{minWidth: 700}}>
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
                <Grid item container md={6} xs={12} spacing={16}>
                    <Grid item xs={12}>
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
                    </Grid>
                    <Grid item xs={12}>
                            <Typography variant="h6" component="h1" gutterBottom>
                                Time Range
                            </Typography>
                        <FormControl fullWidth={true}>
                        <FormGroup>
                            <div style={{textAlign: 'center'}}>
                                <DateRangePicker
                                    startDate={this.state.startDate}
                                    startDateId="start_date_id"
                                    endDate={this.state.endDate}
                                    endDateId="end_date_id"
                                    onDatesChange={({ startDate, endDate }) => this.setState({ startDate, endDate })}
                                    focusedInput={this.state.focusedInput}
                                    onFocusChange={focusedInput => this.setState({ focusedInput })}
                                    isOutsideRange={() => false} />
                            </div>
                        </FormGroup>
                        <div className={classes.buttonSpacer} />
                        <Grid container spacing={16}>
                            <Grid item lg={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.loadDefault}>Load Default</Button>
                                </FormGroup>
                            </Grid>
                            <Grid item lg={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.reset}>Reset</Button>
                                </FormGroup>
                            </Grid>
                            <Grid item lg={4} xs={12}>
                                <FormGroup>
                                    <Button variant="contained" color="primary" onClick={this.analyze}>Analyze</Button>
                                </FormGroup>
                            </Grid>
                        </Grid>
                        </FormControl>
                    </Grid>
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
