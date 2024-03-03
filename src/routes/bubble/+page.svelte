<script lang='ts'>
import * as d3 from 'd3';
import { onMount } from 'svelte';
import Navbar from '../../components/Navbar.svelte';
import Sidebar from '../../components/Sidebar.svelte';
import Footer from '../../components/Footer.svelte';
    import { decompressBson, type Conflict, type GraphData, UNITS_PER_CITY } from '$lib';

let _rawData: GraphData;
let conflictId: number;
let conflictName: string;

let graphDiv: HTMLDivElement;
onMount(async () => {
    let queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        fetchConflictGraphData(conflictId);
    }
    
});

function fetchConflictGraphData(conflictId: number) {
    let start = Date.now();
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip`;
    decompressBson(url).then((data) => {
        console.log(`Loaded ${url} in ${Date.now() - start}ms`);start = Date.now();
        conflictName = data.name;
        _rawData = data;
        setupGraphData(_rawData);

    });
}

interface BubbleMetric {
    name: string,
    cumulative: boolean,
    normalize: boolean,
}

interface Trace {
    x: number[],
    y: number[],
    id: number[],
    text: string[],
    marker: {size: number[]}
}
interface Range {
    x: number[],
    y: number[],
    z: number[]
}

interface Timeframe {
    start: number,
    end: number
}

function getFullName(metric: BubbleMetric): string {
    let fullName = metric.name;
    if (metric.cumulative) {
        fullName += ' (sum)';
    }
    if (metric.normalize) {
        fullName += ' (avg)';
    }
    return fullName;
}

function generateTraces(data: GraphData, x_axis: BubbleMetric, y_axis: BubbleMetric, size: BubbleMetric, min_city: number, max_city: number): {
        traces: {[key: number]: {[key: number]: Trace}},
        times: Timeframe, 
        ranges: Range} {
            
    let ranges: Range = {x: [0, Number.MIN_SAFE_INTEGER], y: [0, Number.MIN_SAFE_INTEGER], z: [0, Number.MIN_SAFE_INTEGER]};
    let rangesKeys: (keyof typeof ranges)[] = Object.keys(ranges) as (keyof typeof ranges)[];  

    let turn_start = data.turn_start;
    let turn_end = data.turn_end;
    let day_start = Math.floor(turn_start / 12);
    let day_end = Math.floor((turn_end + 11) / 12);

    let metrics = [x_axis, y_axis, size];
    let metric_ids: number[] = [];
    let metric_indexes: number[] = [];
    let metric_is_turn: boolean[] = [];
    let metric_normalize: number[] = [];
    for (let i = 0; i < metrics.length; i++) {
        let metric = metrics[i];
        let metric_id = data.metric_names.indexOf(metric.name);
        if (metric_id == -1) {
            console.error(`Metric ${metric.name} not found`);
            return null;
        }
        metric_ids.push(metric_id);
        let is_turn = data.metrics_turn.includes(metric_id);
        metric_is_turn.push(is_turn);
        metric_indexes.push(is_turn ? data.metrics_turn.indexOf(metric_id) : data.metrics_day.indexOf(metric_id));
        if (metric_indexes[i] == -1) {
            console.error(`Metric ${metric.name} not found ${metric_id}`);
            return null;
        }
        if (metric.normalize) {
            let perCity = UNITS_PER_CITY[metric.name];
            metric_normalize.push(perCity ? perCity : 0);
        } else {
            metric_normalize.push(-1);
        }
    }


    let isAnyTurn = metric_is_turn.reduce((a, b) => a || b);
    let start = isAnyTurn ? turn_start : day_start;
    let end = isAnyTurn ? turn_end : day_end;

    let lookup: {[key: number]: {[key: number]: Trace}} = {};// year -> coalitions

    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        let minCityIndex = coalition.cities.indexOf(min_city); 
        let maxCityIndex = coalition.cities.indexOf(max_city); 
        if (minCityIndex == -1) minCityIndex = 0;
        if (maxCityIndex == -1) maxCityIndex = coalition.cities.length - 1;

        for (let j = 0; j < coalition.alliance_ids.length; j++) {
            let alliance_id = coalition.alliance_ids[j];
            let name = coalition.alliance_names[j];
            // console.log("Loading " + name + " " + alliance_id);

            let buffer: number[] = [0, 0, 0];
            let lastDay = -1;
            for (let turnOrDay = start; turnOrDay <= end; turnOrDay++) {
                let traceByCol = lookup[turnOrDay];
                if (!traceByCol) {
                    traceByCol = {};
                    lookup[turnOrDay] = traceByCol;
                }
                let trace = traceByCol[i];
                if (!trace) {
                    trace = {
                        x: [],
                        y: [],
                        id: [],
                        text: [],
                        marker: {size: []}
                    };
                    traceByCol[i] = trace;
                }
                trace.id.push(alliance_id);
                trace.text.push(name);

                let turn = isAnyTurn ? turnOrDay : Math.floor(turnOrDay * 12);
                let day = isAnyTurn ? Math.floor(turnOrDay / 12) : turnOrDay;
                for (let k = 0; k < metrics.length; k++) {
                    let isCumulative = metrics[k].cumulative;
                    if (isCumulative && lastDay == day) continue;

                    let metric_id = metric_ids[k];
                    let metric_index = metric_indexes[k];
                    let is_turn = metric_is_turn[k];

                    let value_by_day = (is_turn ? coalition.turn_data[metric_index][j] : coalition.day_data[metric_index][j]);
                    if (!value_by_day) {
                        continue;
                    }
                    let value_by_city = value_by_day[is_turn ? turn - turn_start : day - day_start];
                    if (value_by_city.length == 0) {
                        if (!isCumulative) buffer[k] = 0;
                        continue;
                    }
                    let total = 0.0;
                    for (let l = minCityIndex; l <= maxCityIndex; l++) {
                        total += value_by_city[l];
                    }
                    let normalize = metric_normalize[k];
                    if (normalize != -1) {
                        let nations = 0.0;
                        // coalition.day_data[day][0][j]
                        let nation_counts = coalition.day_data[0][day][j];
                        for (let l = minCityIndex; l <= maxCityIndex; l++) {
                            nations += nation_counts[l];
                        }
                        total /= nations;
                    }
                    if (isCumulative) {
                        buffer[k] += total;
                    } else {
                        buffer[k] = total;
                    }
                    if (isNaN(buffer[k])) {
                        console.error("NaN " + name + " " + alliance_id + " " + metrics[k].name + " " + total);
                        console.log(value_by_city);
                        return;
                    }
                }
                trace.x.push(buffer[0]);
                trace.y.push(buffer[1]);
                trace.marker.size.push(buffer[2]);

                for (let k = 0; k < 3; k++) {
                    let ri = rangesKeys[k];
                    if (buffer[k] < ranges[ri][0]) ranges[ri][0] = buffer[k];
                    if (buffer[k] > ranges[ri][1]) ranges[ri][1] = buffer[k];
                }

                lastDay = day;
            }
            // print buffer values
            // console.log("# " + name + " " + alliance_id);
            // console.log("- " + metrics[0].name + ": " + buffer[0]);
            // console.log("- " + metrics[1].name + ": " + buffer[1]);
            // console.log("- " + metrics[2].name + ": " + buffer[2]);
        }
    }
    let times: Timeframe = {start: start, end: end};
    return {traces:lookup, times, ranges};
}

function setupGraphData(data: GraphData) {
    let start = Date.now();
    let metric_x: BubbleMetric = {name: "loss:loss_value", cumulative: true, normalize: false};
    let metric_y: BubbleMetric = {name: "dealt:loss_value", cumulative: true, normalize: false};
    let metric_size: BubbleMetric = {name: "off:wars", cumulative: true, normalize: false};
    let min_cities = 1;
    // max of coalition[0/1] cities
    let col1Cities = data.coalitions[0].cities;
    let col2Cities = data.coalitions[1].cities;
    let max_cities = Math.max(col1Cities[col1Cities.length - 1], col2Cities[col2Cities.length - 1]);

    let tracesTime = generateTraces(data, metric_x, metric_y, metric_size, min_cities, max_cities);
    let coalition_names = data.coalitions.map((coalition) => coalition.name);


    let metrics: [BubbleMetric,BubbleMetric,BubbleMetric] = [metric_x, metric_y, metric_size];

    console.log(`Generated traces in ${Date.now() - start}ms`);

    createGraph(tracesTime.traces, tracesTime.times, tracesTime.ranges, coalition_names, metrics);
}

function createGraph(lookup: {[key: number]: {[key: number]: Trace}}, time: {start: number, end: number}, ranges: {x: number[], y: number[], z: number[]}, coalition_names: string[], metrics: [BubbleMetric,BubbleMetric,BubbleMetric]) {
        let start = Date.now();

        // Get the group names:
        var years: number[] = Object.keys(lookup).map(Number);
        // In this case, every year includes every continent, so we
        // can just infer the continents from the *first* year:
        var firstYear = lookup[time.start];
        var coalitions: number[] = Object.keys(firstYear).map(Number);

        for (let i = time.start; i <= time.end; i++) {
            let lookupByTime = lookup[i];
            if (!lookupByTime) {
                continue;
            }
            let maxZ = 0;
            for (let j = 0; j < coalition_names.length; j++) {
                let data = lookupByTime[j];
                if (!data) continue;
                maxZ = Math.max(maxZ, Math.max(...data.marker.size));
            }
            for (let j = 0; j < coalition_names.length; j++) {
                let data = lookupByTime[j];
                if (!data) continue;
                data.marker.size = data.marker.size.map((size) => {
                    return size / maxZ;
                });
            
            }
        }

        // Create a lookup table to sort and regroup the columns of data,
        // first by year, then by continent:
        function getData(time: number, coalition: number) {
            let lookupByTime = lookup[time];
            if (!lookupByTime) {
                lookupByTime = lookup[time] = {};
            }
            let trace = lookupByTime[coalition];
            if (!trace) {
                trace = lookupByTime[coalition] = {
                    x: [],
                    y: [],
                    id: [],
                    text: [],
                    marker: {size: []}
                };
            }
            return trace;
        }

        var colors = ['red', 'green', 'blue', 'yellow', 'purple'];

        // Create the main traces, one for each continent:
        var traces = [];
        for (let i = 0; i < coalitions.length; i++) {
            var data = firstYear[coalitions[i]];
            // var textSize = data.marker.size.map(function(size) {
            //     return Math.min(20,Math.max(10,Math.sqrt(size) / 2000)); // Adjust the scaling factor as needed
            // });
            // One small note. We're creating a single trace here, to which
            // the frames will pass data for the different years. It's
            // subtle, but to avoid data reference problems, we'll slice
            // the arrays to ensure we never write any new data into our
            // lookup table:
            traces.push({
                name: coalition_names[i],
                x: data.x.slice(),
                y: data.y.slice(),
                id: data.id.slice(),
                text: data.text.slice(),
                mode: 'markers+text',
                textposition: 'middle center',
                textfont: {
                    size: 10,
                    color: 'black'
                },
                marker: {
                    size: data.marker.size,
                    sizemode: 'area',
                    sizeref: 0.001,
                    sizemin: 1,
                    color: colors[i % colors.length]
                },
                
            });
        }

        // Create a frame for each year. Frames are effectively just
        // traces, except they don't need to contain the *full* trace
        // definition (for example, appearance). The frames just need
        // the parts the traces that change (here, the data).
        var frames = [];
        for (let i = 0; i < years.length; i++) {
            frames.push({
            name: years[i],
            data: coalitions.map(function (alliance) {
                return getData(years[i], alliance);
            })
            })
        }

        // Now create slider steps, one for each frame. The slider
        // executes a plotly.js API command (here, Plotly.animate).
        // In this example, we'll animate to one of the named frames
        // created in the above loop.
        var sliderSteps = [];
        for (let i = 0; i < years.length; i++) {
            sliderSteps.push({
                method: 'animate',
                label: years[i],
                args: [[years[i]], {
                    mode: 'immediate',
                    transition: {duration: 200},
                    frame: {duration: 200, redraw: true},
                }]
            });
        }

        var layout = {
            height: window.innerHeight * 0.8,
            xaxis: {
                title: getFullName(metrics[0]),
            },
            yaxis: {
                title: getFullName(metrics[1]),
            },
            hovermode: 'closest',
            legend: {
                x: 0.5,
                y: 1.1,
                itemsizing: 'constant',
                xanchor: 'center',
                yanchor: 'top'
            },
            // We'll use updatemenus (whose functionality includes menus as
            // well as buttons) to create a play button and a pause button.
            // The play button works by passing `null`, which indicates that
            // Plotly should animate all frames. The pause button works by
            // passing `[null]`, which indicates we'd like to interrupt any
            // currently running animations with a new list of frames. Here
            // The new list of frames is empty, so it halts the animation.
            updatemenus: [{
            x: 0,
            y: 0,
            yanchor: 'top',
            xanchor: 'left',
            showactive: false,
            direction: 'left',
            type: 'buttons',
            pad: {t: 87, r: 10},
            buttons: [{
                method: 'animate',
                args: [null, {
                mode: 'immediate',
                fromcurrent: true,
                transition: {duration: 200},
                frame: {duration: 200, redraw: true}
                }],
                label: 'Play'
            }, {
                method: 'animate',
                args: [[null], {
                mode: 'immediate',
                transition: {duration: 0},
                frame: {duration: 0, redraw: true}
                }],
                label: 'Pause'
            }]
            }],
            // Finally, add the slider and use `pad` to position it
            // nicely next to the buttons.
            sliders: [{
            pad: {l: 130, t: 55},
            currentvalue: {
                visible: true,
                prefix: 'Year:',
                xanchor: 'right',
                font: {size: 20, color: '#666'}
            },
            steps: sliderSteps
            }],
        };

        console.log(`Generated graph data in ${Date.now() - start}ms`);start = Date.now();

        Plotly.react(graphDiv, {
            data: traces,
            layout: layout,
            frames: frames
        });
        graphDiv.on('plotly_animated', function() {
            Plotly.relayout(graphDiv, { 'xaxis.autorange': true, 'yaxis.autorange': true });
        });
        console.log(`Setup reactive plot in ${Date.now() - start}ms`);start = Date.now();
};
</script>
<Navbar />
<Sidebar />
<div class="container-fluid m-0 p-0" style="min-height: calc(100vh - 203px);">
    <h1>
        <a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict: {conflictName}
        {#if _rawData?.wiki}
            <a class="btn btn btn-info opacity-75 fw-bold" href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}">Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"></i></a>
            <hr class="mt-1">
        {/if}
    </h1>
    <ul class="nav nav-tabs nav-fill m-0 p-0">
        <li class="nav-item me-1">
            <a href="conflict?id={conflictId}&layout=coalition" class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold">
                <i class="bi bi-cookie"></i>&nbsp;Coalition
            </a>
        </li>
        <li class="nav-item me-1">
            <a href="conflict?id={conflictId}&layout=alliance" class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold">
                <i class="bi bi-diagram-3-fill"></i>&nbsp;Alliance
            </a>
        </li>
        <li class="nav-item me-1">
            <a href="conflict?id={conflictId}&layout=nation" class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold">
                <i class="bi bi-person-vcard-fill"></i>&nbsp;Nation
            </a>
        </li>
        <li class="nav-item me-1">
            <a class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold" href="tiering/?id={conflictId}">
                <i class="bi bi-bar-chart-line-fill"></i>&nbsp;Tier/Time
            </a>
        </li>
        <li class="nav-item me-1">
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 disabled fw-bold" on:click={() => alert("Coming soon")}>
                <i class="bi bi-bar-chart-steps"></i>&nbsp;TODO: Damage/Tier
            </button>
        </li>
        <li class="nav-item me-1">
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold bg-light">
                <i class="bi bi-bar-chart-steps"></i>&nbsp;Bubble/Time
            </button>
        </li>
        <li class="nav-item me-1">
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 disabled fw-bold" on:click={() => alert("Coming soon")}>
                <i class="bi bi-bar-chart-steps"></i>&nbsp;TODO: Rank/Time
            </button>
        </li>
        <li class="nav-item">
            <a class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold" href="chord/?id={conflictId}">
                <i class="bi bi-share-fill"></i>&nbsp;Web
            </a>
        </li>
    </ul>
    <pre>
        TODO:
        - Add buttons for the various metrics
        - Add buttons to toggle alliances
        - Switch from year to date for slider
        - Add color to legend
        - Move legend
        - Fix tiering graph
    </pre>
    <div>
        <div bind:this={graphDiv}></div>
    </div>
</div>
<Footer />