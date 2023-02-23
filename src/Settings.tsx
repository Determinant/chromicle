import React from 'react';
import classNames from 'classnames';
import { Theme, withStyles, StyleRules } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
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
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { getColorFamily } from 'materialcolorize';
import { SlideDown } from 'react-slidedown';
import 'react-slidedown/lib/slidedown.css';

import PatternTable from './PatternTable';
import Snackbar, { SnackbarVariant } from './Snackbar';
import AlertDialog from './Dialog';
import * as gapi from './gapi';
import { MsgType, MsgClient } from './msg';
import { Pattern, PatternEntry, PatternEntryFlat } from './pattern';
import { DurationFlat, TrackedPeriodFlat } from './duration';

const styles = (theme: Theme): StyleRules => ({
    patternTable: {
        marginLeft: -24
    },
    tableHead: {
        verticalAlign: 'top',
        textAlign: 'right',
        lineHeight: '3em',
        minWidth: 250,
        width: '20%'
    },
    tableContent: {
        textAlign: 'left',
        maxWidth: 400,
    },
    list: {
        marginLeft: -12
    },
    calendarList: {
        maxHeight: 200,
        overflowY: 'auto'
    },
    bottomButtons: {
        marginTop: 10,
        textAlign: 'right',
        minWidth: 650
    },
    trackedPeriodInput: {
        paddingTop: 10,
        paddingBottom: 20,
        overflowX: 'auto'
    }
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

type TrackedPeriodInputProps = {
    name: string
    fromDuration: DurationFlat,
    toDuration: DurationFlat,
    nameOnChange: (name: string) => void,
    fromOnChange: (d: DurationFlat) => void,
    toOnChange: (d: DurationFlat) => void
};

class TrackedPeriodInput extends React.Component<TrackedPeriodInputProps> {
    valueOnChange = (old: DurationFlat, onChange: (d: DurationFlat) => void) => (
        (event: React.ChangeEvent<HTMLInputElement>) => {
            onChange({ value: event.target.value, unit: old.unit});
        }
    );

    unitOnChange = (old: DurationFlat, onChange: (d: DurationFlat) => void) => (
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            onChange({ value: old.value, unit: event.target.value});
        }
    );

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
        let {
            fromDuration, toDuration,
            nameOnChange, name,
            fromOnChange, toOnChange
        } = this.props;

        let units = [
            <MenuItem key='days' value='days'>Day(s)</MenuItem>,
            <MenuItem key='weeks' value='weeks'>Week(s)</MenuItem>,
            <MenuItem key='months' value='months'>Month(s)</MenuItem>
        ];

        return (
            <span>
                <TextField
                    inputProps={TrackedPeriodInput.styles.periodName}
                    value={name}
                    onChange={event => nameOnChange(event.target.value)}/>:
                from <TextField
                    error={TrackedPeriodInput.toValue(fromDuration.value) === null}
                    inputProps={TrackedPeriodInput.styles.periodValue}
                    value={fromDuration.value}
                    onChange={this.valueOnChange(fromDuration, fromOnChange)} />
                <Select value={fromDuration.unit}
                    onChange={this.unitOnChange(fromDuration, fromOnChange)}>{units}</Select> ago
                to <TextField
                    error={TrackedPeriodInput.toValue(toDuration.value) === null}
                    inputProps={TrackedPeriodInput.styles.periodValue}
                    value={toDuration.value}
                    onChange={this.valueOnChange(toDuration, toOnChange)} />
                <Select value={toDuration.unit}
                    onChange={this.unitOnChange(toDuration, toOnChange)}>{units}</Select> ago
            </span>
        );
    }
}

type SettingsProps = {
    classes: {
        tableHead: string,
        tableContent: string,
        calendarList: string,
        patternTableCell: string,
        bottomButtons: string,
        trackedPeriodInput: string,
        list: string,
        patternTable: string
    }
};

class Settings extends React.Component<SettingsProps> {
    msgClient: MsgClient;
    dialogPromiseResolver: (r: boolean) => void;

    state = {
        isLoggedIn: false,
        patterns: [] as PatternEntry[],
        calendars: {} as {[id: string]: gapi.GCalendarMeta},
        trackedPeriods: [] as TrackedPeriodFlat[],
        overrideNewTab: false,
        snackBarOpen: false,
        snackBarMsg: 'unknown',
        snackBarVariant: 'error' as SnackbarVariant,
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
        calendarsLoading: false,
    };

    constructor(props: SettingsProps) {
        super(props);
        this.msgClient = new MsgClient('main');

        this.msgClient.sendMsg({
            opt: MsgType.getLoggedIn,
            data: {}
        }).then(msg => {
            this.setState({ isLoggedIn: msg.data })
        });

        this.msgClient.sendMsg({
            opt: MsgType.getPatterns,
            data: { id: 'main' }
        }).then(msg => {
            this.setState({
                patterns: msg.data.map((p: PatternEntryFlat) => PatternEntry.inflate(p))
            });
        });

        this.msgClient.sendMsg({
            opt: MsgType.getCalendars,
            data: { enabledOnly: false }
        }).then(msg => {
            this.setState({ calendars: msg.data });
        });

        this.msgClient.sendMsg({
            opt: MsgType.getConfig,
            data: ['trackedPeriods', 'overrideNewTab']
        }).then(msg => {
            let config = {
                trackedPeriods: msg.data.trackedPeriods,
                overrideNewTab: msg.data.overrideNewTab
            };
            console.log(msg.data.trackedPeriods);
            this.setState(config);
        });

        this.dialogPromiseResolver = null;
    }

    handleLogin = async () => {
        try {
            let resp = await this.msgClient.sendMsg({ opt: MsgType.login, data: {} });
            if (!resp.data) throw new Error("backend failes to login");
            this.setState({ isLoggedIn: true });
            this.loadAll(true);
        } catch (_) {
            this.openSnackbar("Failed to login!", 'error' as SnackbarVariant);
        }
    }

    handleLogout = async () => {
        let ans = await this.openDialog("Logout", "Are you sure to logout?");
        if (!ans) return;
        try {
            let resp = await this.msgClient.sendMsg({ opt: MsgType.logout, data: {} });
            if (!resp.data) throw new Error("backend fails to logout");
            await this.msgClient.sendMsg({ opt: MsgType.clearCache, data: {} });
            this.setState({ isLoggedIn: false });
        } catch (err) {
            console.log(err);
            this.openSnackbar("Failed to logout!", 'error' as SnackbarVariant);
        }
    }

    toggleCalendar(id: string) {
        var calendars = {...this.state.calendars};
        calendars[id].enabled = !calendars[id].enabled;
        this.setState({ calendars });
    }

    async loadAll(reloadAll = false): Promise<void> {
        await new Promise<void>(resolver => (this.setState({ calendarsLoading: true }, resolver)));

        try {
            let pm_colors = this.msgClient.sendMsg(
                { opt: MsgType.fetchColors, data: {} }).then(msg => msg.data.calendar);
            let pm_cals = this.msgClient.sendMsg(
                { opt: MsgType.fetchCalendars, data: {} }).then(msg => msg.data);
            let [colors, _cals] = await Promise.all([pm_colors, pm_cals]);
            var cals: { [id: string]: gapi.GCalendarMeta } = {};
            _cals.forEach((cal: any) => {
                let _color = colors[cal.colorId];
                cals[cal.id] = {
                    name: cal.summary,
                    color: {
                        background: ('#' + getColorFamily(_color.background)[300]).toLowerCase()
                    },
                    enabled: true
                };
            });

            let pms = [this.loadCalendars(cals, reloadAll)];
            if (reloadAll)
                pms.push(this.loadDefaultPatterns(cals));
            await Promise.all(pms);
            if (reloadAll) this.handleApply();
        } catch (err) {
            console.log(err);
            this.openSnackbar("Failed to update calendars!", 'error' as SnackbarVariant);
        } finally {
            this.setState({ calendarsLoading: false });
        }
    };

    loadDefaultPatterns(calendars: {[ id: string ]: gapi.GCalendarMeta }) {
        let patterns = [];
        let idx = 0;
        for (let id in calendars) {
            let cal = calendars[id];
            if (!calendars[id].enabled) continue;
            patterns.push(new PatternEntry(cal.name, idx++,
                new Pattern(id, false, cal.name, cal.name),
                Pattern.anyPattern(),
                cal.color));
        }
        this.loadPatterns(patterns, 'main');
    }

    loadCalendars(calendars: {[ id: string ]: gapi.GCalendarMeta }, enabled = false) {
        if (!enabled)
            for (let id in this.state.calendars) {
                if (calendars.hasOwnProperty(id))
                    calendars[id].enabled = this.state.calendars[id].enabled;
            }
        this.setState({ calendars });
    }

    loadPatterns(patterns: PatternEntry[], id: string) {
        this.setState({ patterns });
    }

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

    openSnackbar(msg: string, variant: SnackbarVariant) {
        this.setState({ snackBarOpen: true, snackBarMsg: msg, snackBarVariant: variant });
    }

    handleSnackbarClose = (event: any, reason: string) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
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

    updateTrackedPeriods = (trackedPeriods: TrackedPeriodFlat[]) => {
        this.setState({ trackedPeriods });
    }

    handlePeriodNameChange = (idx: number) => (name: string) => {
        let trackedPeriods = [...this.state.trackedPeriods];
        trackedPeriods[idx].name = name;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodFromChange = (idx: number) => (duration: DurationFlat) => {
        let trackedPeriods = [...this.state.trackedPeriods];
        trackedPeriods[idx].start = duration;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodToChange = (idx: number) => (duration: DurationFlat) => {
        let trackedPeriods = [...this.state.trackedPeriods];
        trackedPeriods[idx].end = duration;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handleApply = async () => {
        let trackedPeriods = this.state.trackedPeriods;
        if (trackedPeriods.some(p => (
                TrackedPeriodInput.toValue(p.start.value) === null ||
                TrackedPeriodInput.toValue(p.end.value) === null ))) {
            this.openSnackbar("Invalid time range!", 'error' as SnackbarVariant);
            return;
        }

        let pm1 = this.msgClient.sendMsg({
            opt: MsgType.updateCalendars,
            data: this.state.calendars
        });
        let pm2 = this.msgClient.sendMsg({
            opt: MsgType.updatePatterns,
            data: { id: 'main', patterns: this.state.patterns.map(p => p.deflate()) }
        });
        let pm3 = this.msgClient.sendMsg({
            opt: MsgType.updateConfig,
            data: { trackedPeriods }
        });
        let pm4 = this.msgClient.sendMsg({
            opt: MsgType.updateConfig,
            data: {'overrideNewTab': this.state.overrideNewTab }
        });

        await Promise.all([pm1, pm2, pm3]);
        this.openSnackbar("Saved changes.", 'success' as SnackbarVariant);
    }

    handleLoadDefault = async () => {
        let ans = await this.openDialog("Load Default", "Load the calendars as patterns?");
        if (!ans) return;
        this.loadDefaultPatterns(this.state.calendars);
    }

    toggleOverrideNewTab() {
        this.setState({ overrideNewTab: !this.state.overrideNewTab });
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
                    variant={this.state.snackBarVariant}
                    onClose={this.handleSnackbarClose}/>
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
                           <STableCell className={classes.tableContent} style={{paddingRight: 0}}>
                               {(this.state.isLoggedIn &&
                                <div className={classNames(classes.calendarList, classes.list)}>
                                <SlideDown className={'my-dropdown-slidedown'}>
                                <List disablePadding>
                                   {Object.keys(this.state.calendars).sort().map(id =>
                                        <CompactListItem
                                            key={id}
                                            onClick={() => this.toggleCalendar(id)}
                                            disableGutters
                                            dense button >
                                        <Checkbox
                                            checked={this.state.calendars[id].enabled}
                                            disableRipple />
                                        <ListItemText primary={this.state.calendars[id].name} />
                                        </CompactListItem>)}
                                </List>
                                </SlideDown></div>) || 'Please Login.'}
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
                                   onClick={this.handleLoadDefault}>Load Default</Button>
                               </div>
                           </STableCell>
                           <STableCell className={classes.tableContent} style={{paddingRight: 0}}>
                               {(this.state.isLoggedIn &&
                               <FormControl fullWidth={true} className={classes.patternTable}>
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
                               <div className={classes.trackedPeriodInput}>
                                <div style={{minWidth: 600}}>
                               {this.state.trackedPeriods &&
                                   this.state.trackedPeriods.map((p, idx) =>
                                   <FormGroup key={idx}>
                                   <TrackedPeriodInput
                                       name={p.name}
                                       fromDuration={p.start}
                                       toDuration={p.end}
                                       nameOnChange={this.handlePeriodNameChange(idx)}
                                       fromOnChange={this.handlePeriodFromChange(idx)}
                                       toOnChange={this.handlePeriodToChange(idx)}/>
                                   </FormGroup>)}
                                </div>
                                </div>
                           </STableCell>
                       </TableRow>
                       <TableRow>
                           <STableCell className={classes.tableHead}>
                            Misc
                           </STableCell>
                           <STableCell className={classNames(classes.tableContent, classes.list)}>
                               <List disablePadding>
                                <CompactListItem
                                        key="overrideNewTab"
                                        onClick={() => this.toggleOverrideNewTab()}
                                        disableGutters dense button>
                                    <Checkbox
                                        checked={this.state.overrideNewTab}
                                        disableRipple />
                                    <ListItemText primary="Show graphs when open a new tab" />
                                </CompactListItem>
                               </List>
                           </STableCell>
                       </TableRow>
                   </TableBody>
               </Table>
               <div className={classes.bottomButtons}>
               <Button
                    variant="contained"
                    color="primary"
                    onClick={this.handleApply}>Apply</Button>
                </div>
            </div>
        );
    }
}

export default withStyles(styles)(Settings);
