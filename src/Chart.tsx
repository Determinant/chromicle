import React from 'react';
import { Theme, withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import cyan from '@material-ui/core/colors/cyan';
import { Doughnut } from 'react-chartjs-2';
import 'chartjs-plugin-labels';
import Color from 'color';
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
    height?: number | string,
    data: PatternGraphData[],
    borderWidth: number,
    labelFontSize : number,
    paddingTop: number,
    paddingBottom: number,
    paddingLeft: number,
    paddingRight: number,
};

export class PatternPieChart extends React.Component<PatternPieChartProps> {
    public static defaultProps = {
        borderWidth: 1,
        labelFontSize: 12,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
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
        const colors = data.map(p => p.color ? p.color: defaultChartColor);
        return (
            <Doughnut data={(canvas: any) => {
                return {
                datasets: [{
                    data: data.map(p => p.value),
                    backgroundColor: colors,
                    borderWidth: data.map(() => this.props.borderWidth),
                    hoverBorderWidth: data.map(() => this.props.borderWidth),
                    hoverBorderColor: colors.map(c => Color(c).darken(0.2).string())
                }],
                labels: data.map(p => p.name)
                };
            }} options={{
                tooltips: {
                    callbacks: {
                        label: (item: any, data: any) => (
                            `${data.labels[item.index]}: ` +
                            `${data.datasets[item.datasetIndex].data[item.index].toFixed(2)} hr`
                        )
                    }
                },
                plugins: {
                    labels: {
                        render: (args: any) => `${args.value.toFixed(2)} hr`,
                        fontColor: (data: any) => {
                            var rgb = Color(data.dataset.backgroundColor[data.index]).rgb().object();
                            var threshold = 140;
                            var luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
                            return luminance > threshold ? 'black' : 'white';
                        },
                        arc: false,
                        overlap: false
                    }
                },
                legend: {
                    position: 'bottom'
                },
                layout: {
                    padding: {
                        left: this.props.paddingLeft,
                        right: this.props.paddingRight,
                        top: this.props.paddingTop,
                        bottom: this.props.paddingBottom
                    }
                },
                maintainAspectRatio: false,
                responsive: true}} />
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
      <Grid item md={12} lg={12} style={{height: 300}}>
      <StyledPatternPieChart data={props.patternGraphData} />
      </Grid>
      <Grid item md={12} lg={12} style={{height: 300}}>
      <StyledPatternPieChart data={props.calendarGraphData} />
      </Grid>
    </Grid>);
}

export const AnalyzePieChart = withStyles(styles)(DoublePieChart);
