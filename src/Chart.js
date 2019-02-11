import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import deepOrange from '@material-ui/core/colors/deepOrange';
import cyan from '@material-ui/core/colors/cyan';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

export function getChartData(start, end, patterns, calendars, calEventsGetter) {
    if (start >= end) return Promise.resolve({ patternGraphData: [], calendarGraphData: [] });
    let event_pms = [];
    for (let id in calendars)
    {
        if (!calendars[id].enabled) continue;
        let filtered = patterns.filter(p => p.cal.regex.test(calendars[id].name));
        if (filtered.length > 0)
            event_pms.push(calEventsGetter(id, start, end)
                .then(r => { return { id, events: r, filtered }; }));
    }
    return Promise.all(event_pms).then(all_events => {
        let events = {};
        let patternsByCal = {};
        let results = {}; // pattern idx => time
        let cal_results = {}; // cal id => time
        all_events.forEach(e => {
            events[e.id] = e.events;
            patternsByCal[e.id] = e.filtered;
        });
        for (let i = 0; i < patterns.length; i++)
            results[i] = 0;
        for (let id in calendars) {
            if (!events[id]) continue;
            events[id].forEach(event => {
                patternsByCal[id].forEach(p => {
                    if (!p.event.regex.test(event.summary)) return;
                    if (!cal_results.hasOwnProperty(id)) {
                        cal_results[id] = 0;
                    }
                    let duration = (event.end - event.start) / 60000;
                    results[p.idx] += duration;
                    cal_results[id] += duration;
                });
            });
        }
        let patternGraphData = [];
        let calendarGraphData = [];
        const filterMarginal = data => {
            let sum = 0;
            let majorParts = [];
            let minorSum = 0;
            data.forEach(d => sum += d.value);
            data.forEach(d => {
                let ratio = d.value / sum;
                if (ratio < 1e-2) minorSum += d.value;
                else majorParts.push(d);
            });
            majorParts.push({
                name: 'Other',
                value: minorSum,
                color: '#fff',
            });
            return majorParts;
        };
        for (let i = 0; i < patterns.length; i++) {
            patternGraphData.push({ name: patterns[i].name, value: results[i] / 60.0 });
        }
        for (let id in cal_results) {
            calendarGraphData.push({
                name: calendars[id].name,
                value: (cal_results[id] / 60.0),
                color: calendars[id].color.background});
        }
        return {start, end,
                patternGraphData: filterMarginal(patternGraphData),
                calendarGraphData: filterMarginal(calendarGraphData) };
    });
}

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
                   fill={deepOrange[300]}
                   isAnimationActive={false}
                   label={customizedLabel}/>
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
            {props.calendarGraphData.map((d, i) => <Cell key={i} fill={d.color}/>)}
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
