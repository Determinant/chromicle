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
import Popover from '@material-ui/core/Popover';
import MaterialColorPicker from 'react-material-color-picker';
import { CalendarField, EventField } from './RegexField';
import { theme, defaultChartColor } from './theme';

const styles = theme => ({
    deleteButton: {
        width: 0,
        position: 'absolute',
        marginRight: '2em',
        right: 0,
        height: 48,
    },
    deleteButtonHide: {
        display: 'none'
    },
    deleteButtonShow: {},
    deleteIcon: {
        position: 'absolute',
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

let nameFieldstyles = {
    colorSample: {
        display: 'inline-block',
        height: 30,
        width: 30,
        marginRight: 10,
        cursor: 'pointer'
    }
};

function NameField(props) {
    let color = props.value.color;
    return (
        <span>
            <div
                className={props.classes.colorSample}
                style={{backgroundColor: color ? color.background : defaultChartColor}}
                onClick={props.colorOnClick}>
            </div>
            <TextField
                value={props.value.name}
                onChange={event => props.onChange('name', event.target.value)} />
        </span>);
}

const patternHead = [
    {label: "Name", elem: withStyles(nameFieldstyles)(NameField)},
    {label: "Calendar", elem: withTheme(theme)(CalendarField)},
    {label: "Event", elem: withTheme(theme)(EventField)}];

class PatternTable extends React.Component {
    state = {
        page: 0,
        rowsPerPage: 5,
        activePattern: null,
        anchorEl: null,
        colorPickerOpen: false,
        colorPickerDefault: defaultChartColor
    };

    handleChangePage = (event, page) => {
        this.setState({ page });
    }

    handleChangeRowsPerPage = event => {
        this.setState({ rowsPerPage: event.target.value });
    }

    handleColorPickerClose = () => {
        this.setState({ colorPickerOpen: false });
        this.activeColorPattern !== null &&
            this.chosenColor &&
            this.props.onUpdatePattern('color', this.activeColorPattern,
                {background: this.chosenColor.target.value})
    }

    render() {
        const { classes, calendars, patterns } = this.props;
        const { rowsPerPage, page } = this.state;
        const nDummy = rowsPerPage - Math.min(rowsPerPage, patterns.length - page * rowsPerPage);
        let rows = patterns.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map((p, i) => {
            let setActive = () => this.setState({ activePattern: p.idx });
            let unsetActive = () => this.setState({ activePattern: null });
            return [<TableRow key={i * 2}
                onMouseOver={setActive} onMouseOut={unsetActive}
                className={classes.deleteButton}>
                <td>
                    <span className={this.state.activePattern !== p.idx ? classes.deleteButtonHide : classes.deleteButtonShow}>
                    <DeleteOutlinedIcon
                        className={classes.deleteIcon}
                        onClick={() => this.props.onRemovePattern(p.idx)} />
                    </span>
                </td>
            </TableRow>,
            <TableRow key={i * 2 + 1} onMouseOver={setActive} onMouseOut={unsetActive}>
                {
                    patternHead.map((s, i) => {
                        const CustomText = s.elem;
                        return (
                            <TableCell key={i}>
                                <CustomText
                                    value={p}
                                    calendars={calendars}
                                    onChange={(field, value) => this.props.onUpdatePattern(field, p.idx, value)}
                                    colorOnClick={event => {
                                        this.activeColorPattern = p.idx;
                                        this.setState({
                                            anchorEl: event.currentTarget,
                                            colorPickerDefault: p.color.background,
                                            colorPickerOpen: true
                                        });
                                    }}/>
                            </TableCell>)})
                }
            </TableRow>]
        });
        rows.flat();

        return (
            <div>
                <Popover
                    id="colorPicker"
                    open={this.state.colorPickerOpen}
                    anchorEl={this.state.anchorEl}
                    onClose={this.handleColorPickerClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'center',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'center',
                    }}>
                    <MaterialColorPicker
                        initColor={this.state.colorPickerDefault}
                        onSelect={color => {
                            console.log("select");
                            this.chosenColor = color;
                        }}
                        onSubmit={this.handleColorPickerClose}
                        onReset={() => {}}
                        style={{width: 400, backgroundColor: '#c7c7c7'}}
                        submitLabel='Apply'
                        resetLabel='Undo'
                    />
                </Popover>
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
    calendars: PropTypes.object.isRequired,
    onRemovePattern: PropTypes.func.isRequired,
    onUpdatePattern: PropTypes.func.isRequired,
};

export default withStyles(styles)(PatternTable);
