import React from 'react';
import PropTypes from 'prop-types';
import { Theme, withStyles, StyleRules } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import RefreshIcon from '@material-ui/icons/Refresh';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Checkbox from '@material-ui/core/Checkbox';
import * as gapi from './gapi';
import { MsgType, MsgClient } from './msg';
import { Pattern, PatternEntry, PatternEntryFlat } from './pattern';
import PatternTable from './PatternTable';
import Snackbar from './Snackbar';
import AlertDialog from './Dialog';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { Duration, TrackPeriod, TrackPeriodFlat } from './duration';

const styles = (theme: Theme): StyleRules => ({
    tableHead: {
        verticalAlign: 'top',
        textAlign: 'right',
        lineHeight: '3em',
    },
    tableContent: {
        textAlign: 'left',
        maxWidth: 600,
    },
    calendarList: {
        maxHeight: 400,
        overflowY: 'auto'
    },
});

const STableCell = withStyles(theme => ({
    body: {
        fontSize: 16,
    },
}))(TableCell);

const CompactListItem = withStyles(theme => ({
    dense: {
        paddingTop: 0,
        paddingBottom: 0
    },
}))(ListItem);

class TrackedPeriod extends React.Component<{
            name: string
            fromDuration: Duration,
            toDuration: Duration,
            nameOnChange: (name: string) => void,
            fromOnChange: (d: Duration) => void,
            toOnChange: (d: Duration) => void
        }>{
    valueOnChange = (old: Duration, onChange: (d: Duration) => void) => (event: any) => {
        onChange(new Duration(event.target.value, old.unit));
    }

    unitOnChange = (old: Duration, onChange: (d: Duration) => void) => (event: any) => {
        onChange(new Duration(old.value, event.target.value));
    }

    static styles = {
        periodName: {
            textAlign: 'right'
        },
        periodValue: {
            width: 30,
            textAlign: 'center'
        }
    };

    static toValue(value: any) {
        if (isNaN(value)) return null;
        let v = parseInt(value, 10);
        if (v < 0 || v > 999) return null;
        return v;
    }

    render() {
        let { fromDuration, toDuration, nameOnChange, fromOnChange, toOnChange, name } = this.props;
        let units = [
            <MenuItem key='days' value='days'>Day(s)</MenuItem>,
            <MenuItem key='weeks' value='weeks'>Week(s)</MenuItem>,
            <MenuItem key='months' value='months'>Month(s)</MenuItem>
        ];
        return (
            <span>
                <TextField
                    inputProps={{ style: TrackedPeriod.styles.periodName } as React.CSSProperties}
                    value={name}
                    onChange={event => nameOnChange(event.target.value)}/>:
                from <TextField
                    error={TrackedPeriod.toValue(fromDuration.value) === null}
                    inputProps={{ style: TrackedPeriod.styles.periodValue } as React.CSSProperties}
                    value={fromDuration.value}
                    onChange={this.valueOnChange(fromDuration, fromOnChange)} />
                <Select value={fromDuration.unit}
                    onChange={this.unitOnChange(fromDuration, fromOnChange)}>{units}</Select> ago
                to <TextField
                    error={TrackedPeriod.toValue(toDuration.value) === null}
                    inputProps={{style: TrackedPeriod.styles.periodValue} as React.CSSProperties}
                    value={toDuration.value}
                    onChange={this.valueOnChange(toDuration, toOnChange)} />
                <Select value={toDuration.unit}
                    onChange={this.unitOnChange(toDuration, toOnChange)}>{units}</Select> ago
            </span>
        );
    }
}

class Settings extends React.Component<{
            classes: {
                tableHead: string,
                tableContent: string,
                calendarList: string,
            }
        }> {

    msgClient: MsgClient;
    dialogPromiseResolver: (r: boolean) => void;

    state = {
        isLoggedIn: false,
        patterns: [] as PatternEntry[],
        calendars: {} as {[id: string]: gapi.GCalendarMeta},
        config: {} as { trackedPeriods: TrackPeriod[] },
        snackBarOpen: false,
        snackBarMsg: 'unknown',
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
        calendarsLoading: false,
    };

    constructor(props: any) {
        super(props);
        gapi.getLoggedIn().then(b => this.setState({ isLoggedIn: b }));

        this.msgClient = new MsgClient('main');

        this.msgClient.sendMsg({
            opt: MsgType.getPatterns,
            data: { id: 'main' }
        }).then(msg => {
            this.setState({ patterns: msg.data.map((p: PatternEntryFlat) => PatternEntry.inflate(p)) });
        });

        this.msgClient.sendMsg({
            opt: MsgType.getCalendars,
            data: { enabledOnly: false }
        }).then(msg => {
            this.setState({ calendars: msg.data });
        });

        this.msgClient.sendMsg({
            opt: MsgType.getConfig,
            data: ['trackedPeriods']
        }).then(msg => {
            let config = {
                trackedPeriods: msg.data.trackedPeriods.map((p: TrackPeriodFlat) => (
                    TrackPeriod.inflate(p)
                ))
            };
            console.log(msg.data.trackedPeriods);
            this.setState({ config });
        });

        this.dialogPromiseResolver = null;
    }

    handleLogin = () => {
        gapi.login().then(() => {
            this.setState({ isLoggedIn: true });
            this.loadAll(true);
        }).catch(() => this.handleSnackbarOpen("Failed to login!"));
    }

    handleLogout = () => {
        this.handleDialogOpen("Logout", "Are you sure to logout?").then(ans => {
            if (!ans) return;
            gapi.logout().then(() => {
                this.setState({ isLoggedIn: false });
                //this.loadPatterns([], 'analyze');
            }).catch(() => this.handleSnackbarOpen("Failed to logout!"));
        });
    }

    handleToggleCalendar = (id: string) => {
        var calendars = {...this.state.calendars};
        calendars[id].enabled = !calendars[id].enabled;
        this.msgClient.sendMsg({
            opt: MsgType.updateCalendars,
            data: calendars
        }).then(() => this.setState({ calendars }));
    }

    async loadAll(loadPatterns = false) {
        await new Promise(resolver => (this.setState({ calendarsLoading: true }, resolver)));

        let pm_colors = gapi.getAuthToken().then(gapi.getColors).then(color => {
            return color.calendar;
        });
        let pm_cals = gapi.getAuthToken().then(gapi.getCalendars);
        let [colors, _cals] = await Promise.all([pm_colors, pm_cals]);
        var cals: { [id: string]: gapi.GCalendarMeta } = {};
        _cals.forEach((cal: any) => {
            cals[cal.id] = {
                name: cal.summary,
                color: colors[cal.colorId],
                enabled: true
            };
        });
        this.loadCalendars(cals);
        if (loadPatterns) this.loadDefaultPatterns();
        this.setState({ calendarsLoading: false });
    };

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
        this.loadPatterns(patterns, 'main');
    }

    loadCalendars = (calendars: {[ id: string ]: gapi.GCalendarMeta }) => {
        for (let id in this.state.calendars) {
            if (calendars.hasOwnProperty(id))
                calendars[id].enabled = this.state.calendars[id].enabled;
        }
        this.msgClient.sendMsg({
            opt: MsgType.updateCalendars,
            data: calendars
        }).then(() => this.setState({ calendars }));
    };

    loadPatterns = (patterns: PatternEntry[], id: string) => {
        this.msgClient.sendMsg({
            opt: MsgType.updatePatterns,
            data: { id, patterns: patterns.map(p => p.deflate()) }
        }).then(() => this.setState({ patterns }));
    };

    updatePattern = (field: string, idx: number, value: any) => {
        let patterns = this.state.patterns;
        (patterns[idx] as {[key: string]: any})[field] = value;
        this.loadPatterns(patterns, 'main');
    };

    removePattern = (idx: number) => {
        let patterns = this.state.patterns;
        patterns.splice(idx, 1);
        for (let i = 0; i < patterns.length; i++)
            patterns[i].idx = i;
        this.loadPatterns(patterns, 'main');
    };

    newPattern = () => {
        let patterns = [PatternEntry.defaultPatternEntry(0), ...this.state.patterns];
        for (let i = 1; i < patterns.length; i++)
            patterns[i].idx = i;
        this.loadPatterns(patterns, 'main');
    };

    handleSnackbarClose = (event: any, reason: string) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
    }

    handleSnackbarOpen = (msg: string) => {
        this.setState({ snackBarOpen: true, snackBarMsg: msg });
    }

    handleDialogOpen = (title: string, message: string) => {
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

    updateTrackedPeriods = (trackedPeriods: TrackPeriod[]) => {
        this.msgClient.sendMsg({
            opt: MsgType.updateConfig,
            data: { trackedPeriods: trackedPeriods.map(p => p.deflate()) }
        }).then(() => this.setState({...this.state.config, trackedPeriods }));
    }

    handlePeriodNameChange = (idx: number) => (name: string) => {
        let trackedPeriods = [...this.state.config.trackedPeriods];
        trackedPeriods[idx].name = name;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodFromChange = (idx: number) => (duration: Duration) => {
        let trackedPeriods = [...this.state.config.trackedPeriods];
        trackedPeriods[idx].start = duration;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodToChange = (idx: number) => (duration: Duration) => {
        let trackedPeriods = [...this.state.config.trackedPeriods];
        trackedPeriods[idx].end = duration;
        this.updateTrackedPeriods(trackedPeriods);
    }

    render() {
        const { classes } = this.props;
        return (
            <div>
                <AlertDialog
                    title={this.state.dialogMsg.title}
                    message={this.state.dialogMsg.message}
                    open={this.state.dialogOpen}
                    handleClose={this.handleDialogClose}/>
                <Snackbar
                    message={this.state.snackBarMsg}
                    open={this.state.snackBarOpen}
                    variant='error'
                    onClose={this.handleSnackbarClose}/>
               <Typography variant="h6" component="h1" gutterBottom>
                   General
               </Typography>
               <Table>
                   <TableBody>
                       <TableRow>
                           <STableCell className={classes.tableHead}>Account</STableCell>
                           <STableCell className={classes.tableContent}>
                               {
                                   (this.state.isLoggedIn &&
                                       <Button variant="contained" color="primary" onClick={this.handleLogout}>Logout</Button>) ||
                                       <Button variant="contained" color="primary" onClick={this.handleLogin}>Login</Button>
                               }
                           </STableCell>
                       </TableRow>
                       <TableRow>
                           <STableCell className={classes.tableHead}>
                           <IconButton
                               style={{marginBottom: '0.12em', marginRight: '0.5em'}}
                               onClick={() => this.loadAll(false)}
                               disabled={this.state.calendarsLoading || !this.state.isLoggedIn}>
                               <RefreshIcon />
                           </IconButton>
                               Calendars
                           </STableCell>
                           <STableCell className={classes.tableContent}>
                               {(this.state.isLoggedIn &&
                               <List className={classes.calendarList}>
                                   {Object.keys(this.state.calendars).map(id =>
                                       <CompactListItem
                                           key={id}
                                           onClick={() => this.handleToggleCalendar(id)}
                                           disableGutters
                                           dense button >
                                       <Checkbox
                                           checked={this.state.calendars[id].enabled}
                                           disableRipple />
                                       <ListItemText primary={this.state.calendars[id].name} />
                                       </CompactListItem>)}
                               </List>) || 'Please Login.'}
                           </STableCell>
                       </TableRow>
                       <TableRow>
                           <STableCell className={classes.tableHead}>
                               <IconButton
                                   style={{marginBottom: '0.12em', marginRight: '0.5em'}}
                                   onClick={() => this.newPattern()}
                                   disabled={!this.state.isLoggedIn}><AddCircleIcon /></IconButton>
                               Tracked Events
                               <div>
                               <Button
                                   variant="contained"
                                   color="primary"
                                   onClick={() => this.loadDefaultPatterns()}>Load Default</Button>
                               </div>
                           </STableCell>
                           <STableCell className={classes.tableContent}>
                               {(this.state.isLoggedIn &&
                               <FormControl fullWidth={true}>
                               <PatternTable
                                   patterns={this.state.patterns}
                                   calendars={this.state.calendars}
                                   onRemovePattern={this.removePattern}
                                   onUpdatePattern={this.updatePattern} />
                               </FormControl>) || 'Please Login.'}
                           </STableCell>
                       </TableRow>
                       <TableRow>
                           <STableCell className={classes.tableHead}>
                                Tracked Time Range
                           </STableCell>
                           <STableCell className={classes.tableContent}>
                               {this.state.config.trackedPeriods &&
                                   this.state.config.trackedPeriods.map((p, idx) =>
                                   <FormGroup key={idx}>
                                   <TrackedPeriod
                                       name={p.name}
                                       fromDuration={p.start}
                                       toDuration={p.end}
                                       nameOnChange={this.handlePeriodNameChange(idx)}
                                       fromOnChange={this.handlePeriodFromChange(idx)}
                                       toOnChange={this.handlePeriodToChange(idx)}/>
                                   </FormGroup>)}
                           </STableCell>
                       </TableRow>
                   </TableBody>
               </Table>
            </div>
        );
    }
}

const StyledSettings = withStyles(styles)(Settings);

export default StyledSettings;
