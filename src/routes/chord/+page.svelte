<script lang="ts">
  import { decompressBson, type Conflict, rafDelay, setQueryParam, generateColorsFromPalettes, Palette, darkenColor } from "$lib";
  import { onMount } from "svelte";
  import Navbar from "../../components/Navbar.svelte";
  import Sidebar from "../../components/Sidebar.svelte";
  import Footer from "../../components/Footer.svelte";
  import * as d3 from 'd3';
  import { config } from "../+layout";

let conflictName = "";
let conflictId = -1;

let _rawData: Conflict | null = null;
let _allowedAllianceIds: Set<number> = new Set();
let _currentHeaderName: string = "wars";

onMount(() => {
    let queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        setupWebFromId(conflictId, queryParams);
    }
});

function setupWebFromId(conflictId: number, queryParams: URLSearchParams) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${config.version.conflict_data}`;
    decompressBson(url).then((data) => {
        _rawData = data;
        console.log(data);
        conflictName = data.name;
        _allowedAllianceIds = new Set([...data.coalitions[0].alliance_ids, ...data.coalitions[1].alliance_ids]);
        
        let header = queryParams.get('header');
        if (header && _rawData?.war_web.headers.includes(header)) {
            _currentHeaderName = header;
        }
        let idStr = queryParams.get('ids');
        if (idStr) {
            let ids = idStr.split(".").map(id => +id);
            _allowedAllianceIds = new Set(ids);
            if (!_rawData?.coalitions[0].alliance_ids.some(id => _allowedAllianceIds.has(id)) || !_rawData?.coalitions[1].alliance_ids.some(id => _allowedAllianceIds.has(id))) {
                _allowedAllianceIds = new Set([...data.coalitions[0].alliance_ids, ...data.coalitions[1].alliance_ids]);
            }
        }
        setupWebWithCurrentLayout();
    });
}
    
function setLayoutHeader(headerName: string) {
    _currentHeaderName = headerName;
    setQueryParam('header', headerName);
    setupWebWithCurrentLayout();
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
    setQueryParam('ids', Array.from(_allowedAllianceIds).join('.'));
    setupWebWithCurrentLayout();
}

function setupWebWithCurrentLayout() {
    setupWebWithLayout(_rawData as Conflict, _allowedAllianceIds, _currentHeaderName);
}

function setupWebWithLayout(data: Conflict, allowedAllianceIdsSet: Set<number>, header: string) {
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
    let alliance_ids = allAllianceIds.filter(id => allowedAllianceIdsSet.has(id));
    let coalition_ids = [];
    for (let aaId of data.coalitions[0].alliance_ids) {
        allPalette.push(Palette.REDS);
        if (allowedAllianceIdsSet.has(aaId)) {
            labels.push(allianceNameById[aaId]);
            coalition_ids.push(0);
        }
    }
    for (let aaId of data.coalitions[1].alliance_ids) {
        allPalette.push(Palette.BLUES);
        if (allowedAllianceIdsSet.has(aaId)) {
            labels.push(allianceNameById[aaId]);
            coalition_ids.push(1);
        }
    }
    let allColors = generateColorsFromPalettes(d3, allPalette);
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
    setupChord(matrix, labels, colors, alliance_ids, coalition_ids);

}


function setupChord(matrix: number[][], alliance_names: string[], colors: string[], alliance_ids: number[], coalition_ids: number[]) {
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
        .sortSubgroups(d3.ascending)
        .sortChords(d3.ascending)
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
    .text((d, i) => alliance_names[i]);

    let lastShowIndex: number = -1;
    let showIndex: number = -1;
    if (alliance_ids.filter((id, index) => coalition_ids[index] === 0).length === 1) {
        displayTable(coalition_ids.indexOf(0));
    } else if (alliance_ids.filter((id, index) => coalition_ids[index] === 1).length === 1) {
        displayTable(coalition_ids.indexOf(1));
    }

    function displayTable(showIndex: number) {
        let toolTip = document.getElementById("myTooltip") as HTMLElement;
        // where value is not 0 (of either matrix[showIndex][index] or matrix[index][showIndex])
        let allowedIndexes = new Set(matrix[showIndex].map((value, index) => value !== 0 || matrix[index][showIndex] !== 0 ? index : -1).filter(index => index !== -1));
        let labels = alliance_names.filter((value, index) => allowedIndexes.has(index));
        let colorSlice = colors.filter((value, index) => allowedIndexes.has(index));
        let data = matrix[showIndex].filter((value, index) => allowedIndexes.has(index));
        let secondArray = matrix.map((row, index) => allowedIndexes.has(index) ? row[showIndex] : null).filter(item => item !== null);
        // sort them
        let indices = Array.from({length: data.length}, (_, i) => i);
        indices.sort((a, b) => data[b] - data[a]);
        // Use the sorted indices to sort the labels, colorSlice, data, and secondArray arrays
        labels = indices.map(i => labels[i]);
        colorSlice = indices.map(i => colorSlice[i]);
        data = indices.map(i => data[i]);
        secondArray = indices.map(i => secondArray[i]);

        let table = `<h5>${alliance_names[showIndex]} - ${_currentHeaderName}</h5><table class='table fw-bold w-auto'><tr><th></th><th>To</th><th>From</th><th>Net</th></tr>`;
        labels.forEach((label, index) => {
            table += `<tr><td style='background-color:${darkenColor(colorSlice[index],50)};color:white'>${label}</td>`;
            table += `<td>${data[index]}</td>`;
            table += `<td>${secondArray[index]}</td>`;
            table += `<td>${data[index] - secondArray[index]}</td></tr>`;
        });
        table += "</table>";
        toolTip.innerHTML = table;
    }

    function runShowIndex() {
        if (showIndex !== lastShowIndex) {
            if (showIndex == -1) {
                paths.classed("d-none", false);
            } else {
                paths.filter(p => p.source.index !== showIndex && p.target.index !== showIndex)
                    .classed("d-none", true);
                paths.filter(p => p.source.index === showIndex || p.target.index === showIndex)
                    .classed("d-none", false);
                displayTable(showIndex);
            }
            lastShowIndex = showIndex;
        }
    }
    groups.on("click", function(event: MouseEvent, d: any) {
        showIndex = -1;
        lastShowIndex = -1;
        setLayoutAlliance(coalition_ids[d.index], alliance_ids[d.index])
    });
    // Attach the tooltip to the groups
    groups.on("mouseover", function(event: MouseEvent, d: any) {
        showIndex = d.index;
        requestAnimationFrame(rafDelay(100, runShowIndex));
    })
    .on("mouseout", function(event: MouseEvent, d: any) {
        showIndex = -1;
        requestAnimationFrame(rafDelay(100, runShowIndex));
    }).on("mouseover touchstart", function(event: MouseEvent, d: any) {
        showIndex = d.index;
        requestAnimationFrame(rafDelay(100, runShowIndex));
    }).on("mouseout touchend", function(event: MouseEvent | TouchEvent, d: any) {
        showIndex = -1;
        requestAnimationFrame(rafDelay(100, runShowIndex));
    });
    }

</script>
<svelte:head>
    <!-- <script src="https://d3js.org/d3.v6.js"></script> -->
</svelte:head>
<Navbar />
<Sidebar />
<div class="container-fluid m-0 p-0" style="min-height: calc(100vh - 203px);">
    <h1>
        <a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict: {conflictName}
        {#if _rawData?.wiki}
            <a class="btn btn btn-info opacity-75 fw-bold" href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}">Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"></i></a>
        {/if}
    </h1>
    <hr class="mt-1">
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
        <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="tiering/?id={conflictId}">
            📊&nbsp;Tier/Time
        </a>
        <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="bubble/?id={conflictId}">
            📈&nbsp;Bubble/Time
        </a>
        <button class="col-2 ps-0 pe-0 btn border rounded-bottom-0 fw-bold bg-light-subtle border-bottom-0">
            🌐&nbsp;Web
        </button>
    </div>
    <div class="bg-light-subtle p-1 fw-bold border-bottom border-3 pb-0" style="min-height: 119px;">
    {#if _rawData}
        <span class="fw-bold">Layout Picker:</span>
        {#each _rawData.war_web.headers as header (header)}
        <button class="btn btn-sm ms-1 mb-1 btn-secondary btn-outline-info opacity-75 fw-bold" class:active={_currentHeaderName === header} on:click={() => setLayoutHeader(header)}>{header}</button>
        {/each}
        <hr class="m-1">
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
    <div class="container bg-light-subtle border">
        <div id="my_dataviz"></div>
        <div class="mt-1" id="myTooltip" style="min-height:15em"></div>
    </div>
    <br>
</div>
<Footer />