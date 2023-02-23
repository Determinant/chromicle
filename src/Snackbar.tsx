import React from 'react';
import classNames from 'classnames';
import { Theme, withStyles } from '@material-ui/core/styles';
import amber from '@material-ui/core/colors/amber';
import green from '@material-ui/core/colors/green';
import Snackbar from '@material-ui/core/Snackbar';
import SnackbarContent from '@material-ui/core/SnackbarContent';
import ErrorIcon from '@material-ui/icons/Error';
import WarningIcon from '@material-ui/icons/Warning';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CloseIcon from '@material-ui/icons/Close';
import IconButton from '@material-ui/core/IconButton';

// modified from https://material-ui.com/demos/snackbars/

const variantIcon = {
    error: ErrorIcon,
    warning: WarningIcon,
    success: CheckCircleIcon
};

const styles = (theme: Theme) => ({
    error: {
        backgroundColor: theme.palette.error.dark,
    },
    warning: {
        backgroundColor: amber[700],
    },
    success: {
        backgroundColor: green[600],
    },
    icon: {
        fontSize: 20,
    },
    iconVariant: {
        opacity: 0.9,
        marginRight: theme.spacing(1),
    },
    message: {
        display: 'flex',
        alignItems: 'center',
    },
});

export type SnackbarVariant = 'error' | 'warning' | 'success';

type CustomSnackbarProps = {
    classes: {
        error: string,
        warning: string,
        success: string,
        message: string,
        icon: string,
        iconVariant: string,
        close: string
    },
    variant: SnackbarVariant,
    className?: string,
    open: boolean,
    message: string,
    onClose: (event: React.SyntheticEvent<{}>, reason?: string) => void
};

function CustomSnackbar(props: CustomSnackbarProps) {
    const { classes, className, message, variant, open, onClose } = props;
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
            />
        </Snackbar>
    );
}

export default withStyles(styles)(CustomSnackbar);
