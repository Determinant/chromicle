import React from 'react';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';
import Slide from '@material-ui/core/Slide';

// modified from https://material-ui.com/demos/dialogs/

function Transition(props: any) {
    return <Slide direction="up" {...props} />;
}

type AlertDialogProps = {
    open: boolean,
    handleClose: (r: boolean) => any,
    title: string,
    message: string
};

function AlertDialog(props: AlertDialogProps) {
    return (
        <Dialog open={props.open}
                TransitionComponent={Transition}
                keepMounted
                onClose={() => props.handleClose(false)}
                aria-labelledby="alert-dialog-slide-title"
                aria-describedby="alert-dialog-slide-description">
            <DialogTitle id="alert-dialog-slide-title">
                {props.title}
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-slide-description">
                    {props.message}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.handleClose(false)} color="primary">
                    No
                </Button>
                <Button onClick={() => props.handleClose(true)} color="primary">
                    Yes
                </Button>
            </DialogActions>
        </Dialog>);
}

export default AlertDialog;
