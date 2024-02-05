<script lang=ts>
import Navbar from '../../components/Navbar.svelte'
import Sidebar from '../../components/Sidebar.svelte'
import Footer from '../../components/Footer.svelte'
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { onMount } from 'svelte'; 
import { decompressBson, htmlToElement } from '$lib';

let conflictName = "";
let conflictId = -1;

onMount(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        fetchChartData(conflictId);
    }

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


function fetchChartData(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip`;
    decompressBson(url).then((data) => {
        conflictName = data.name;
        setupCharts(data);
    });
}

let _rawData: {
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
};
let maxCity = 0;
let minCity = 100;
let minTurn = Number.MAX_SAFE_INTEGER;
let maxTurn = 0;
let minDay = Number.MAX_SAFE_INTEGER;
let maxDay = 0;

let UNITS_PER_CITY: {[key: string]: number} = {
    "SOLDIER": 15_000,
    "TANK": 1250,
    "AIRCRAFT": 75,
    "SHIP": 15,
}

let _chartLayouts: {[key: string]: {
    metrics: string[],
    normalize: boolean
    chart: Chart | null
}} = {
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
    "tiering": {
        metrics: ["NATION"],
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

function createChart(element_id: string) {
    let layout = _chartLayouts[element_id];
    let charts = document.getElementById("charts") as HTMLElement;
    let html = `<div class="col-lg-4 col-md-6 col-sm-12">
        <label for="turn" class="form-label">${element_id}</label>
        <input type="range" min=${minTurn} max=${maxTurn} step=2 class="slider w-100" onChange="updateChart(this,this.value)">
        <canvas id="${element_id}" width="400" height="400"></canvas>
    </div>`;
    let elem = htmlToElement(html) as HTMLElement;
    charts.appendChild(elem as HTMLElement);
    (elem.querySelector("input") as HTMLInputElement).value = maxTurn.toString();
    (elem.querySelector("label") as HTMLLabelElement).innerText = "Date: " + sliderValueToDate(maxTurn);


    let dataSets = getDataSets(maxTurn, layout.metrics, layout.normalize);
    const chartData = {
        labels: Array.from({length: maxCity - minCity + 1}, (_, i) => i + minCity),
        datasets: dataSets
    };
    let title = (layout.normalize ? "Average" : "Total") + " " + layout.metrics.join("/") + " by City";
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
    const ctx = document.getElementById(element_id);
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
    _rawData = data;
    

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

function getDataSets(turn: number, metrics: string[], normalizePerCity: boolean = false) {
    let metricToId: number[] = []
    let metricIsDay: boolean[] = []
    let metricToIndex: number[] = []
    let normalizePerCityAmt: number[] = []
    for (let i = 0; i < metrics.length; i++) {
        let id = _rawData.metric_names.indexOf(metrics[i]);
        let isDay = _rawData.metrics_day.includes(id);
        console.log("Metric " + metrics[i] + " | " + _rawData.metric_names[id] + " | " + isDay);
        metricToId.push(id);
        metricIsDay.push(isDay);
        metricToIndex.push((isDay ? _rawData.metrics_day : _rawData.metrics_turn).indexOf(id));
        normalizePerCityAmt.push(UNITS_PER_CITY[metrics[i]]);
    }

    let dataSets: {
        label: string,
        data: number[],
        backgroundColor: string,
        stack: string,
    }[] = [];

    let day = Math.floor(turn / 12);

    for (let i = 0; i < _rawData.coalitions.length; i++) {
        let coalition = _rawData.coalitions[i];
        let turnI = coalition.turns.indexOf(turn);
        let dayI = coalition.days.indexOf(day);
        let ratio = 255.0 / (metrics.length);

        for (let j = 0; j < metricToId.length; j++) {
            let id = metricToId[j];
            let isDay = metricIsDay[j];
            let index = metricToIndex[j];
            let perCity = normalizePerCityAmt[j];
            let metricName = _rawData.metric_names[id];
            let turnOrDayI = isDay ? dayI : turnI;
            if (turnOrDayI === -1) {
                console.log("No day/turn found for " + (isDay ? "day" : "turn") + " " + turn + " for coalition " + i + " | min:" + (isDay ? minDay : minTurn) + " | max:" + (isDay ? maxDay : maxTurn));
                console.log("Valid " + (isDay ? "days" : "turns") + " for coalition " + i + " | " + (isDay ? coalition.days : coalition.turns) + " | " + (typeof turn) + " | " + (typeof day) + " | " + (typeof coalition.days[0]) + " | " + (typeof coalition.turns[0]));
                return null;
            }
            
            let data = isDay ? coalition.day_data : coalition.turn_data;
            let row = new Array(maxCity - minCity + 1).fill(0);
            let dataByCities = data[index][turnOrDayI];
            for (let k = 0; k < dataByCities.length; k++) {
                let city = coalition.cities[k];
                let value = dataByCities[k];
                if (normalizePerCity) {
                    let nations = coalition.day_data[0][dayI][k];
                    let factor = nations;
                    if (perCity) {
                        factor *= perCity;
                    }
                    if (factor) {
                        value /= (factor * city);
                    }
                }
                row[city - minCity] = value;
            }

            let dataSet = {
                label: "C" + i + " " + metricName.toLowerCase() + "s",
                data: row,
                backgroundColor: `rgb(${i == 0 ? ratio * (j + 2) + 64 : ratio * (j)}, ${ratio * (j)}, ${i == 1 ? ratio * (j + 2) + 64 : ratio * (j)})`,
                stack: '' + i,
            };
            dataSets.push(dataSet);
        }
    }
    return dataSets;
}
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
    <h1><a href="conflict?id={conflictId}"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict: {conflictName}</h1>
    <div class="row" id="charts">
    </div>

</div>
<Footer />