import React from 'react';
import { Theme, withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import cyan from '@material-ui/core/colors/cyan';
import Typography from '@material-ui/core/Typography';
import { Doughnut as DChart, Chart } from 'react-chartjs-2';
import 'chartjs-plugin-labels';
import Color from 'color';
import { defaultChartColor, theme } from './theme';
import { PatternGraphData } from './graph';
import Doughnut from './Doughnut';

declare module 'react-chartjs-2' {
    export var Chart: {
        controllers: {
            doughnut: any,
            pie: any
        },
        elements: { Arc: any },
        pluginService: any
    };
}

const styles = (theme: Theme) => ({
    pieChart: {
        margin: '0 auto',
    }
});

interface PatternPieChartProps {
    classes: {
        patternTableWrapper: string,
        pieChart: string
    };
    data: PatternGraphData[];
    borderWidth: number;
    labelFontSize : number;
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
};

Chart.elements.Arc.prototype.draw = function() {
    let ctx = this._chart.ctx;
    const vm = this._view;
    const sA = vm.startAngle;
    const eA = vm.endAngle;
    const pixelMargin = (vm.borderAlign === 'inner') ? 0.33 : 0;
    let angleMargin;

    ctx.save();

    const delta = 3;
    const deltaOuter = Math.asin(delta / vm.outerRadius);
    const deltaInner = Math.asin(delta / vm.innerRadius);

    let sA1 = sA;
    let sA2 = sA;
    let eA1 = eA;
    let eA2 = eA;

    if ((eA - sA) > 2 * deltaInner + 0.05) {
        sA1 += deltaOuter;
        eA1 -= deltaOuter;
        sA2 += deltaInner;
        eA2 -= deltaInner;
    }

    ctx.beginPath();
    ctx.arc(vm.x, vm.y, Math.max(vm.outerRadius - pixelMargin, 0), sA1, eA1);
    ctx.arc(vm.x, vm.y, vm.innerRadius, eA2, sA2, true);
    ctx.closePath();

    ctx.fillStyle = vm.backgroundColor;
    ctx.fill();

    if (vm.borderWidth) {
        if (vm.borderAlign === 'inner') {
            // Draw an inner border by cliping the arc and drawing a double-width border
            // Enlarge the clipping arc by 0.33 pixels to eliminate glitches between borders
            ctx.beginPath();
            angleMargin = pixelMargin / vm.outerRadius;
            ctx.arc(vm.x, vm.y, vm.outerRadius, sA - angleMargin, eA + angleMargin);
            if (vm.innerRadius > pixelMargin) {
                angleMargin = pixelMargin / vm.innerRadius;
                ctx.arc(vm.x, vm.y, vm.innerRadius - pixelMargin, eA + angleMargin, sA - angleMargin, true);
            } else {
                ctx.arc(vm.x, vm.y, pixelMargin, eA + Math.PI / 2, sA - Math.PI / 2);
            }
            ctx.closePath();
            ctx.clip();

            ctx.beginPath();
            ctx.arc(vm.x, vm.y, vm.outerRadius, sA, eA);
            ctx.arc(vm.x, vm.y, vm.innerRadius, eA, sA, true);
            ctx.closePath();

            ctx.lineWidth = vm.borderWidth * 2;
            ctx.lineJoin = 'round';
        } else {
            ctx.lineWidth = vm.borderWidth;
            ctx.lineJoin = 'bevel';
        }

        ctx.strokeStyle = vm.borderColor;
        ctx.stroke();
    }

    ctx.restore();
};

// Code adapted from https://stackoverflow.com/a/43026361/544806
Chart.pluginService.register({
    beforeDraw: function (chart: any) {
        if (chart.config.options.elements.center) {
            //Get ctx from string
            let ctx = chart.chart.ctx;
            //Get options from the center object in options
            const centerConfig = chart.config.options.elements.center;
            const fontStyle = centerConfig.fontStyle || 'Noto Sans';
            const txt = centerConfig.text;
            const color = centerConfig.color || '#000';
            const sidePadding = centerConfig.sidePadding || 20;
            const sidePaddingCalculated = (sidePadding/100) * (chart.innerRadius * 2)
            //Start with a base font of 30px
            ctx.font = "12px " + fontStyle;

            //Get the width of the string and also the width of the element minus 10 to give it 5px side padding
            const stringWidth = ctx.measureText(txt).width;
            const elementWidth = (chart.innerRadius * 2) - sidePaddingCalculated;

            // Find out how much the font can grow in width.
            const widthRatio = elementWidth / stringWidth;
            const newFontSize = Math.floor(30 * widthRatio);
            const elementHeight = (chart.innerRadius * 2);

            // Pick a new font size so it will not be larger than the height of label.
            const fontSizeToUse = Math.min(newFontSize, elementHeight, centerConfig.maxFontSize);

            // Set font settings to draw it correctly.
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const centerX = ((chart.chartArea.left + chart.chartArea.right) / 2);
            const centerY = ((chart.chartArea.top + chart.chartArea.bottom) / 2);
            ctx.font = fontSizeToUse+"px " + fontStyle;
            ctx.fillStyle = color;

            // Draw text in center
            ctx.fillText(txt, centerX, centerY);
        }
    }
});

export class PatternPieChart extends React.Component<PatternPieChartProps> {
    render() {
        let { data, labelFontSize } = this.props;
        const colors = data.map(p => p.color ? p.color: defaultChartColor);
        const totalValue = data.map(p => p.value).reduce((ans, v) => ans + v);
        return (
            <DChart data={() => {
                return {
                datasets: [{
                    data: data.map(p => p.value),
                    backgroundColor: colors,
                    borderWidth: data.map(() => this.props.borderWidth),
                    borderColor: colors.map(c => Color(c).darken(0.1).string()),
                    hoverBorderWidth: data.map(() => this.props.borderWidth),
                    hoverBorderColor: colors.map(c => Color(c).darken(0.3).string())
                }],
                labels: data.map(p => p.name)
                };
            }} options={{
                elements: {
                    center: {
                        text: `${totalValue.toFixed(2)} hr`,
                        color: theme.palette.text.secondary,
                        maxFontSize: 20,
                        sidePadding: 50
                    }
                },
                tooltips: {
                    callbacks: {
                        label: (item: { index: number, datasetIndex: number },
                                data: { labels: string[], datasets: { data: number[] }[] }) => {
                            const v = data.datasets[item.datasetIndex].data[item.index];
                            return (
                            `${data.labels[item.index]}: ` +
                            `${v.toFixed(2)} hr (${(v / totalValue * 100).toFixed(2)} %)`
                            );
                        }
                    }
                },
                plugins: {
                    labels: {
                        render: (args: { value: number }) => `${args.value.toFixed(2)} hr`,
                        fontColor: (data: { index: number, dataset: { backgroundColor: string[] } }) => {
                            var rgb = Color(data.dataset.backgroundColor[data.index]).rgb().object();
                            var threshold = 150;
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

interface DoughnutChartProps extends PatternPieChartProps {
    height: number
}

class _DoughnutChart extends React.Component<DoughnutChartProps> {
    public static defaultProps = {
        height: 300,
        borderWidth: 1,
        labelFontSize: 12,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
    };
    render() {
        const h = this.props.height;
        const ih = h * (1 - 0.05 - 0.20);
        return ((this.props.data.some(dd => dd.value > 1e-3) &&
            <div style={{height: h}}>
                <PatternPieChart {...this.props} />
            </div>) ||
            <div style={{
                marginTop: 0.05 * h,
                marginBottom: 0.20 * h,
                textAlign: 'center'
            }}>
                <div style={{
                    position: 'relative',
                    height: ih,
                    display: 'inline-block'
                }}>
                    <Doughnut style={{
                        height: '100%'
                    }} />
                    <div style={{
                        position: 'absolute',
                        bottom: -ih * 0.15,
                        left: ih * 0.5 - 73,
                    }}>
                        <Typography variant="subtitle1" align="center" color="textSecondary">
                            No matching events.
                        </Typography>
                    </div>
                </div>
            </div>);
    }
}

export const DoughnutChart = withStyles(styles)(_DoughnutChart);

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
    <Grid container spacing={2}>
      <Grid item md={12} sm={6} xs={12}>
      <DoughnutChart height={300} data={props.patternGraphData} />
      </Grid>
      <Grid item md={12} sm={6} xs={12}>
      <DoughnutChart height={300} data={props.calendarGraphData} />
      </Grid>
    </Grid>);
}

export const AnalyzePieChart = withStyles(styles)(DoublePieChart);
