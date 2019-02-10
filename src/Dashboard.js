import React from 'react';
import PropTypes from 'prop-types';
import 'typeface-roboto';
import { withStyles } from '@material-ui/core/styles';
import { MuiThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Grid from '@material-ui/core/Grid';
import { HashRouter as Router, withRouter, Route, Link, Redirect, Switch } from "react-router-dom";
import { hashHistory } from 'react-router';
import Logo from './Logo';
import theme from './theme';
import Analyze from './Analyze';
import Settings from './Settings';

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
        display: 'inline-block'
    },
    appBarSpacer: theme.mixins.toolbar,
    content: {
        flexGrow: 1,
        padding: theme.spacing.unit * 3,
        overflow: 'auto',
    },
    indicator: {
        backgroundColor: theme.palette.primary.contrastText
    }
});

class DashboardTabs extends React.Component {
    handleChangeTab = (event, currentTab) => {
        this.props.history.push(currentTab);
    }
    render() {
        const { classes } = this.props;
        return (
            <div className={classes.root}>
                <AppBar
                    position="absolute"
                    className={classes.appBar}>
                    <Toolbar className={classes.toolbar}>
                        <Typography component="h1" variant="h6" color="inherit" noWrap className={classes.title}>
                            <Logo style={{width: '2em', verticalAlign: 'bottom', marginRight: '0.2em'}}/>Chromicle
                        </Typography>
                        <Tabs styles={{ display: 'inline-block '}}
                            classes={{ indicator: classes.indicator }}
                            value={this.props.history.location.pathname}
                            onChange={this.handleChangeTab}>
                            <Tab label="Settings" component={Link} to="/settings" value="/settings" />
                            <Tab label="Analyze" component={Link} to="/analyze" value="/analyze" />
                        </Tabs>
                    </Toolbar>
                </AppBar>
                <CssBaseline />
                <main className={classes.content}>
                    <div className={classes.appBarSpacer} />
                    <Route exact path="/settings" component={Settings} />
                    <Route exact path="/analyze" component={Analyze} />
                    <Route exact path="/" render={() => <Redirect to="/settings" />}/>
                </main>
            </div>
        );
    }
}

DashboardTabs.propTypes = {
    classes: PropTypes.object.isRequired,
};

class Dashboard extends React.Component {
    render() {
        const { classes } = this.props;
        let Tabs = withRouter(withStyles(styles)(DashboardTabs));
        return (
            <MuiThemeProvider theme={theme}>
                <Router><Tabs /></Router>
            </MuiThemeProvider>);
    }
}

export default Dashboard;
