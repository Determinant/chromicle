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
    data: PatternGraphData[],
    radialLabelsLinkStrokeWidth?: number,
    radialLabelsLinkDiagonalLength?: number,
    borderWidth: number,
    labelFontSize : number,
    marginTop: number,
    marginBottom: number,
    marginLeft: number,
    marginRight: number,
    padAngle: number
};

export class PatternPieChart extends React.Component<PatternPieChartProps> {
    public static defaultProps = {
        radialLabelsLinkStrokeWidth: 1,
        borderWidth: 1,
        radialLabelsLinkDiagonalLength: 16,
        labelFontSize: 12,
        marginTop: 40,
        marginBottom: 40,
        marginLeft: 80,
        marginRight: 80,
        padAngle: 0.7
    };
    render() {
        let { height, data, labelFontSize } = this.props;
        const theme = {
            labels: {
                text: {
                    fontSize: labelFontSize
                }
            }
        };
    return (
        <div style={{height: (height ? height : 300)}}>
            <ResponsivePie
            data={data.map(p => ({
                id: p.name,
                label: p.name,
                value: p.value,
                color: p.color ? p.color: defaultChartColor
            }))}
            margin={{
                top: this.props.marginTop,
                right: this.props.marginRight,
                bottom: this.props.marginBottom,
                left: this.props.marginLeft
            }}
            innerRadius={0.5}
            padAngle={this.props.padAngle}
            cornerRadius={3}
            colorBy={d => d.color as string}
            borderWidth={this.props.borderWidth}
            borderColor="inherit:darker(0.2)"
            radialLabelsSkipAngle={10}
            radialLabelsTextXOffset={6}
            radialLabelsTextColor="#333333"
            radialLabelsLinkOffset={0}
            radialLabelsLinkDiagonalLength={this.props.radialLabelsLinkDiagonalLength}
            radialLabelsLinkHorizontalLength={24}
            radialLabelsLinkStrokeWidth={this.props.radialLabelsLinkStrokeWidth}
            radialLabelsLinkColor="inherit"
            sliceLabel={(d) => `${d.value.toFixed(2)} hr`}
            slicesLabelsSkipAngle={10}
            slicesLabelsTextColor="#ffffff"
            animate={true}
            motionStiffness={90}
            motionDamping={15}
            theme={theme}
            tooltipFormat={v => `${v.toFixed(2)} hr`} />
        </div>
    );
    }
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
      <Grid item xs={12} lg={6}>
      <StyledPatternPieChart data={props.patternGraphData} height={300} />
      </Grid>
      <Grid item xs={12} lg={6}>
      <StyledPatternPieChart data={props.calendarGraphData} height={300} />
      </Grid>
    </Grid>);
}

export const AnalyzePieChart = withStyles(styles)(DoublePieChart);
