<script lang='ts'>
import * as d3 from 'd3';
import { onMount } from 'svelte';
import Navbar from '../../components/Navbar.svelte';
import Sidebar from '../../components/Sidebar.svelte';
import Footer from '../../components/Footer.svelte';
    import type { Conflict } from '$lib';

let _rawData: Conflict;
let conflictId: string;
let conflictName: string;

let graphDiv: HTMLDivElement;
onMount(async () => {
    createGraph();
});
function createGraph(){
    d3.csv("https://raw.githubusercontent.com/plotly/datasets/master/gapminderDataFiveYear.csv")
    .then(function(data) {
        // Create a lookup table to sort and regroup the columns of data,
        // first by year, then by continent:
        var lookup = {};
        function getData(year, continent) {
            var byYear, trace;
            if (!(byYear = lookup[year])) {;
            byYear = lookup[year] = {};
            }
            // If a container for this year + continent doesn't exist yet,
            // then create one:
            if (!(trace = byYear[continent])) {
                trace = byYear[continent] = {
                    x: [],
                    y: [],
                    id: [],
                    text: [],
                    marker: {size: []}
                };
            }
            return trace;
        }

        // Go through each row, get the right trace, and append the data:
        for (var i = 0; i < data.length; i++) {
            var datum = data[i];
            var trace = getData(datum.year, datum.continent);
            trace.text.push(datum.country);
            trace.id.push(datum.country);
            trace.x.push(datum.lifeExp);
            trace.y.push(datum.gdpPercap);
            trace.marker.size.push(datum.pop);
        }

        // Get the group names:
        var years = Object.keys(lookup);
        // In this case, every year includes every continent, so we
        // can just infer the continents from the *first* year:
        var firstYear = lookup[years[0]];
        var continents = Object.keys(firstYear);

        // Create the main traces, one for each continent:
        var traces = [];
        for (i = 0; i < continents.length; i++) {
            var data = firstYear[continents[i]];
            // One small note. We're creating a single trace here, to which
            // the frames will pass data for the different years. It's
            // subtle, but to avoid data reference problems, we'll slice
            // the arrays to ensure we never write any new data into our
            // lookup table:
            traces.push({
            name: continents[i],
            x: data.x.slice(),
            y: data.y.slice(),
            id: data.id.slice(),
            text: data.text.slice(),
            mode: 'markers',
            marker: {
                size: data.marker.size.slice(),
                sizemode: 'area',
                sizeref: 200000
            }
            });
        }

        // Create a frame for each year. Frames are effectively just
        // traces, except they don't need to contain the *full* trace
        // definition (for example, appearance). The frames just need
        // the parts the traces that change (here, the data).
        var frames = [];
        for (i = 0; i < years.length; i++) {
            frames.push({
            name: years[i],
            data: continents.map(function (continent) {
                return getData(years[i], continent);
            })
            })
        }

        // Now create slider steps, one for each frame. The slider
        // executes a plotly.js API command (here, Plotly.animate).
        // In this example, we'll animate to one of the named frames
        // created in the above loop.
        var sliderSteps = [];
        for (i = 0; i < years.length; i++) {
            console.log("YEar " + years[i])
            sliderSteps.push({
            method: 'animate',
            label: years[i],
            args: [[years[i]], {
                mode: 'immediate',
                transition: {duration: 300},
                frame: {duration: 300, redraw: false},
            }]
            });
        }

        var layout = {
            xaxis: {
            title: 'Life Expectancy',
            range: [30, 85]
            },
            yaxis: {
            title: 'GDP per Capita',
            type: 'log'
            },
            hovermode: 'closest',
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
                transition: {duration: 300},
                frame: {duration: 500, redraw: false}
                }],
                label: 'Play'
            }, {
                method: 'animate',
                args: [[null], {
                mode: 'immediate',
                transition: {duration: 0},
                frame: {duration: 0, redraw: false}
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
            }]
        };

        Plotly.react(graphDiv, {
            data: traces,
            layout: layout,
            frames: frames
        });
    })
    .catch(function(err) {
      // Handle errors here
      console.error(err);
    });
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
    <div>
        <div bind:this={graphDiv}></div>
    </div>
</div>
<Footer />