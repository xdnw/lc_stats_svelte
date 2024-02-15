<script lang="ts">
  import { decompressBson, type Conflict } from "$lib";
  import { onMount } from "svelte";
  import Navbar from "../../components/Navbar.svelte";
  import Sidebar from "../../components/Sidebar.svelte";
//   import * as d3 from "d3";

let conflictName = "";
let conflictId = -1;

let _rawData: Conflict | null = null;
let _allowedAllianceIds: number[] = [];
let _currentHeaderName: string = "wars";

onMount(() => {
    let queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        setupWebFromId(conflictId);
    }
});
    
function handleButtonClick(headerName: string) {
    _currentHeaderName = headerName;
    setupWebWithCurrentLayout();
}

function setupWebFromId(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip`;
    decompressBson(url).then((data) => {
        _rawData = data;
        conflictName = data.name;
        _allowedAllianceIds = [...data.coalitions[0].alliance_ids, ...data.coalitions[1].alliance_ids];
        setupWebWithCurrentLayout();
    });
}

function setupWebWithCurrentLayout() {
    setupWebWithLayout(_rawData as Conflict, _allowedAllianceIds, _currentHeaderName);
}

function setupWebWithLayout(data: Conflict, allowedAllianceIds: number[], header: string) {
    let allowedAllianceIdsSet: Set<number> = new Set(allowedAllianceIds);
    // let allowedAllianceIds: number[] = [...data.coalitions[0].alliance_ids, 11657];

    let allianceNameById: {[key: number]: string} = {}
    data.coalitions.forEach(coalition => {
        coalition.alliance_ids.forEach((id: number, index: number) => {
            allianceNameById[id] = coalition.alliance_names[index];
        });
    });
    console.log(data.war_web.headers);
    
    
    
    let allPalette: number[] = [];
    let labels: string[] = [];
    let allAllianceIds = [...data.coalitions[0].alliance_ids, ...data.coalitions[1].alliance_ids];
    for (let aaId of data.coalitions[0].alliance_ids) {
        allPalette.push(Palette.REDS);
        if (allowedAllianceIdsSet.has(aaId)) {
            labels.push(allianceNameById[aaId]);
        }
    }
    for (let aaId of data.coalitions[1].alliance_ids) {
        allPalette.push(Palette.BLUES);
        if (allowedAllianceIdsSet.has(aaId)) {
            labels.push(allianceNameById[aaId]);
        }
    }
    let allColors = generateColorsFromPalettes(allPalette);
    let colors = allColors.filter((value, index) => allowedAllianceIdsSet.has(allAllianceIds[index]));

    let headers = data.war_web.headers;
    let hI = headers.indexOf(header);

    let allMatrix = data.war_web.data[hI];
    let matrix: number[][] = [];

    for (let i = 0; i < allAllianceIds.length; i++) {
        let aaId = allAllianceIds[i];
        let row = allMatrix[i];
        if (allowedAllianceIdsSet.has(aaId)) {
            let rowSlice = row.filter((value, index) => allowedAllianceIdsSet.has(allAllianceIds[index]));
            matrix.push(rowSlice);
        }
    }
    matrix = matrix.map(row => row.length === 0 ? new Array(labels.length).fill(0) : row);
    matrix = matrix.map(row => row.map(value => (isNaN(value) || value < 0) ? 0 : value));
    setupChord(matrix, labels, colors);

}

enum Palette {
    REDS = 0,
    GREENS = 1,
    BLUES = 2,
    NEUTRALS = 3
}

type ColorPalette = {
    [key in Palette]: string[];
}

const colorPalettes: ColorPalette = {
    [Palette.REDS]: ['128,0,0', '128,128,0', '139,0,0', '139,69,19', '160,82,45', '165,42,42', '178,34,34', '184,134,11', '188,143,143', '189,183,107', '199,21,133', '205,133,63', '205,92,92', '210,105,30', '210,180,140', '218,112,214', '218,165,32', '219,112,147', '220,20,60', '222,184,135', '233,150,122', '238,232,170', '240,128,128', '240,230,140', '244,164,96', '245,222,179', '245,245,220', '250,128,114', '250,235,215', '250,240,230', '250,250,210', '253,245,230', '255,0,0', '255,105,180', '255,127,80', '255,140,0', '255,160,122', '255,165,0', '255,182,193', '255,192,203', '255,20,147', '255,215,0', '255,218,185', '255,222,173', '255,228,181', '255,228,196', '255,228,225', '255,235,205', '255,239,213', '255,240,245', '255,245,238', '255,248,220', '255,250,205', '255,250,240', '255,250,250', '255,255,0', '255,255,224', '255,255,240', '255,69,0', '255,99,71'],
    [Palette.GREENS]: ['0,100,0', '0,128,0', '0,250,154', '0,255,0', '0,255,127', '102,205,170', '107,142,35', '124,252,0', '127,255,0', '127,255,212', '143,188,143', '144,238,144', '152,251,152', '154,205,50', '173,255,47', '240,255,240', '245,255,250', '32,178,170', '34,139,34', '46,139,87', '50,205,50', '60,179,113', '64,224,208', '72,209,204', '85,107,47'],
    [Palette.BLUES]: ['0,0,128', '0,0,139', '0,0,205', '0,0,255', '0,128,128', '0,139,139', '0,191,255', '0,206,209', '0,255,255', '0,255,255', '100,149,237', '106,90,205', '112,128,144', '119,136,153', '123,104,238', '135,206,235', '135,206,250', '138,43,226', '147,112,219', '148,0,211', '153,50,204', '173,216,230', '175,238,238', '176,196,222', '176,224,230', '186,85,211', '224,255,255', '230,230,250', '240,248,255', '240,255,255', '248,248,255', '25,25,112', '30,144,255', '47,79,79', '65,105,225', '70,130,180', '72,61,139', '75,0,130', '95,158,160'],
    [Palette.NEUTRALS]: ['0,0,0', '105,105,105', '128,0,128', '128,128,128', '139,0,139', '169,169,169', '192,192,192', '211,211,211', '216,191,216', '220,220,220', '221,160,221', '238,130,238', '245,245,245', '255,0,255', '255,0,255', '255,255,255']
}


function darkenColor(color: string, percentage: number): string {
    let rgbValues = color.match(/\d+/g);
    if (!rgbValues) {
        throw new Error('Invalid color format');
    }

    let [r, g, b] = rgbValues.map(Number);

    r = Math.floor(r * (1 - percentage / 100));
    g = Math.floor(g * (1 - percentage / 100));
    b = Math.floor(b * (1 - percentage / 100));

    return `rgb(${r}, ${g}, ${b})`;
}
function convertToRGB(colors: string[]): string[] {
    return colors.map(color => {
        let [r, g, b] = color.split(',');
        return `rgb(${r}, ${g}, ${b})`;
    });
}
function generateColors(n: number, palette: Palette) {
    let colors = [];
    let colorScale = d3.scaleSequential().domain([0, n]).interpolator(d3.interpolateRgbBasisClosed(convertToRGB(colorPalettes[palette])));
    for (let i = 0; i < n; i++) {
        colors.push(colorScale(i));
    }
    return colors;
}

function generateColorsFromPalettes(palettes: Palette[]) {
    let countByPalette: number[] = new Array(Object.keys(Palette).length).fill(0);
    for (let i = 0; i < palettes.length; i++) {
        countByPalette[palettes[i]]++;
    }
    let colorsByPalette: string[][] = new Array(countByPalette.length).fill([]);
    for (let i = 0; i < palettes.length; i++) {
        let palette = palettes[i];
        let count = countByPalette[palette];
        if (count > 0) {
            let paletteColors = generateColors(count, palette);
            colorsByPalette[palette] = paletteColors;
        }
    }
    countByPalette.fill(0);
    let colors = [];
    for (let i = 0; i < palettes.length; i++) {
        let palette = palettes[i];
        let j = countByPalette[palette]++;
        let paletteColors = colorsByPalette[palette];
        colors.push(paletteColors[j]);
    }
    return colors;
}

function setupChord(matrix: number[][], labels: string[], colors: string[]) {
    console.log("LABELS " + labels + " | " + labels.length);
    console.log("Color: " + JSON.stringify(colors) + " | " + colors.length);
    console.log(matrix);

    // clear my_dataviz
    d3.select("#my_dataviz").selectAll("*").remove();

        // create the svg area
    const svg = d3.select("#my_dataviz")
    .append("svg")
        .classed("svg-content-responsive", true)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", "0 0 600 600")
    .append("g")
        .attr("transform", "translate(300,300)")
        .classed("rect", true)
    .attr("width", 440)
    .attr("height", 440);

    // give this matrix to d3.chord(): it will calculates all the info we need to draw arc and ribbon
    const res = d3.chordDirected()
        .padAngle(0.01)     // padding between entities (black arc)
        .sortSubgroups(d3.descending)
        .sortChords(d3.descending)
        (matrix)

    // add the groups on the inner part of the circle
    svg
    .datum(res)
    .append("g")
    .classed("rect", true)
    .attr("width", 440)
    .attr("height", 440)
    .selectAll("g")
    .data(d => d.groups)
    .join("g")
    .append("path")
    .style("fill", (d,i) => colors[i])
        .style("stroke", "#222")
        .style("stroke-width", "0.25px")
        .attr("d", d3.arc()
        .innerRadius(210)
        .outerRadius(220)
        )

    // Add the links between groups
    let paths = svg
    .datum(res)
    .append("g")
    .selectAll("path")
    .data(d => d)
    .join("path")
        .attr("d", d3.ribbonArrow()
        .radius(208)
        )
        .attr("fill-opacity", 0.75)
        .attr("stroke-opacity", 0.5)
        // .style("mix-blend-mode", "multiply")
        .style("fill", d => colors[d.source.index])
        .style("stroke",d => darkenColor(colors[d.source.index], 25))
        .style("stroke-width", "0.5px");

    let groups = svg
    .datum(res)
    .append("g")
    .selectAll("g")
    .data(d => d.groups)
    .join("g");

    groups.append("path")
    .style("fill", (d,i) => colors[i])
    .style("stroke", "#222")
    .style("stroke-width", "0.25px")
    .attr("d", d3.arc()
        .innerRadius(210)
        .outerRadius(220)
    );

    groups.append("text")
    .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
    .attr("dy", ".35em")
    .attr("transform", d => `
        rotate(${(d.angle * 180 / Math.PI - 90)})
        translate(${220 + 1})
        ${d.angle > Math.PI ? "rotate(180)" : ""}
    `)
    .attr("text-anchor", d => d.angle > Math.PI ? "end" : null)
    .style("font-size", "9px")  // Adjust the font size here
    .text((d, i) => labels[i]);


    // Add mouseover and mouseout events to the groups
    groups.on("mouseover", function(event, d) {
        // Get the index of the current group
        let currentIndex = d.index;

        // Add the 'd-none' class to the paths not for the current group
        paths.classed("d-none", p => p.source.index !== currentIndex && p.target.index !== currentIndex);
    })
    .on("mouseout", function(event, d) {
        // Remove the 'd-none' class from all paths
        paths.classed("d-none", false);
    });
}

// function sortColors(colors: string[]): [string[], string[], string[], string[]] {
//     let reds: string[] = [], greens: string[] = [], blues: string[] = [], neutrals: string[] = [];

//     for (let color of colors) {
//         let [r, g, b] = color.split(',').map(Number);

//         if (r >= g && r > b) {
//             reds.push(color);
//         } else if (g > r && g > b) {
//             greens.push(color);
//         } else if (b > r && b >= g) {
//             blues.push(color);
//         } else {
//             neutrals.push(color);
//         }
//     }

//     return [reds, greens, blues, neutrals]
// }
    
</script>
<svelte:head>
    <script src="https://d3js.org/d3.v6.js"></script>
</svelte:head>
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
                <i class="bi bi-bar-chart-line-fill"></i>&nbsp;Tiering
            </a>
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
            <button class="nav-link ps-0 pe-0 btn btn-outline-light rounded-bottom-0 fw-bold bg-light">
                <i class="bi bi-share-fill"></i>&nbsp;War Web
            </button>
        </li>
    </ul>
    <div class="bg-light p-1 mb-1 border-bottom">
    {#if _rawData}
        {#each _rawData.war_web.headers as header (header)}
        <button class="btn btn-sm m-1 mb-0 btn-secondary btn-outline-info opacity-75 fw-bold" class:active={_currentHeaderName === header} on:click={() => handleButtonClick(header)}>{header}</button>
        {/each}
    {/if}
    </div>
    <pre>
        TODO: Buttons for alliances
        generated headers (i.e. net damage/counts)
        Fix data ranges for some types
        Add tooltip with values
        Save/load from query string
    </pre>
    <div class="container bg-light border">
        <div id="my_dataviz"></div>
        <!-- <div id="chartId"></div> -->
    </div>
</div>
<style>
.svg-container {
  display: inline-block;
  position: relative;
  width: 100%;
  padding-bottom: 100%; /* aspect ratio */
  vertical-align: top;
  overflow: hidden;
}
.svg-content-responsive {
  display: inline-block;
  position: absolute;
  top: 10px;
  left: 0;
}
svg .rect {
  fill: gold;
  stroke: steelblue;
  stroke-width: 5px;
}
</style>