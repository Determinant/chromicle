import React from 'react';
import ReactDOM from 'react-dom';
import { Theme, withStyles, StyleRules, MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import RefreshIcon from '@material-ui/icons/Refresh';
import Grid from '@material-ui/core/Grid';
import CircularProgress from '@material-ui/core/CircularProgress';

import Logo from './Logo';
import { theme } from './theme';
import { DoughnutChart } from './Chart';
import { MsgType, MsgClient } from './msg';
import { GraphData } from './graph';
import moment from 'moment';

const styles = (theme: Theme): StyleRules => ({
    content: {
        padding: theme.spacing(1),
        overflow: 'auto',
    },
    buttons: {
        width: '100%',
        height: 0,
        lineHeight: '48px'
    },
    buttonSpacer: {
        marginBottom: theme.spacing(2),
    },
    loading: {
        textAlign: 'center'
    }
});

type TabProps = {
    classes: {
        content: string,
        buttons: string,
        buttonSpacer: string,
        loading: string
    }
};


class _Tab extends React.Component<TabProps> {
    msgClient: MsgClient;
    state = {
        patternGraphData: [] as GraphData[],
        loading: false,
    };
    constructor(props: TabProps) {
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
        console.log(data);
        return (
            <MuiThemeProvider theme={theme}>
            <CssBaseline />
            <main className={classes.content}>
            <div className={classes.buttons}>
            <Logo style={{height: 48, verticalAlign: 'bottom'}}/>
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
            <Grid container spacing={0} style={{ maxWidth: 900, minWidth: 640, margin: '0 auto' }}>
            {
                (data.length > 0 &&
                data.map((d, idx) => (
                    <Grid item key={idx} xs={12} md={6}>
                    <Typography variant="subtitle1" align="center" color="textPrimary">
                    {d.name}
                    </Typography>
                    <Typography variant="caption" align="center">
                    {`${moment(d.start).format('ddd, MMM Do, YYYY')} -
                    ${moment(d.end).format('ddd, MMM Do, YYYY')}`}
                    </Typography>
                    <DoughnutChart
                        data={d.data}
                        height={400}
                        borderWidth={2}
                        paddingTop={20}
                        paddingBottom={50}
                        labelFontSize={14} />
                    </Grid>
                ))) || (
                    <div className={classes.loading}><CircularProgress color="primary" /></div>
                )
            }
            </Grid>
            </main>
            </MuiThemeProvider>
        );
    }
}

const Tab = withStyles(styles)(_Tab);

ReactDOM.render(<Tab />, document.getElementById('root'));
