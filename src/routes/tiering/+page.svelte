<script lang=ts>
/**
 * This page is for viewing tiering charts for a conflict 
*/
import Navbar from '../../components/Navbar.svelte'
import Sidebar from '../../components/Sidebar.svelte'
import Footer from '../../components/Footer.svelte'
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { onMount } from 'svelte'; 
import { decompressBson, htmlToElement } from '$lib';

// Set after page load
let conflictName = "";
let conflictId = -1;

// onMount runs when this component (i.e. the page) is loaded
// This gets the conflict id from the url query string, fetches the data from s3 and creates the charts
onMount(() => {
    // Get the conflict id from the url query string
    const id = new URLSearchParams(window.location.search).get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        // setup the charts for conflict id
        setupChartData(conflictId);
    }

    // Update chart function (called from the slider) 
    // This gets the turn set, sets the label to the date, grabs the new dataset and sets the chart data
    // No change if there's no data for that turn
    (window as any).updateChart = (slider: HTMLInputElement, turnStr: string) => {
        let turn = parseInt(turnStr);
        ((((slider.parentElement) as HTMLElement).querySelector("label")) as HTMLLabelElement).innerText = "Date: " + sliderValueToDate(turn);
        let canvas = slider.nextElementSibling as HTMLCanvasElement;
        let element_id = canvas.id;
        let layout = _chartLayouts[element_id];
        let myChart = layout.chart as Chart;
        let dataSets = getDataSets(turn, layout.metrics, layout.normalize);
        if (dataSets) {
            myChart.data.datasets.forEach((dataset, i) => {
                dataset.data = dataSets[i].data;
            });
            myChart.update();
        }
    }
});

/**
 * Fetches data for a conflict
 * Sets the conflict name
 * Add the charts to the container div and set their data/settings
 * @param conflictId The id of the conflict
 */
function setupChartData(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip`;
    decompressBson(url).then((data) => {
        conflictName = data.name;
        setupCharts(data);
    });
}

/**
 * The raw data for the conflict, uninitialized until setupChartData is called
 */
let _rawData: {
    metric_names: string[], // the metric names
    metrics_day: number[], // The metric indexes that are by day
    metrics_turn: number[], // The metric indexes that are by turn
    coalitions: [
        {
            cities: number[], // Array of cities the metrics are for
            turns: number[], // Array of turns the metrics are for
            turn_data: number[][][], // 3d array of the turn -> metric -> value
            days: number[], // Array of days the metrics are for
            day_data: number[][][], // 3d array of the day -> metric -> value. 
        }
    ]
};
// City and turn ranges (min and max) - uninitialized until setupCharts is called
let maxCity = 0;
let minCity = 100;
let minTurn = Number.MAX_SAFE_INTEGER;
let maxTurn = 0;
let minDay = Number.MAX_SAFE_INTEGER;
let maxDay = 0;

// Constants for unit counts per city (used to scale graphs, e.g. Militarization %)
let UNITS_PER_CITY: {[key: string]: number} = {
    "SOLDIER": 15_000,
    "TANK": 1250,
    "AIRCRAFT": 75,
    "SHIP": 15,
    "INFRA": 1 // 1 means it'll just divide by # of cities
}

// The layout of the charts (the key is id of the html element that'll be created)
// Multiple metrics will display as a stacked bar chart (between two coalitions)
// Its assumed the metrics are in the same units, otherwise the normalization will be incorrect
// Normalization = Average it per city (i.e. for soldier %)
let _chartLayouts: {[key: string]: {
    metrics: string[],
    normalize: boolean
    chart: Chart | null
}} = {
    "tiering": {
        metrics: ["NATION"],
        normalize: false,
        chart: null
    },
    "avg_mil": {
        metrics: ["SOLDIER","TANK","AIRCRAFT","SHIP"],
        normalize: true,
        chart: null
    },
    "total_mil": {
        metrics: ["SOLDIER","TANK","AIRCRAFT","SHIP"],
        normalize: false,
        chart: null
    },
    "avg_infra": {
        metrics: ["INFRA"],
        normalize: true,
        chart: null
    },
    "infra": {
        metrics: ["INFRA"],
        normalize: false,
        chart: null
    },
    "avg_beige": {
        metrics: ["BEIGE"],
        normalize: true,
        chart: null
    },
    "beige": {
        metrics: ["BEIGE"],
        normalize: false,
        chart: null
    },
    // Not enabled as I dont have spy data for past conflicts yet
    // "avg_spies": {
    //     metrics: ["BEIGE"],
    //     normalize: true,
    //     chart: null
    // },
    // "spies": {
    //     metrics: ["BEIGE"],
    //     normalize: false,
    //     chart: null
    // }
}

/**
 * Creates a chart for a layout (from the _chartLayouts object)
 * @param element_id the id of the element (will be cleared and replaced with the chart)
 */
function createChart(element_id: string) {
    // Get container to add the chart to
    let charts = document.getElementById("charts") as HTMLElement;
    // Get layout data
    let layout = _chartLayouts[element_id];

    // Set the html for the chart
    let html = `<div class="col-lg-4 col-md-6 col-sm-12">
        <label for="turn" class="form-label">${element_id}</label>
        <input type="range" min=${minTurn} max=${maxTurn} step=2 class="slider w-100" onChange="updateChart(this,this.value)">
        <canvas id="${element_id}" width="400" height="400"></canvas>
    </div>`;
    let elem = htmlToElement(html) as HTMLElement;
    charts.appendChild(elem as HTMLElement);
    (elem.querySelector("input") as HTMLInputElement).value = maxTurn.toString();
    (elem.querySelector("label") as HTMLLabelElement).innerText = "Date: " + sliderValueToDate(maxTurn);

    // Fetch the data for the specific layout (i.e. an array) for Chart.js 
    let dataSets = getDataSets(maxTurn, layout.metrics, layout.normalize);
    // Object with the dataset and chart labels
    const chartData = {
        labels: Array.from({length: maxCity - minCity + 1}, (_, i) => i + minCity),
        datasets: dataSets
    };
    // Chart title
    let title = (layout.normalize ? "Average" : "Total") + " " + layout.metrics.join("/") + " by City";
    // Chart settings (stacked bar chart)
    const config = {
        type: 'bar',
        data: chartData,
        options: {
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
    // Get the chart element
    const ctx = document.getElementById(element_id);
    // Setup chart.js
    layout.chart = new Chart(ctx as HTMLCanvasElement, config as any);
}

function setupCharts(data: {
    metric_names: string[], // the metric names
    metrics_day: number[], // The metric indexes that are by day
    metrics_turn: number[], // The metric indexes that are by turn
    coalitions: [
        {
            cities: number[],
            turns: number[],
            turn_data: number[][][], // 3d array of the turn -> metric -> value
            days: number[],
            day_data: number[][][], // 3d array of the day -> metric -> value. 
        }
    ]
}) {
    // Set the global var so other functions can acces (i.e. the time slider)
    _rawData = data;
    
    // Calculate min/max ranges for city and turn/day
    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        maxCity = Math.max(maxCity, ...coalition.cities);
        minCity = Math.min(minCity, ...coalition.cities);
        maxTurn = Math.max(maxTurn, ...coalition.turns);
        minTurn = Math.min(minTurn, ...coalition.turns);
        maxDay = Math.max(maxDay, ...coalition.days);
        minDay = Math.min(minDay, ...coalition.days);

    }
    // create charts for each layout
    for (let key in _chartLayouts) {
        createChart(key);
    }
}

// Convert the raw json data from S3 to a Chart.js dataset (for the specific metrics and turn/day range)
// Normalization will divide by the number of units per city (see UNITS_PER_CITY)
function getDataSets(turn: number, metrics: string[], normalizePerCity: boolean = false): {
        label: string,
        data: number[],
        backgroundColor: string,
        stack: string,
    }[] {
    // Indexes used for the metrics
    let metricToId: number[] = [] // Array of metric ids
    let metricIsDay: boolean[] = [] // If the metric is by day (same order as metric id)
    let metricToIndex: number[] = [] // The index in the turn/day data for the metric
    let normalizePerCityAmt: number[] = [] // The amount to normalize by per city (null if the metric doesn't need to be normalized)
    for (let i = 0; i < metrics.length; i++) {
        let id = _rawData.metric_names.indexOf(metrics[i]);
        let isDay = _rawData.metrics_day.includes(id);
        metricToId.push(id);
        metricIsDay.push(isDay);
        metricToIndex.push((isDay ? _rawData.metrics_day : _rawData.metrics_turn).indexOf(id));
        normalizePerCityAmt.push(UNITS_PER_CITY[metrics[i]]);
    }

    // Object to be returned (the datasets for the chart)
    let dataSets: {
        label: string,
        data: number[],
        backgroundColor: string,
        stack: string,
    }[] = [];

    // 12 turns per day
    let day = Math.floor(turn / 12);

    // Iterate over each coalition (typically 2)
    for (let i = 0; i < _rawData.coalitions.length; i++) {
        // Coalition:
        //     cities: number[];
        //     turns: number[];
        //     turn_data: number[][][];
        //     days: number[];
        //     day_data: number[][][];
        let coalition = _rawData.coalitions[i];
        // Get the index of the turn/day
        let turnI = coalition.turns.indexOf(turn);
        let dayI = coalition.days.indexOf(day);
         // Color ratio (used for coloring the bars)
        let ratio = 255.0 / (metrics.length);

        for (let j = 0; j < metricToId.length; j++) {
            let id = metricToId[j];
            let isDay = metricIsDay[j];
            let index = metricToIndex[j];
            let perCity = normalizePerCityAmt[j];
            let metricName = _rawData.metric_names[id];
            // Index in the turn or day array
            let turnOrDayI = isDay ? dayI : turnI;
            if (turnOrDayI === -1) {
                // Shouldn't happen
                console.log("No day/turn found for " + (isDay ? "day" : "turn") + " " + turn + " for coalition " + i + " | min:" + (isDay ? minDay : minTurn) + " | max:" + (isDay ? maxDay : maxTurn));
                console.log("Valid " + (isDay ? "days" : "turns") + " for coalition " + i + " | " + (isDay ? coalition.days : coalition.turns) + " | " + (typeof turn) + " | " + (typeof day) + " | " + (typeof coalition.days[0]) + " | " + (typeof coalition.turns[0]));
                return null;
            }

            // Empty row to be added to the dataSets
            let row = new Array(maxCity - minCity + 1).fill(0);
            // Get the data for the specific metric
            let data = isDay ? coalition.day_data : coalition.turn_data;
            let dataByCities = data[index][turnOrDayI];
            for (let k = 0; k < dataByCities.length; k++) {
                // Get the city count and the value at that city
                let city = coalition.cities[k];
                let value = dataByCities[k];
                // Normalize value (if enabled)
                if (normalizePerCity) {
                    let dayData = coalition.day_data[0][dayI];
                    if (dayData != null) {
                        let nations = dayData[k];
                        let factor = nations;
                        if (perCity) {
                            factor *= perCity;
                        }
                        if (factor) {
                            value /= (factor * city);
                        }
                    } else {
                        value = 0;
                    }
                }
                // Add the value to the row
                row[city - minCity] = value;
            }

            let dataSet = {
                // Label for the dataset
                label: "C" + (i + 1) + " " + metricName.toLowerCase() + "s",
                data: row,
                // bar color
                backgroundColor: `rgb(${i == 0 ? ratio * (j + 2) + 64 : ratio * (j)}, ${ratio * (j)}, ${i == 1 ? ratio * (j + 2) + 64 : ratio * (j)})`,
                stack: '' + i,
            };
            dataSets.push(dataSet);
        }
    }
    return dataSets;
}
// Convert the slider (turns) to a time string
function sliderValueToDate(value: number) {
    let timeMillis = (value / 12) * 60 * 60 * 24 * 1000;
    let date = new Date();
    date.setTime(timeMillis);
    return date.toISOString().slice(0, 16).replace("T", " ");
}
</script>
<svelte:head>
	<title>Graphs</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container-fluid" style="min-height: calc(100vh - 203px);">
    <h1><a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict Tiering: {conflictName}</h1>
    <!-- The tabs -->
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
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold bg-light">
                <i class="bi bi-bar-chart-line-fill"></i>&nbsp;Tiering
            </button>
        </li>
        <li class="nav-item me-1">
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 disabled fw-bold" on:click={() => alert("Coming soon")}>
                <i class="bi bi-bar-chart-steps"></i>&nbsp;TODO: Rank/Time
            </button>
        </li>
        <li class="nav-item me-1">
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 disabled fw-bold" on:click={() => alert("Coming soon")}>
                <i class="bi bi-graph-up"></i>&nbsp;TODO: Graphs
            </button>
        </li>
        <li class="nav-item">
            <a class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold" href="chord/?id={conflictId}">
                <i class="bi bi-share-fill"></i>&nbsp;War Web
            </a>
        </li>
    </ul>
    <div class="row" id="charts">
    </div>
</div>
<Footer />