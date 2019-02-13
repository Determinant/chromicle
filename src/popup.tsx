import React from 'react';
import ReactDOM from 'react-dom';
import { withStyles, MuiThemeProvider } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import RefreshIcon from '@material-ui/icons/Refresh';
import Logo from './Logo';
import Typography from '@material-ui/core/Typography';
import { theme } from './theme';
import CssBaseline from '@material-ui/core/CssBaseline';
import { PatternEntry } from './pattern';
import { Duration } from './duration';
import { MsgType, MsgClient } from './msg';
import { StyledPatternPieChart } from './Chart';
import Divider from '@material-ui/core/Divider';
import moment from 'moment';

function openOptions() {
    chrome.tabs.create({ url: "index.html" });
}

const styles = theme => ({
    content: {
        padding: theme.spacing.unit * 1,
        overflow: 'auto',
    },
    buttons: {
        width: 400,
        height: 48,
        lineHeight: '48px'
    },
    buttonSpacer: {
        marginBottom: theme.spacing.unit * 2,
    },
});

class Popup extends React.Component {
    state = {
        patternGraphData: [],
        loading: false,
    };
    constructor(props) {
        super(props);
        this.msgClient = new MsgClient('main');
        this.loading = true;
        this.loadGraphData(false).then(() => this.setState({ loading: false }));
    }

    loadGraphData(sync) {
        return this.msgClient.sendMsg({
            type: MsgType.getGraphData,
            data: { sync }
        }).then(msg => {
            this.setState({ patternGraphData: msg.data.map(d => ({
                name: d.name,
                data: d.data,
                start: new Date(d.start),
                end: new Date(d.end)
            }))});
        });
    }

    render() {
        let { classes } = this.props;
        let data = this.state.patternGraphData;
        return (
            <MuiThemeProvider theme={theme}>
            <CssBaseline />
            <main className={classes.content}>
            <div className={classes.buttons}>
            <Logo style={{height: '100%', verticalAlign: 'bottom', marginRight: '1em'}}/>
            <Button variant="contained" color="primary" onClick={openOptions}>Settings</Button>
            <IconButton
                disabled={this.state.loading}
                style={{float: 'right'}}
                onClick={() => (
                    new Promise(resolver => (
                        this.setState({ loading: true }, resolver)))
                        .then(() => this.loadGraphData(true))
                        .then(() => this.setState({ loading: false }))
                )}><RefreshIcon />
            </IconButton>
            </div>
            <div className={classes.buttonSpacer} />
            {
                data.map((d, idx) => (
                    <div key={idx}>
                    <Typography variant="subtitle1" align="center" color="textPrimary">
                    {d.name}
                    </Typography>
                    <Typography variant="caption" align="center">
                    {`${moment(d.start).format('ddd, MMM Do, YYYY')} -
                    ${moment(d.end).format('ddd, MMM Do, YYYY')}`}
                    </Typography>
                    {(d.data.some(dd => dd.value > 1e-3) &&
                    <StyledPatternPieChart data={d.data} />) ||
                    <Typography variant="subtitle1" align="center" color="textSecondary">
                        No data available
                    </Typography>}
                    {idx + 1 < data.length && <Divider />}
                    </div>
                ))
            }
            </main>
            </MuiThemeProvider>
        );
    }
}

const StyledPopup = withStyles(styles)(Popup);

ReactDOM.render(<StyledPopup />, document.getElementById('root'));
