import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import Grid from '@material-ui/core/Grid';
import AddCircleIcon from '@material-ui/icons/AddCircle';
import IconButton from '@material-ui/core/IconButton';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import * as gapi from './gapi';
import { msgType, MsgClient } from './msg';
import { Pattern, PatternEntry } from './pattern';

const styles = theme => ({
});

const STableCell = withStyles(theme => ({
    body: {
        fontSize: 16,
    },
}))(TableCell);

class Settings extends React.Component {
    state = {
        isLoggedIn: false
    };

    constructor(props) {
        super(props);
        gapi.getLoggedIn().then(b => this.setState({ isLoggedIn: b }));
    }

    handleLogin = () => {
        gapi.login().then(() => this.setState({ isLoggedIn: true }));
    }

    handleLogout = () => {
        gapi.logout().then(() => this.setState({ isLoggedIn: false }));
    }

    render() {
        const { classes } = this.props;
        return (
            <Grid container spacing={16}>
                <Grid item md={6} xs={12}>
                    <Typography variant="h6" component="h1" gutterBottom>
                        General
                    </Typography>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <STableCell align='right'>Account</STableCell>
                                <STableCell align='left'>
                                    {
                                        (this.state.isLoggedIn &&
                                            <Button variant="contained" color="primary" onClick={this.handleLogout}>Logout</Button>) ||
                                            <Button variant="contained" color="primary" onClick={this.handleLogin}>Login</Button>
                                    }
                                </STableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Grid>
            </Grid>
        );
    }
}

Settings.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(Settings);
