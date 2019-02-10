import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
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
import { msgType, MsgClient } from './msg';
import { Pattern, PatternEntry } from './pattern';
import PatternTable from './PatternTable';
import Snackbar from './Snackbar';
import AlertDialog from './Dialog';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { Duration } from './duration';

const styles = theme => ({
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

class TrackedPeriod extends React.Component {
    valueOnChange = (old, onChange) => event => {
        onChange(new Duration(event.target.value, old.unit));
    }

    unitOnChange = (old, onChange) => event => {
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

    render() {
        let { classes, fromDuration, toDuration, nameOnChange, fromOnChange, toOnChange, name } = this.props;
        let units = [
            <MenuItem key='days' value='days'>Day(s)</MenuItem>,
            <MenuItem key='weeks' value='weeks'>Week(s)</MenuItem>,
            <MenuItem key='months' value='months'>Month(s)</MenuItem>
        ];
        return (
            <span>
                <TextField
                    inputProps={{ style: TrackedPeriod.styles.periodName}}
                    value={name}
                    onChange={event => nameOnChange(event.target.value)}/>:
                from <TextField
                    inputProps={{style: TrackedPeriod.styles.periodValue}}
                    value={fromDuration.value}
                    onChange={this.valueOnChange(fromDuration, fromOnChange)} />
                <Select value={fromDuration.unit}
                    onChange={this.unitOnChange(fromDuration, fromOnChange)}>{units}</Select> ago
                to <TextField
                    inputProps={{style: TrackedPeriod.styles.periodValue}}
                    value={toDuration.value}
                    onChange={this.valueOnChange(toDuration, toOnChange)} />
                <Select value={toDuration.unit}
                    onChange={this.unitOnChange(toDuration, toOnChange)}>{units}</Select> ago
            </span>
        );
    }
}

class Settings extends React.Component {
    state = {
        isLoggedIn: false,
        patterns: [],
        calendars: {},
        config: {},
        snackBarOpen: false,
        snackBarMsg: 'unknown',
        dialogOpen: false,
        dialogMsg: {title: '', message: ''},
    };

    constructor(props) {
        super(props);
        gapi.getLoggedIn().then(b => this.setState({ isLoggedIn: b }));

        this.msgClient = new MsgClient('main');

        this.msgClient.sendMsg({
            type: msgType.getPatterns,
            data: { id: 'main' }
        }).then(msg => {
            this.setState({ patterns: msg.data.map(p => PatternEntry.inflate(p)) });
        });

        this.msgClient.sendMsg({
            type: msgType.getCalendars,
            data: { enabledOnly: false }
        }).then(msg => {
            this.setState({ calendars: msg.data });
        });

        this.msgClient.sendMsg({
            type: msgType.getConfig,
            data: ['trackedPeriods']
        }).then(msg => {
            let config = {
                trackedPeriods: msg.data.trackedPeriods.map(p => {
                    return {
                        start: Duration.inflate(p.start),
                        end: Duration.inflate(p.end),
                        name: p.name
                    };
                })
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

    handleToggleCalendar = id => {
        var calendars = {...this.state.calendars};
        calendars[id].enabled = !calendars[id].enabled;
        this.msgClient.sendMsg({
            type: msgType.updateCalendars,
            data: calendars
        }).then(() => this.setState({ calendars }));
    }

    loadAll = loadDefaultPatterns => {
        let colors = gapi.getAuthToken().then(gapi.getColors).then(color => {
            return color.calendar;
        });
        let cals = gapi.getAuthToken().then(gapi.getCalendars);
        Promise.all([colors, cals]).then(([colors, items]) => {
            var cals = {};
            items.forEach(item => {
                cals[item.id] = {
                    name: item.summary,
                    color: colors[item.colorId],
                    enabled: true
                    //cal: new gapi.GCalendar(item.id, item.summary)
                }});
            this.loadCalendars(cals);
            if (loadDefaultPatterns)
            {
                this.loadPatterns(items.map((item, idx) => {
                    return new PatternEntry(item.summary, idx,
                        new Pattern(item.id, false, item.summary, item.summary),
                        Pattern.anyPattern());
                }), 'main');
            }
        });
    };

    loadCalendars = calendars => {
        for (let id in this.state.calendars) {
            if (calendars.hasOwnProperty(id))
                calendars[id].enabled = this.state.calendars[id].enabled;
        }
        this.msgClient.sendMsg({
            type: msgType.updateCalendars,
            data: calendars
        }).then(() => this.setState({ calendars }));
    };

    loadPatterns = (patterns, id) => {
        this.msgClient.sendMsg({
            type: msgType.updatePatterns,
            data: { id, patterns: patterns.map(p => p.deflate()) }
        }).then(() => this.setState({ patterns }));
    };

    updatePattern = (field, idx, value) => {
        let patterns = this.state.patterns;
        patterns[idx][field] = value;
        this.loadPatterns(patterns);
    };

    removePattern = idx => {
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

    handleSnackbarClose = (event, reason) => {
        if (reason === 'clickaway') return;
        this.setState({ snackBarOpen: false });
    }

    handleSnackbarOpen = msg => {
        this.setState({ snackBarOpen: true, snackBarMsg: msg });
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

    updateTrackedPeriods = trackedPeriods => {
        this.msgClient.sendMsg({
            type: msgType.updateConfig,
            data: { trackedPeriods: trackedPeriods.map(p => p.deflate()) }
        }).then(() => this.setState({...this.state.config, trackedPeriods }));
    }

    handlePeriodNameChange = idx => name => {
        let trackedPeriods = [...this.state.config.trackedPeriods];
        trackedPeriods[idx].name = name;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodFromChange = idx => duration => {
        let trackedPeriods = [...this.state.config.trackedPeriods];
        trackedPeriods[idx].start = duration;
        this.updateTrackedPeriods(trackedPeriods);
    }

    handlePeriodToChange = idx => duration => {
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
                               disabled={!this.state.isLoggedIn}><RefreshIcon /></IconButton>
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
                                   <FormGroup>
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

Settings.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(Settings);
