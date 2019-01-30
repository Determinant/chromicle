import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import deepOrange from '@material-ui/core/colors/deepOrange';
import cyan from '@material-ui/core/colors/cyan';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

const styles = theme => ({
    pieChart: {
        margin: '0 auto',
    }
});

function customizedLabel(props) {
    const {cx, cy, x, y, fill, name} = props;
    let anchor = "middle";
    const EPS = 2;
    let dx = 0;
    let dy = 0;
    if (x < cx - EPS) {
        dx = -5;
        anchor = "end"
    } else if (x > cx + EPS) {
        dx = 5;
        anchor = "start";
    }

    if (y < cy - EPS) {
        dy = -5;
    } else if (y > cy + EPS) {
        dy = 10;
    }

    return (<text x={x} y={y} dx={dx} dy={dy} fill={fill} textAnchor={anchor}>{`${name}`}</text>);
}

function ChromiclePieChart(props) {
    return (
    <Grid container spacing={0}>
      <Grid item xs={12} lg={6}>
        <div className={props.classes.patternTableWrapper}>
        <PieChart width={400} height={250} className={props.classes.pieChart}>
          <Pie data={props.patternGraphData}
               dataKey='value'
               cx={200}
               cy={125}
               outerRadius={60}
               fill={deepOrange[300]}
               label={customizedLabel}/>
          <Tooltip formatter={(value) => `${value.toFixed(2)} hr`}/>
        </PieChart>
        </div>
      </Grid>
      <Grid item xs={12} lg={6}>
        <div className={props.classes.patternTableWrapper}>
        <PieChart width={400} height={250} className={props.classes.pieChart}>
          <Pie data={props.calendarGraphData}
               dataKey='value'
               cx={200}
               cy={125}
               innerRadius={40}
               outerRadius={70}
               fill={cyan[300]}
               label={customizedLabel}>
            {props.calendarGraphData.map((d, i) => <Cell key={i} fill={d.color}/>)}
          </Pie>
          <Tooltip formatter={(value) => `${value.toFixed(2)} hr`}/>
        </PieChart>
        </div>
      </Grid>
    </Grid>);
}

ChromiclePieChart.propTypes = {
    patternGraphData: PropTypes.array.isRequired,
    calendarGraphData: PropTypes.array.isRequired,
};

export default withStyles(styles)(ChromiclePieChart);
