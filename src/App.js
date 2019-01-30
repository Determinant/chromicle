import React from 'react';
import PropTypes from 'prop-types';
import 'typeface-roboto';
import 'react-dates/initialize';
import 'react-dates/lib/css/_datepicker.css';
import { DateRangePicker } from 'react-dates';
import { withStyles, withTheme } from '@material-ui/core/styles';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import orange from '@material-ui/core/colors/orange';
import cyan from '@material-ui/core/colors/cyan';
import CssBaseline from '@material-ui/core/CssBaseline';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TablePagination from '@material-ui/core/TablePagination';
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import DeleteOutlinedIcon from '@material-ui/icons/DeleteOutlined';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import Logo from './Logo';
import * as gapi from './gapi';
import { Pattern, PatternEntry } from './pattern';
import PieChart from './Chart';
import { CalendarField, EventField } from './RegexField';

const default_chart_data = [{name: 'Work', value: 10, color: cyan[300]},
                            {name: 'Wasted', value: 10, color: cyan[300]}];

const theme = createMuiTheme({
    palette: {
        primary: {
            light: orange[300],
            main: orange[500],
            dark: orange[700],
            contrastText: "#fff"
        }
    },
    typography: {
        useNextVariants: true,
    }
});

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
    patternTableWrapper: {
        overflowX: 'auto',
        overflowY: 'hidden'
    },
    patternTable: {
        minWidth: 600
    },
    fab: {
        margin: theme.spacing.unit,
    },
    fieldNoRegex: {
        width: 200
    },
    fieldRegex: {
        marginRight: '0.5em'
    }
});

class Dashboard extends React.Component {
    state = {
        open: true,
        patterns: [],
        page: 0,
        rowsPerPage: 5,
        timeRange: null,
        token: gapi.getAuthToken(),
        patternGraphData: default_chart_data,
        calendarGraphData: default_chart_data,
        activePattern: null
    };

    cached = {
        calendars: {}
    };

    static patternHead = [
        {label: "Name", field: "name", elem: TextField},
        {label: "Calendar", field: "cal", elem: withTheme(theme)(CalendarField)},
        {label: "Event", field: 'event', elem: withTheme(theme)(EventField)}];

    handleChangePage = (event, page) => {
        this.setState({ page });
    };

    handleChangeRowsPerPage = event => {
        this.setState({ rowsPerPage: event.target.value });
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
        let start = this.state.startDate.toISOString();
        let end = this.state.endDate.toISOString();
        let event_pms = [];
        for (let id in this.cached.calendars) {
            event_pms.push(
                this.state.token
                .then(gapi.genEventsGetter(id, start, end))
                .then(items => this.cached.calendars[id].events = items));
        }

        Promise.all(event_pms).then(() => {
            let results = {}; // pattern idx => time
            let cal_results = {}; // cal id => time
            for (let i = 0; i < this.state.patterns.length; i++)
                results[i] = 0;
            for (let id in this.cached.calendars) {
                let patterns = filterPatterns(this.state.patterns, this.cached.calendars[id].name);
                if (!this.cached.calendars[id].events) continue;
                this.cached.calendars[id].events.forEach(event => {
                    if (event.status !== "confirmed") return;
                    patterns.forEach(p => {
                        if (!p.event.regex.test(event.summary)) return;
                        if (cal_results[id] === undefined) {
                            cal_results[id] = 0;
                        }
                        let duration = (new Date(event.end.dateTime) - new Date(event.start.dateTime)) / 60000;
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
                    events: {},
                    color: colors[item.colorId]
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
      const { patterns, rows, rowsPerPage, page } = this.state;
      const nDummy = rowsPerPage - Math.min(rowsPerPage, patterns.length - page * rowsPerPage);

      return (
      <MuiThemeProvider theme={theme}>
        <div className={classes.root}>
          <AppBar
           position="absolute"
           className={classes.appBar}>
            <Toolbar disableGutters={!this.state.open} className={classes.toolbar}>
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
                    <div className={classes.patternTableWrapper}>
                    <Table className={classes.patternTable}>
                      <TableHead>
                        <TableRow>{Dashboard.patternHead.map((s, i) => (<TableCell key={i}>{s.label}</TableCell>))}</TableRow>
                      </TableHead>
                      <TableBody>
                        {patterns.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(p => (
                            <TableRow
                             onMouseOver={() => this.setState({ activePattern: p.idx })}
                             onMouseOut={() => this.setState({ activePattern: null })}>
                                {Dashboard.patternHead.map(s => {
                                    const CustomText = s.elem;
                                    return (
                                <TableCell>
                                  <CustomText
                                   value={p[s.field]}
                                   cached={this.cached}
                                   fieldStyles={{noRegex: classes.fieldNoRegex, regex: classes.fieldRegex}}
                                   onChange={event => this.updatePattern(s.field, p.idx, event.target.value)}/>
                                  </TableCell>)})}
                                  <span style={(this.state.activePattern === p.idx &&
                                                  { position: 'absolute', right: 0, height: 48 }) ||
                                                  { display: 'none' }}>
                                    <DeleteOutlinedIcon
                                     style={{ height: '100%', cursor: 'pointer' }}
                                     onClick={() => this.removePattern(p.idx)} />
                                  </span>
                            </TableRow>))}
                        {nDummy > 0 && (
                            <TableRow style={{ height: 48 * nDummy }}>
                              <TableCell colSpan={Dashboard.patternHead.length} />
                            </TableRow>)}
                      </TableBody>
                    </Table>
                    </div>
                    <TablePagination
                       rowsPerPageOptions={[5, 10, 25]}
                       component="div"
                       count={patterns.length}
                       rowsPerPage={rowsPerPage}
                       page={page}
                       backIconButtonProps={{'aria-label': 'Previous Page'}}
                       nextIconButtonProps={{'aria-label': 'Next Page'}}
                       onChangePage={this.handleChangePage}
                       onChangeRowsPerPage={this.handleChangeRowsPerPage}/>
                  </FormGroup>
                  <FormGroup>
            	    <Typography variant="h6" component="h1" gutterBottom>
            	      Time Range
            	    </Typography>
                    <div style={{textAlign: 'center'}}>
                      <DateRangePicker
    			       startDate={this.state.startDate} // momentPropTypes.momentObj or null,
    			       startDateId="your_unique_start_date_id" // PropTypes.string.isRequired,
    			       endDate={this.state.endDate} // momentPropTypes.momentObj or null,
    			       endDateId="your_unique_end_date_id" // PropTypes.string.isRequired,
    			       onDatesChange={({ startDate, endDate }) => {
                         //if (startDate && endDate)
                         //    this.setState({ timeRange: [startDate.toISOString(), endDate.toISOString()]});
                         this.setState({ startDate, endDate });
                       }} // PropTypes.func.isRequired,
    			       focusedInput={this.state.focusedInput} // PropTypes.oneOf([START_DATE, END_DATE]) or null,
    			       onFocusChange={focusedInput => this.setState({ focusedInput })} // PropTypes.func.isRequired,
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
