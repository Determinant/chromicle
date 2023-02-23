import React from 'react';
import ReactDOM from 'react-dom';
import { Theme, withStyles, StyleRules, MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import RefreshIcon from '@material-ui/icons/Refresh';
import Divider from '@material-ui/core/Divider';
import CircularProgress from '@material-ui/core/CircularProgress';

import Logo from './Logo';
import { theme } from './theme';
import { DoughnutChart } from './Chart';
import { MsgType, MsgClient } from './msg';
import { GraphData } from './graph';
import moment from 'moment';

function openOptions() {
    chrome.tabs.create({ url: "index.html" });
}

const styles = (theme: Theme): StyleRules => ({
    content: {
        padding: theme.spacing(1),
        overflow: 'auto',
    },
    buttons: {
        width: 400,
        height: 48,
        lineHeight: '48px'
    },
    buttonSpacer: {
        marginBottom: theme.spacing(2),
    },
    loading: {
        textAlign: 'center'
    }
});

type PopupProps = {
    classes: {
        content: string,
        buttons: string,
        buttonSpacer: string,
        loading: string
    }
};

class _Popup extends React.Component<PopupProps> {
    msgClient: MsgClient;
    state = {
        patternGraphData: [] as GraphData[],
        loading: false,
    };
    constructor(props: PopupProps) {
        super(props);
        this.msgClient = new MsgClient('main');
        this.state.loading = true;
        this.loadGraphData(false).then(() => this.setState({ loading: false }));
    }

    loadGraphData(sync: boolean) {
        return this.msgClient.sendMsg({
            opt: MsgType.getGraphData,
            data: { sync }
        }).then(msg => {
            this.setState({ patternGraphData: msg.data.map((d: GraphData) => ({
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
                    new Promise<void>(resolver => (
                        this.setState({ loading: true }, resolver)))
                        .then(() => this.loadGraphData(true))
                        .then(() => this.setState({ loading: false }))
                )}><RefreshIcon />
            </IconButton>
            </div>
            <div className={classes.buttonSpacer} />
            {
                (data.length > 0 &&
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
                        <DoughnutChart height={300} data={d.data} />) ||
                    <Typography variant="subtitle1" align="center" color="textSecondary">
                        No matching events.
                    </Typography>}
                    {idx + 1 < data.length && <Divider />}
                    </div>
                ))) || (
                    <div className={classes.loading}><CircularProgress color="primary" /></div>
                )
            }
            </main>
            </MuiThemeProvider>
        );
    }
}

const Popup = withStyles(styles)(_Popup);

ReactDOM.render(<Popup />, document.getElementById('root'));
