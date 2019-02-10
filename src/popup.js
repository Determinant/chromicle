import React from 'react';
import ReactDOM from 'react-dom';
import * as serviceWorker from './serviceWorker';
import { MuiThemeProvider } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import theme from './theme';
import { PatternEntry } from './pattern';
import { Duration } from './duration';
import { msgType, MsgClient } from './msg';
import { getChartData, StyledPatternPieChart } from './Chart';
import moment from 'moment';

function openOptions() {
    chrome.tabs.create({ url: "index.html" });
}

class Popup extends React.Component {
    state = {
        patternGraphData: [],
    };
    constructor(props) {
        super(props);
        this.msgClient = new MsgClient('main');

        let pm1 = this.msgClient.sendMsg({
            type: msgType.getPatterns,
            data: { id: 'main' }
        }).then(msg => {
            this.patterns = msg.data.map(p => PatternEntry.inflate(p));
        });

        let pm2 = this.msgClient.sendMsg({
            type: msgType.getCalendars,
            data: { enabledOnly: false }
        }).then(msg => {
            this.calendars = msg.data;
        });

        let pm3 = this.msgClient.sendMsg({
            type: msgType.getConfig,
            data: ['trackedPeriods']
        }).then(msg => {
            this.trackedPeriods = msg.data.trackedPeriods.map(p => {
                return {
                    start: Duration.inflate(p.start),
                    end: Duration.inflate(p.end),
                    name: p.name
                };
            });
        });

        // initial update
        Promise.all([pm1, pm2, pm3]).then(() => {
            for (let i = 0; i < this.trackedPeriods.length; i++)
                this.renderChartData(i);
        });
    }

    getCalEvents = (id, start, end) => {
        return this.msgClient.sendMsg({ type: msgType.getCalEvents, data: { id,
            start: start.getTime(),
            end: end.getTime() } })
            .then(({ data }) => data.map(e => {
                return {
                    id: e.id,
                    start: new Date(e.start),
                    end: new Date(e.end) }
            }));
    }

    renderChartData(idx) {
        let p = this.trackedPeriods[idx];
        console.log(this.trackedPeriods);
        let startD = p.start.toMoment();
        let endD = p.end.toMoment();
        if (!(startD && endD)) return;
        let start = moment().endOf('day');
        if (endD.valueOf() == 0) {
            switch (p.start.unit) {
                case 'days': start = moment().endOf('day'); break;
                case 'weeks': start = moment().endOf('week'); break;
                case 'months': start = moment().endOf('month'); break;
                default:
            }
        }
        let end = start.clone();
        start.subtract(startD);
        end.subtract(endD);
        console.log(start, end);
        return getChartData(start.toDate(),
                            end.toDate(),
                            this.patterns, this.calendars, this.getCalEvents).then(results => {
            let patternGraphData = this.state.patternGraphData;
            patternGraphData[idx] = {
                start: moment(results.start),
                end: moment(results.end),
                data: results.patternGraphData
            };
            this.setState({ patternGraphData });
        });
    }

    render() {
        console.log(this.state.patternGraphData);
        return (
            <MuiThemeProvider theme={theme}>
            <Button variant="contained" color="primary" onClick={openOptions}>Dashboard</Button>
            {
                this.state.patternGraphData.map((d, idx) => (
                    <div key={idx}>
                    <Typography variant="subtitle1" align="center" color="textPrimary">
                    {this.trackedPeriods[idx].name}
                    </Typography>
                    <Typography variant="caption" align="center">
                    {`${d.start.format('ddd, MMM Do, YYYY')} -
                    ${d.end.format('ddd, MMM Do, YYYY')}`}
                    </Typography>
                    {(d.data.some(dd => dd.value > 1e-3) &&
                    <StyledPatternPieChart data={d.data} />) ||
                    <Typography variant="subtitle1" align="center" color="textSecondary">
                        No data available
                    </Typography>}
                    </div>
                ))
            }
            </MuiThemeProvider>
        );
    }
}

ReactDOM.render(<Popup />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
