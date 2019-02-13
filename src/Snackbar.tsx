import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import amber from '@material-ui/core/colors/amber';
import Snackbar from '@material-ui/core/Snackbar';
import SnackbarContent from '@material-ui/core/SnackbarContent';
import ErrorIcon from '@material-ui/icons/Error';
import WarningIcon from '@material-ui/icons/Warning';
import CloseIcon from '@material-ui/icons/Close';
import IconButton from '@material-ui/core/IconButton';

// modified from https://material-ui.com/demos/snackbars/

const variantIcon = {
    error: ErrorIcon,
    warning: WarningIcon,
};

const styles = theme => ({
    error: {
        backgroundColor: theme.palette.error.dark,
    },
    warning: {
        backgroundColor: amber[700],
    },
    icon: {
        fontSize: 20,
    },
    iconVariant: {
        opacity: 0.9,
        marginRight: theme.spacing.unit,
    },
    message: {
        display: 'flex',
        alignItems: 'center',
    },
});

function CustomSnackbar(props) {
    const { classes, className, message, variant, open, onClose, ...other } = props;
    const Icon = variantIcon[variant];
    return (
        <Snackbar
            anchorOrigin={{
                vertical: 'top',
                horizontal: 'center',
            }}
            open={open}
            autoHideDuration={10000}
            onClose={onClose}>
            <SnackbarContent
                className={classNames(classes[variant], className)}
                aria-describedby="snackbar-content"
                message={
                    <span id="snackbar-content" className={classes.message}>
                        <Icon className={classNames(classes.icon, classes.iconVariant)} />
                        {message}
                    </span>
                }
                action={[
                    <IconButton
                        key="close"
                        aria-label="Close"
                        color="inherit"
                        className={classes.close}
                        onClick={onClose}
                    >
                        <CloseIcon className={classes.icon} />
                    </IconButton>,
                ]}
                {...other}
            />
        </Snackbar>
    );
}

export default withStyles(styles)(CustomSnackbar);
