import React from 'react';
import PropTypes from 'prop-types';
import { withStyles, withTheme } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TablePagination from '@material-ui/core/TablePagination';
import DeleteOutlinedIcon from '@material-ui/icons/DeleteOutlined';
import { CalendarField, EventField } from './RegexField';
import theme from './theme';

const styles = theme => ({
    deleteButtonShow: {
        position: 'absolute',
        right: 0,
        height: 48
    },
    deleteButtonHide: {
        display: 'none'
    },
    deleteIcon: {
        height: '100%',
        cursor: 'pointer'
    },
    patternTableWrapper: {
        overflowX: 'auto',
        overflowY: 'hidden'
    },
    patternTable: {
        minWidth: 600
    }
});

const patternHead = [
    {label: "Name", field: "name", elem: TextField},
    {label: "Calendar", field: "cal", elem: withTheme(theme)(CalendarField)},
    {label: "Event", field: 'event', elem: withTheme(theme)(EventField)}];

class PatternTable extends React.Component {
    state = {
        page: 0,
        rowsPerPage: 5,
    };

    handleChangePage = (event, page) => {
        this.setState({ page });
    }

    handleChangeRowsPerPage = event => {
        this.setState({ rowsPerPage: event.target.value });
    }

    render() {
        const { classes, cached, patterns } = this.props;
        const { rowsPerPage, page } = this.state;
        const nDummy = rowsPerPage - Math.min(rowsPerPage, patterns.length - page * rowsPerPage);
        let rows = patterns.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(p => (
            <TableRow
                onMouseOver={() => this.setState({ activePattern: p.idx })}
                onMouseOut={() => this.setState({ activePattern: null })}>
                {
                    patternHead.map(s => {
                        const CustomText = s.elem;
                        return (
                            <TableCell>
                                <CustomText
                                    value={p[s.field]}
                                    cached={cached}
                                    onChange={event => this.props.onUpdatePattern(s.field, p.idx, event.target.value)}/>
                            </TableCell>)})
                }
                <span className={this.state.activePattern === p.idx ? classes.deleteButtonShow : classes.deleteButtonHide}>
                    <DeleteOutlinedIcon
                        className={classes.deleteIcon}
                        onClick={() => this.props.onRemovePattern(p.idx)} />
                </span>
            </TableRow>));

        return (
            <div>
                <div className={classes.patternTableWrapper}>
                    <Table className={classes.patternTable}>
                        <TableHead>
                            <TableRow>{patternHead.map((s, i) => (<TableCell key={i}>{s.label}</TableCell>))}</TableRow>
                        </TableHead>
                        <TableBody>
                            {rows}
                            {
                                nDummy > 0 && (
                                    <TableRow style={{ height: 48 * nDummy }}>
                                        <TableCell colSpan={patternHead.length} />
                                    </TableRow>)
                            }
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
                    onChangeRowsPerPage={this.handleChangeRowsPerPage} />
            </div>);
    }
}


PatternTable.propTypes = {
    classes: PropTypes.object.isRequired,
    patterns: PropTypes.array.isRequired,
    cached: PropTypes.object.isRequired,
    onRemovePattern: PropTypes.func.isRequired,
    onUpdatePattern: PropTypes.func.isRequired,
};

export default withStyles(styles)(PatternTable);
