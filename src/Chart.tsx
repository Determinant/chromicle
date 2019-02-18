import React from 'react';
import { Theme, withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import cyan from '@material-ui/core/colors/cyan';
import { ResponsivePie } from '@nivo/pie';
import { defaultChartColor } from './theme';
import { PatternGraphData } from './graph';

const styles = (theme: Theme) => ({
    pieChart: {
        margin: '0 auto',
    }
});

type PatternPieChartProps = {
    classes: {
        patternTableWrapper: string,
        pieChart: string
    },
    height?: number,
    data: PatternGraphData[]
};

function PatternPieChart(props: PatternPieChartProps) {
    return (
        <Grid item xs={12} lg={6}>
            <div style={{height: (props.height ? props.height : 300)}}>
                <ResponsivePie
                data={props.data.map(p => ({
                    id: p.name,
                    label: p.name,
                    value: p.value,
                    color: p.color ? p.color: defaultChartColor
                }))}
                margin={{
                    top: 40,
                    right: 80,
                    bottom: 40,
                    left: 80
                }}
                innerRadius={0.5}
                padAngle={0.7}
                cornerRadius={3}
                colorBy={d => d.color as string}
                borderWidth={1}
                borderColor="inherit:darker(0.2)"
                radialLabelsSkipAngle={10}
                radialLabelsTextXOffset={6}
                radialLabelsTextColor="#333333"
                radialLabelsLinkOffset={0}
                radialLabelsLinkDiagonalLength={16}
                radialLabelsLinkHorizontalLength={24}
                radialLabelsLinkStrokeWidth={1}
                radialLabelsLinkColor="inherit"
                sliceLabel={(d) => `${d.value.toFixed(2)} hr`}
                slicesLabelsSkipAngle={10}
                slicesLabelsTextColor="#ffffff"
                animate={true}
                motionStiffness={90}
                motionDamping={15}
                tooltipFormat={v => `${v.toFixed(2)} hr`} />
            </div>
        </Grid>
    );
}

export const StyledPatternPieChart = withStyles(styles)(PatternPieChart);

type DoublePieChartProps = {
    classes: {
        patternTableWrapper: string,
        pieChart: string
    },
    patternGraphData: PatternGraphData[],
    calendarGraphData: PatternGraphData[]
};

function DoublePieChart(props: DoublePieChartProps) {
    return (
    <Grid container spacing={0}>
      <StyledPatternPieChart data={props.patternGraphData} height={300} />
      <StyledPatternPieChart data={props.calendarGraphData} height={300} />
    </Grid>);
}

export const AnalyzePieChart = withStyles(styles)(DoublePieChart);
