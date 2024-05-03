<script lang=ts>
/**
 * This page is for viewing tiering charts for a conflict 
*/
import Navbar from '../../components/Navbar.svelte'
import Sidebar from '../../components/Sidebar.svelte'
import Footer from '../../components/Footer.svelte'
import type { API,Options } from 'nouislider';
import { Chart, registerables, type ChartConfiguration } from 'chart.js';
Chart.register(...registerables);
import { onMount, tick } from 'svelte'; 
import { decompressBson, formatTurnsToDate, htmlToElement, type GraphData, type TierMetric, arrayEquals, setQueryParam, UNITS_PER_CITY, formatDate, formatDaysToDate, Palette, palettePrimary, generateColors, darkenColor, colorPalettes } from '$lib';
import { config } from '../+layout';
import Select from 'svelte-select';
import * as d3 from 'd3';
import noUiSlider from 'nouislider';

// Set after page load
let conflictName = "";
let conflictId = -1;

let normalize: boolean = false;
let previous_normalize: boolean = false;

let useSingleColor: boolean = false;
let previous_useSingleColor: boolean = false;

let sliderElement: HTMLDivElement;
let turnValues: number[];

let _allowedAllianceIds: Set<number> = new Set();

let dataSets: DataSet[];

/**
 * The raw data for the conflict, uninitialized until setupChartData is called
 */
 let _rawData: GraphData;

let selected_metrics: { value: string, label: string }[] = ["nation"].map((name) => {return {value: name, label: name}});
$: maxItems = selected_metrics?.length === 4;
$: items = maxItems || !_rawData ? [] : [..._rawData.metric_names.map((name) => {return {value: name, label: name}})];
$: {
    if (selected_metrics) {
        handleMetricsChange();
    }
}
let previous_selected: { value: string, label: string }[] = [];
function handleMetricsChange() {
    if (arrayEquals(previous_selected,selected_metrics)) return;
    maxItems = selected_metrics?.length === 4;
    previous_selected = selected_metrics.slice();
    if (_rawData && selected_metrics.length > 0) {
        setQueryParam('selected', selected_metrics.map((metric) => metric.value).join('.'));
        setupCharts(_rawData);
    }
}

async function handlePercentCheck(): Promise<boolean> {
    await tick();
    if (previous_normalize == normalize) return false;
    previous_normalize = normalize;
    if (_rawData) {
        setQueryParam('normalize', normalize ? 1 : null);
        setupCharts(_rawData);
    }
    return true;
}

async function handleColorCheck(): Promise<boolean> {
    await tick();
    if (previous_useSingleColor == useSingleColor) return false;
    previous_useSingleColor = useSingleColor;
    if (_rawData) {
        setQueryParam('unicolor', useSingleColor ? 1 : null);
        setupCharts(_rawData);
    }
    return true;
}

function setLayoutAlliance(coalitionIndex: number, allianceId: number) {
    let coalition = _rawData?.coalitions[coalitionIndex];
    let hasAll = coalition?.alliance_ids.every(id => _allowedAllianceIds.has(id));
    let countCoalition = coalition?.alliance_ids.filter(id => _allowedAllianceIds.has(id)).length;
    let hasAA = _allowedAllianceIds.has(allianceId);
    let otherCoalitionId = coalitionIndex === 0 ? 1 : 0;
    let otherCoalition = _rawData?.coalitions[otherCoalitionId];
    let otherHasAll = otherCoalition?.alliance_ids.every(id => _allowedAllianceIds.has(id));

    if (hasAA) {
        if (hasAll && otherHasAll) {
            // deselect everything in this coalition by this alliance
            _allowedAllianceIds = new Set([...(otherCoalition?.alliance_ids as number[]), allianceId]);
        } else if (countCoalition == 1) {
            // add all in this coalition
            _allowedAllianceIds = new Set([..._allowedAllianceIds, ...coalition?.alliance_ids as number[]]);
        } else {
            // deselect current
            _allowedAllianceIds = new Set([..._allowedAllianceIds].filter(id => id !== allianceId));
        }
    } else {
        _allowedAllianceIds = new Set([..._allowedAllianceIds, allianceId]);
    }
    if (_rawData) {
        setQueryParam('ids', Array.from(_allowedAllianceIds).join('.'));
        setupCharts(_rawData);
    }
}

function loadQueryParams(params: URLSearchParams) {
    let selected = params.get('selected');
    if (selected) {
        selected_metrics = selected.split('.').map((name) => {return {value: name, label: name}});
    }
    previous_selected = selected_metrics.slice();
    maxItems = selected_metrics?.length === 4;
    let normalizeStr = params.get('normalize');
    if (normalizeStr && !isNaN(+normalizeStr)) {
        normalize = (+normalizeStr) == 1;
    }
    let unicolorStr = params.get('unicolor');
    if (unicolorStr && !isNaN(+unicolorStr)) {
        useSingleColor = (+unicolorStr) == 1;
    }
}

// onMount runs when this component (i.e. the page) is loaded
// This gets the conflict id from the url query string, fetches the data from s3 and creates the charts
onMount(() => {
    // Get the conflict id from the url query string
    let queryParams = new URLSearchParams(window.location.search);
    loadQueryParams(queryParams);

    const id = queryParams.get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        setupChartData(conflictId);
    }
});

/**
 * Fetches data for a conflict
 * Sets the conflict name
 * Add the charts to the container div and set their data/settings
 * @param conflictId The id of the conflict
 */
function setupChartData(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip?${config.version.graph_data}`;
    decompressBson(url).then((data) => {
        _rawData = data;
        conflictName = _rawData.name;
        setupCharts(_rawData);
    });
}


// The layout of the charts (the key is id of the html element that'll be created)
// Multiple metrics will display as a stacked bar chart (between two coalitions)
// Its assumed the metrics are in the same units, otherwise the normalization will be incorrect
// Normalization = Average it per city (i.e. for soldier %)
let _chartLayouts: {[key: string]: {
    metrics: string[],
    normalize: boolean
}} = {
    "tiering": {
        metrics: ["nation"],
        normalize: false,
    },
    "mmr": {
        metrics: ["soldier","tank","aircraft","ship"],
        normalize: true,
    },
    "air %": {
        metrics: ["aircraft"],
        normalize: true,
    },
    "avg infra": {
        metrics: ["infra"],
        normalize: true,
    },
    "damage": {
        metrics: ["loss:loss_value", "dealt:loss_value"],
        normalize: true,
    },
    "wars won": {
        metrics: ["off:wars_won","def:wars_won"],
        normalize: false,
    },
}

function setLayout(name: string) {
    let layout = _chartLayouts[name];
    if (layout && _rawData) {
        selected_metrics = layout.metrics.map((name) => {return {value: name, label: name}});
        normalize = layout.normalize;
        previous_normalize = normalize;
        setQueryParam('selected', selected_metrics.map((metric) => metric.value).join('.'));
        setQueryParam('normalize', normalize ? 1 : null);
        setupCharts(_rawData);
    }
}

function getGraphDataAtTime(data: DataSet[], slider: number[]): {
    label: string,
    data: number[],
    backgroundColor: string,
    stack: string,
}[] {
    if (slider[0] == 0 && slider.length == 2) {
        slider = [slider[1]];
    }
    if (slider.length == 1) {
        return data.map((dataSet, i) => ({
            label: dataSet.label,
            data: dataSet.data[slider[0]],
            backgroundColor: dataSet.color,
            stack: '' + dataSet.group,
        }));
    } else {
        return data.map((dataSet, i) => {
            let data = dataSet.data[slider[1]].map((value, j) => value - (dataSet.data[slider[0]][j] | 0));
            return {
                label: dataSet.label,
                data: data,
                backgroundColor: dataSet.color,
                stack: '' + dataSet.group,
            }
        });
    }
}

function setupCharts(data: GraphData) {
    if (!data) return;
    // if selected_metrics is empty, set to default
    if (selected_metrics.length == 0) {
        selected_metrics = ["dealt:loss_value"].map((name) => {return {value: name, label: name}});
    }
    let metrics: TierMetric[] = selected_metrics.map((metric) => {
        return {
            name: metric.value,
            normalize: normalize,
            cumulative: metric.value.includes(":"),
        }
    });
    let isAnyCumulative = metrics.reduce((a, b) => a || b.cumulative, false);
    if (_allowedAllianceIds.size == 0) {
        _allowedAllianceIds = new Set(data.coalitions[0].alliance_ids.concat(data.coalitions[1].alliance_ids));
    }
    let alliance_ids = data.coalitions.map(coalition => coalition.alliance_ids.filter(id => _allowedAllianceIds.has(id)));

    let response: {
        data: DataSet[],
        time: [number, number],
        is_turn: boolean,
        city_range: [number, number],
    } = getDataSetsByTime(_rawData, metrics, alliance_ids)

    turnValues = isAnyCumulative ? response.time : [response.time[0]];
    dataSets = response.data;

    console.log("Day " + response.time[0]);

    let trace: {
        label: string,
        data: number[],
        backgroundColor: string,
        stack: string,
    }[] = getGraphDataAtTime(dataSets, isAnyCumulative ? [0, response.time[1] - response.time[0]] : [0]);
    


    let minCity = response.city_range[0];
    let maxCity = response.city_range[1];
    let labels = Array.from({length: maxCity - minCity + 1}, (_, i) => i + minCity);
    const chartData = {
        labels: labels,
        datasets: trace
    };
    console.log(chartData);
    console.log(dataSets[0].data)

    let title = selected_metrics.map(metric => metric.label).join(" / ") + " by City";
    const chartConfig: ChartConfiguration = {
        type: 'bar',
        data: chartData,
        options: {
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                title: {
                    display: true,
                    text: title,
                },
            },
            responsive: true,
            interaction: {
            intersect: false,
            },
            scales: {
            x: {
                stacked: true,
            },
            y: {
                stacked: true
            }
            }
        }
    };
    const chartElem = document.getElementById("myChart") as HTMLCanvasElement;
    let chartInstance = Chart.getChart(chartElem);
    if (chartInstance) {
        console.log("destroy chart");
        chartInstance.destroy();
    }
    console.log("creating chart");
    let chart = new Chart(chartElem, chartConfig);
    console.log("Created chart");

    let format = response.is_turn ? formatTurnsToDate : formatDaysToDate;
    let density = response.is_turn ? 60 : 5;
    let config: Options = {
        start: turnValues,
        connect: true,
        step: 1,
        tooltips: 
        isAnyCumulative ? 
            [{ to: value => format(value) },{ to: value => format(value) }] :
            [{ to: value => format(value) }],
        range: {
            'min': response.time[0],
            'max': response.time[1]
        },
        pips: {
            mode: 'steps',
            density: density,
            format: {
                to: value => format(value)
            },
            filter: (value, type) => {
                return value % density ? 0 : 2;
            }
        }
    };
    let sliderOrNull: API = sliderElement.noUiSlider;
    if (sliderOrNull) {
        sliderOrNull.destroy();
    }
    console.log("create slider");
    noUiSlider.create(sliderElement, config);

    sliderElement.noUiSlider.on('set', (values: string[]) => {
        let myChart = Chart.getChart(chartElem);
        if (!myChart) return;
        let stepSize = sliderElement.noUiSlider.options.step || 1;
        let minValue = Number(sliderElement.noUiSlider.options.range.min);
        let indices = values.map(value => Math.round((Number(value) - minValue) / stepSize));
        let trace = getGraphDataAtTime(dataSets, indices);
        myChart.data.datasets.forEach((dataset, i) => {
            dataset.data = trace[i].data;
        });
        myChart.update();
    });
}

interface DataSet {
    group: number,
    label: string,
    color: string,
    data: number[][],
}

// Convert the raw json data from S3 to a Chart.js dataset (for the specific metrics and turn/day range)
// Normalization will divide by the number of units per city (see UNITS_PER_CITY)
function getDataSetsByTime(data: GraphData, metrics: TierMetric[], alliance_ids: number[][]): 
{
    data: DataSet[],
    city_range: [number, number],
    time: [number, number],
    is_turn: boolean,
} {
    let minCity = Number.MAX_SAFE_INTEGER;
    let maxCity = 0;
    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        minCity = Math.min(minCity, ...coalition.cities);
        maxCity = Math.max(maxCity, ...coalition.cities);
    }

    let normalizeAny = metrics.reduce((a, b) => a || b.normalize, false);
    let stackByAlliance = !normalizeAny && metrics.length == 1;
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
            metric_normalize.push(perCity | 0);
        } else {
            metric_normalize.push(-1);
        }
    }

    let isAnyTurn = metric_is_turn.reduce((a, b) => a || b);
    let len = metrics.length == 1 ? alliance_ids.length : data.coalitions.length * metrics.length;
    let allianceSets: Set<number>[] = alliance_ids.map(id => new Set(id));

    let dataBeforeNormalize: [
        number, // coalition
        string, // label
        string, // color
        number[][], // data
        number[][], // counts (or null, if not normalize)
    ][] = new Array(len);

    let time_min = isAnyTurn ? data.coalitions.reduce((a, b) => Math.min(a, b.turn.range[0]), Number.MAX_SAFE_INTEGER) : data.coalitions.reduce((a, b) => Math.min(a, b.day.range[0]), Number.MAX_SAFE_INTEGER);
    let time_max = isAnyTurn ? data.coalitions.reduce((a, b) => Math.max(a, b.turn.range[1]), 0) : data.coalitions.reduce((a, b) => Math.max(a, b.day.range[1]), 0);
    let dataSetTimeLen = time_max - time_min + 1;

    let jUsed = 0;
    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        let allowed_alliances = allianceSets[i];

        let turn_start = coalition.turn.range[0];
        let day_start = coalition.day.range[0];
        let col_time_min = isAnyTurn ? turn_start : day_start;
        let col_time_max = isAnyTurn ? coalition.turn.range[1] : coalition.day.range[1];
        let numAlliances = coalition.alliance_ids.reduce((count, id) => allowed_alliances.has(id) ? count + 1 : count, 0);
        let palette: Palette = Object.keys(Palette).map(Number).indexOf(i);
        let colorLen = useSingleColor ? 1 : stackByAlliance ? numAlliances : metrics.length;
        let colors = colorLen > 1 ? generateColors(d3, colorLen, palette) : ['rgb(' + palettePrimary[i] + ')'];
        let colorIndex = 0;
        for (let j = 0; j < coalition.alliance_ids.length; j++) {
            let alliance_id = coalition.alliance_ids[j];
            if (!allowed_alliances.has(alliance_id)) continue;
            let name = coalition.alliance_names[j];
            
            // metric -> city
            let aaBufferByMetric: number[][] = new Array(metrics.length);

            let last_day = -1;
            for (let turnOrDay2 = col_time_min; turnOrDay2 <= col_time_max; turnOrDay2++) {
                let dataI = turnOrDay2 - time_min;
                let dataColI = turnOrDay2 - col_time_min;
                let turnI = isAnyTurn ? (dataColI) : (dataColI) * 12;
                let dayI = isAnyTurn ? Math.floor((dataColI) / 12) : (dataColI);

                for (let k = 0; k < metrics.length; k++) {
                    let dataSetIndex = jUsed * metrics.length + k;
                    let is_turn = metric_is_turn[k];
                    if (!is_turn && last_day == dayI) continue;
                    let metricI = is_turn ? turnI : dayI;
                    let isCumulative = metrics[k].cumulative;

                    let aaBuffer = aaBufferByMetric[k];
                    if (!aaBuffer) {
                        aaBuffer = aaBufferByMetric[k] = new Array(maxCity - minCity + 1).fill(0);
                    }

                    let dataSet = dataBeforeNormalize[dataSetIndex];
                    if (!dataSet) {
                        dataSet = dataBeforeNormalize[dataSetIndex] = [
                            i,
                            (stackByAlliance ? name : coalition.name) + (metrics.length > 1 ? "(" + metrics[k].name + ")" : ""),
                            colors[useSingleColor ? 0 : colorIndex + k], 
                            new Array(dataSetTimeLen),
                            normalizeAny ? new Array(dataSetTimeLen) : null
                        ];
                    }
                    let tierData = dataSet[3][dataI];
                    if (!tierData) {
                        tierData = dataSet[3][dataI] = new Array(maxCity - minCity + 1).fill(0);
                    }
                    let counts;
                    if (normalizeAny) {
                        counts = dataSet[4][dataI];
                        if (!counts) {
                            counts = dataSet[4][dataI] = new Array(maxCity - minCity + 1).fill(0);
                        }
                    }
                    let normalize = metric_normalize[k];
                    if (normalize != -1) {
                        let nation_counts_by_day = coalition.day.data[0][j];
                        if (!nation_counts_by_day) {
                            continue;
                        }
                        let nation_counts = nation_counts_by_day[dayI];
                        if (!nation_counts || nation_counts.length == 0) {
                            continue;
                        }
                        if (normalize == 0) {
                            for (let l = 0; l < counts.length; l++) {
                                // let city = coalition.cities[l];
                                let value = nation_counts[l];
                                counts[l] += value;
                            }
                        } else {
                            for (let l = 0; l < counts.length; l++) {
                                let city = coalition.cities[l];
                                let value = nation_counts[l];
                                counts[l] += value * city * normalize;
                            }
                        }
                    }

                    let metric_id = metric_ids[k];
                    let metric_index = metric_indexes[k];
                    let value_by_time = (is_turn ? coalition.turn.data[metric_index][j] : coalition.day.data[metric_index][j]);
                    if (value_by_time && value_by_time.length != 0) {
                        let value_by_city = value_by_time[metricI];
                        if (value_by_city && value_by_city.length != 0) {
                            if (isCumulative) {
                                for (let l = 0; l < value_by_city.length; l++) {
                                    let city = coalition.cities[l];
                                    let value = value_by_city[l];
                                    aaBuffer[l] += value;
                                }
                            } else {
                                for (let l = minCity; l < coalition.cities[0]; l++) {
                                    aaBuffer[l - minCity] = 0;
                                }
                                for (let l = coalition.cities[coalition.cities.length - 1] + 1; l <= maxCity; l++) {
                                    aaBuffer[l - minCity] = 0;
                                }
                                for (let l = 0; l < value_by_city.length; l++) {
                                    let city = coalition.cities[l];
                                    let value = value_by_city[l];
                                    aaBuffer[city - minCity] = value;
                                }
                            }
                        }
                    }
                    for (let l = 0; l < aaBuffer.length; l++) {
                        tierData[l] += aaBuffer[l];
                    }
                }
                last_day = dayI;
            }
            colorIndex++;
            if (stackByAlliance) {
                jUsed++;
            }
        }
        if (!stackByAlliance) {
            jUsed++;
        }
    }

    let response: DataSet[] = new Array(len);
    for (let i = 0; i < dataBeforeNormalize.length; i++) {
        let [col, label, color, data, counts] = dataBeforeNormalize[i];
        // iterate data, and set each array to previous value if empty
        let normalized: number[][] = new Array(data.length);
        for (let k = 0; k < data.length; k++) {
            let dataK = data[k];
            if (!dataK || dataK.length == 0) {
                if (k > 0) {
                    dataK = data[k - 1];
                }
            }
            if (dataK && dataK.length > 0 && counts) {
                let countsK = counts[k];
                for (let j = 0; j < dataK.length; j++) {
                    dataK[j] = dataK[j] / countsK[j];
                }
            }
            normalized[k] = dataK;
        }
        response[i] = {
            group: col,
            label: label,
            color: color,
            data: normalized,
        }
    }
    return {
        data: response,
        time: [time_min, time_max],
        is_turn: isAnyTurn,
        city_range: [minCity, maxCity],
    };
}

</script>
<svelte:head>
	<title>Graphs</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.css" />
    <style>
        .noUi-value {
            color: #666; /* Change this to the color you want */
        }
        /* Override the item styles */
        .select-compact {
            --border-radius: 0px;
            --height:24px;
            --chevron-height: 0px;
            --multi-item-height: 20px;
            --value-container-padding: 0px;
            --multi-select-input-margin: 0px;
            --multi-select-padding: 0px 4px 0px 4px;
            --item-padding: 0px 4px 0px 4px;

        }
    </style>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container-fluid m-0 p-0" style="min-height: calc(100vh - 203px);">
    <div class="row m-0 p-0">
        <div class="col-12 m-0 p-0">
            <h1><a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict Tiering: {conflictName}</h1>
            <hr class="mt-1">
            <!-- The tabs -->
            <div class="row p-0 m-0">
                <a href="conflict?id={conflictId}&layout=coalition" class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom">
                    ◑&nbsp;Coalition
                </a>
                <a href="conflict?id={conflictId}&layout=alliance" class="col-2 btn ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom">
                    𖣯&nbsp;Alliance
                </a>
                <a href="conflict?id={conflictId}&layout=nation" class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom">
                    ♟&nbsp;Nation
                </a>
                <button class="col-2 ps-0 pe-0 btn border rounded-bottom-0 fw-bold bg-light-subtle border-bottom-0">
                    📊&nbsp;Tier/Time
                </button>
                <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="bubble/?id={conflictId}">
                    📈&nbsp;Bubble/Time
                </a>
                <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="chord/?id={conflictId}">
                    🌐&nbsp;Web
                </a>
            </div>
        </div>
    </div>
    <div class="row m-0 p-0 bg-light-subtle border-bottom border-3" style="min-height: 116px">
        <div class="col-12">
            <div class="bg-light-subtle p-1 fw-bold border-bottom border-3 pb-0" style="min-height: 71px;">
                {#if _rawData}
                    <div class="bg-danger-subtle p-1 pb-0 mb-1">
                        {_rawData?.coalitions[0].name}:
                        {#each _rawData.coalitions[0].alliance_ids as id, index}
                            <button class="btn btn-sm ms-1 mb-1 btn-secondary btn-outline-danger opacity-75 fw-bold" class:active={_allowedAllianceIds.has(id)} on:click={() => setLayoutAlliance(0, id)}>{_rawData.coalitions[0].alliance_names[index]}</button>
                        {/each}
                    </div>
                    <div class="bg-info-subtle p-1 pb-0">
                        {_rawData?.coalitions[1].name}:
                        {#each _rawData.coalitions[1].alliance_ids as id, index}
                            <button class="btn btn-sm ms-1 mb-1 btn-secondary btn-outline-info opacity-75 fw-bold" class:active={_allowedAllianceIds.has(id)} on:click={() => setLayoutAlliance(1, id)}>{_rawData.coalitions[1].alliance_names[index]}</button>
                        {/each}
                    </div>
                {/if}
            </div>
            <div style="width: calc(100% - 30px);margin-left:15px;position: relative; z-index: 1;">
                <div class="mt-3 mb-5" bind:this={sliderElement}></div>
            </div>
            <div class="select-compact mb-1" style="position: relative; z-index: 3;">
                <Select multiple items={items} bind:value={selected_metrics} showChevron={true}>
                    <div class="empty" slot="empty">{maxItems ? 'Max 4 items' : 'No options'}</div>
                </Select>
            </div>
            <label for="inlineCheckbox1" style="position: relative; z-index: 2;">
                <div class:bg-info-subtle={normalize} class:bg-light-subtle={!normalize} class="p-1 rounded d-inline-block">
                    <span class="fw-bold">Use Percent:</span>
                    <input class="form-check-input m-1" style="position: relative; z-index: 2;" type="checkbox" id="inlineCheckbox1" value="option1" bind:checked={normalize} on:change={handlePercentCheck}>
                </div>
            </label>
            <label for="inlineCheckbox2" style="position: relative; z-index: 2;">
                <div class:bg-info-subtle={useSingleColor} class:bg-light-subtle={!useSingleColor} class="p-1 rounded d-inline-block">
                    <span class="fw-bold">Single Color:</span>
                    <input class="form-check-input m-1" style="position: relative; z-index: 2;" type="checkbox" id="inlineCheckbox2" value="option1" bind:checked={useSingleColor} on:change={handleColorCheck}>
                </div>
            </label>
            {#if _rawData}
                <div class="bg-light-subtle rounded p-1 d-inline-block" style="position: relative; z-index:2;">
                    <span class="fw-bold">Quick Layouts:</span>
                    {#each Object.entries(_chartLayouts) as [name, layout]}
                        <button on:click={() => setLayout(name)} class="btn btn-sm btn-secondary btn-outline-info opacity-75 fw-bold" style="margin:-1px 1px -1px 1px;">
                            {name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
    <div class="container-fluid m0 p0">
        <div class="chart-container" style="position: relative; height:80vh; width:100%;">
            <canvas id="myChart"></canvas>
        </div>
        <!-- <canvas id="myChart" width="400" height="400"></canvas> -->
    </div>
</div>
<Footer />