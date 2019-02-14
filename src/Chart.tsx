import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import cyan from '@material-ui/core/colors/cyan';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { defaultChartColor } from './theme';

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

function PatternPieChart(props) {
    return (
          <Grid item xs={12} lg={6}>
            <div className={props.classes.patternTableWrapper}>
            <PieChart width={400} height={250} className={props.classes.pieChart}>
              <Pie data={props.data}
                   dataKey='value'
                   cx={200}
                   cy={125}
                   outerRadius={60}
                   fill={defaultChartColor}
                   isAnimationActive={false}
                   label={customizedLabel}>
              {props.data.map((d, i) => <Cell key={i} fill={d.color ? d.color: defaultChartColor}/>)}
              </Pie>
              <Tooltip formatter={(value) => `${value.toFixed(2)} hr`}/>
            </PieChart>
            </div>
          </Grid>
    );
}

export const StyledPatternPieChart = withStyles(styles)(PatternPieChart);

function DoublePieChart(props) {
    return (
    <Grid container spacing={0}>
      <StyledPatternPieChart data={props.patternGraphData} />
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
               isAnimationActive={false}
               label={customizedLabel}>
            {props.calendarGraphData.map((d, i) => <Cell key={i} fill={d.color ? d.color : cyan[300]}/>)}
          </Pie>
          <Tooltip formatter={(value) => `${value.toFixed(2)} hr`}/>
        </PieChart>
        </div>
      </Grid>
    </Grid>);
}

DoublePieChart.propTypes = {
    patternGraphData: PropTypes.array.isRequired,
    calendarGraphData: PropTypes.array.isRequired,
};

export const AnalyzePieChart = withStyles(styles)(DoublePieChart);