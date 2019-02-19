import React from 'react';
import classNames from 'classnames';
import { Theme, withStyles, withTheme, StyleRules } from '@material-ui/core/styles';
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
import { PatternEntry, PatternEntryColor } from './pattern';
import { GCalendarMeta } from './gapi';

const styles = (theme: Theme): StyleRules => ({
    deleteButton: {
        width: 0,
        position: 'absolute',
        paddingRight: '24px',
        right: 0,
        lineHeight: '48px',
    },
    deleteButtonHide: {
        display: 'none'
    },
    deleteButtonShow: {
        backgroundColor: theme.palette.background.default,
        zIndex: 1
    },
    deleteIcon: {
        position: 'absolute',
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

type NameFieldProps = {
    value: PatternEntry,
    classes: { colorSample: string },
    colorOnClick: (e: React.MouseEvent<HTMLDivElement>) => void,
    onChange: (f: string, v: string) => void
};

function NameField(props: NameFieldProps) {
    let color = props.value.color.background;
    return (
        <div style={{minWidth: 250}}>
            <div
                className={props.classes.colorSample}
                style={{backgroundColor: (color ? color : defaultChartColor)}}
                onClick={props.colorOnClick}>
            </div>
            <TextField
                value={props.value.name}
                onChange={event => props.onChange('name', event.target.value)} />
        </div>);
}

const patternHead: {label: string, elem: any}[] = [
    {label: "Name", elem: withStyles(nameFieldstyles)(NameField)},
    {label: "Calendar", elem: withTheme()(CalendarField)},
    {label: "Event", elem: withTheme()(EventField)}];

type PatternTableProps = {
    classes: {
        deleteButton: string,
        deleteButtonHide: string,
        deleteButtonShow: string,
        deleteIcon: string,
        patternTableWrapper: string,
        patternTable: string,
    },
    calendars: { [id: string]: GCalendarMeta },
    patterns: PatternEntry[],
    onRemovePattern: (idx: number) => void,
    onUpdatePattern: (field: string, idx: number, value: any) => void
};

class PatternTable extends React.Component<PatternTableProps> {

    activeColorPattern: number;
    chosenColor: string;
    state = {
        page: 0,
        rowsPerPage: 5,
        activePattern: null as number,
        anchorEl: null as HTMLElement,
        colorPickerOpen: false,
        colorPickerDefault: defaultChartColor
    };

    handleChangePage = (event: React.MouseEvent<{}>, page: number) => {
        this.setState({ page });
    }

    handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({ rowsPerPage: event.target.value });
    }

    handleColorPickerClose = () => {
        this.setState({ colorPickerOpen: false });
        this.activeColorPattern !== null && this.chosenColor &&
            this.props.onUpdatePattern('color', this.activeColorPattern,
                { background: this.chosenColor });
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
                    <div className={classNames(this.state.activePattern !== p.idx ? classes.deleteButtonHide : classes.deleteButtonShow, classes.deleteIcon)}>
                    <DeleteOutlinedIcon
                        style={{verticalAlign: 'middle'}}
                        onClick={() => this.props.onRemovePattern(p.idx)} />
                    </div>
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
                                    onChange={(field: string, value: any) => this.props.onUpdatePattern(field, p.idx, value)}
                                    colorOnClick={(event: React.MouseEvent<{}>) => {
                                        this.activeColorPattern = p.idx;
                                        console.log(p.color.background);
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
            <div style={{width: '100%', position: 'relative'}}>
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
                        onSelect={(event: React.ChangeEvent<HTMLInputElement>) => {
                            console.log("select");
                            this.chosenColor = event.target.value;
                        }}
                        onSubmit={this.handleColorPickerClose}
                        onReset={() => {}}
                        style={{width: 400, backgroundColor: '#c7c7c7'}}
                        submitLabel='Ok'
                        resetLabel='Reset'
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
                </div>
            </div>);
    }
}

export default withStyles(styles)(PatternTable);
