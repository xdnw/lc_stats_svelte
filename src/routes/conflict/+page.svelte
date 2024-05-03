<script lang=ts>
/**
 * This page is for viewing a single conflict
*/
import Navbar from '../../components/Navbar.svelte'
import Sidebar from '../../components/Sidebar.svelte'
import Footer from '../../components/Footer.svelte'
import { onMount } from 'svelte';
import { addFormatters, decompressBson, formatDate, modalWithCloseButton, setupContainer, type Conflict, setQueryParam, trimHeader, type TableData, modalStrWithCloseButton, downloadCells, downloadTableData, type ExportType, ExportTypes } from '$lib';
import { config } from '../+layout';
// Layout tabs
enum Layout {
    COALITION,
    ALLIANCE,
    NATION,
}

// Set after page load
let conflictName = "";
let conflictId = -1;

// see loadLayout for the type
let _rawData: any = null;
// The columns for the `attacks` layout button
let breakdownCols = ["GROUND_TANKS_MUNITIONS_USED_UNNECESSARY","DOUBLE_FORTIFY","GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY","GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY_INACTIVE","GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR_INACTIVE","GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR","AIRSTRIKE_SOLDIERS_NONE","AIRSTRIKE_SOLDIERS_SHOULD_USE_GROUND","AIRSTRIKE_TANKS_NONE","AIRSTRIKE_SHIP_NONE","AIRSTRIKE_INACTIVE_NO_GROUND","AIRSTRIKE_INACTIVE_NO_SHIP","AIRSTRIKE_FAILED_NOT_DOGFIGHT","AIRSTRIKE_AIRCRAFT_NONE","AIRSTRIKE_AIRCRAFT_NONE_INACTIVE","AIRSTRIKE_AIRCRAFT_LOW","AIRSTRIKE_INFRA","AIRSTRIKE_MONEY","NAVAL_MAX_VS_NONE"].map(col => `off:${col.toLowerCase().replaceAll("_", " ")} attacks`);
// The layouts buttons for the conflict table
let layouts:{[key: string]: {sort: string, columns: string[]}} = {
    Summary: {
        sort: "off:wars", 
        columns: ["name","net:damage","off:wars","def:wars","dealt:damage","loss:damage"]
    },
    Dealt: {
        sort: "dealt:damage", 
        columns:["name", "dealt:infra", "dealt:~$soldier", "dealt:~$tank", "dealt:~$aircraft", "dealt:~$ship", "dealt:~$unit", "dealt:~$consume", "dealt:~$loot", "dealt:damage"]
    },
    Received: {
        sort: "loss:damage", 
        columns:["name", "loss:infra", "loss:~$soldier", "loss:~$tank", "loss:~$aircraft", "loss:~$ship", "loss:~$unit", "loss:~$consume", "loss:~$loot", "loss:damage"]
    },
    Units: {
        sort: "dealt:~$unit",
        columns: ["name", "dealt:soldier", "dealt:tank", "dealt:aircraft", "dealt:ship", "dealt:~$unit", "loss:soldier", "loss:tank", "loss:aircraft", "loss:ship", "loss:~$unit"]
    },
    Consumption: {
        sort: "name",
        columns: ["name", "loss:~$building", "loss:gasoline", "loss:munitions", "loss:steel", "loss:aluminum", "loss:consume gas", "loss:consume mun"]
    },
    Attacks: {
        sort: "off:attacks",
        columns: ["name", "off:attacks", ...breakdownCols]
    }
}

// Variable for the current layout
// Set by the layout buttons as well as on page load (loadLayoutFromQuery)
let _layoutData = {
    layout: Layout.COALITION,
    columns: layouts.Summary.columns,
    sort: layouts.Summary.sort,
    order: "desc"
};

let _currentRowData: TableData;

/**
 * Big function for loading the conflict table for a provided layout
 * This will clear and recreate the table
 * Called on page load from (loadLayoutFromQuery)
 * Tab buttons edit the layout global var then call this (loadCurrentLayout)
 * @param _rawData The S3 bucket json data
 * @param type The Layout type (coalition, alliance, nation)
 * @param layout The columns to display
 * @param sortBy The column to sort by
 * @param sortDir The direction to sort by (asc, desc)
 */
function loadLayout(_rawData: Conflict, type: Layout, layout: string[], sortBy: string, sortDir: string) {
    conflictName = _rawData.name;
    let coalitions = _rawData.coalitions;
    let damage_header = _rawData.damage_header;
    let header_types = _rawData.header_type;

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: {[key: string]: number[]} = {};
    let row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null = null;

    // Alliance ids (set)
    let col1: Set<number> = new Set<number>(coalitions[0].alliance_ids);
    let col2: Set<number> = new Set<number>(coalitions[1].alliance_ids);

        // Set the row format based on the layout
    switch (type) {
        case Layout.COALITION:
        row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let name = data['name'];
                if (name == 0) {
                    row.classList.add('bg-danger-subtle');
                } else if (name == 1) {
                    row.classList.add('bg-info-subtle');
                }
            }
            break;
        case Layout.ALLIANCE:
            row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let id = data['name'][1];
                if (col1.has(id)) {
                    row.classList.add('bg-danger-subtle');
                } else if (col2.has(id)) {
                    row.classList.add('bg-info-subtle');
                }
            }
            break;
        case Layout.NATION:
            row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let id = data['name'][2];
                if (col1.has(id)) {
                    row.classList.add('bg-danger-subtle');
                } else if (col2.has(id)) {
                    row.classList.add('bg-info-subtle');
                }
            }
            break;
    }  

    // Add name column and
    // Split the header names into columns (e.g. net damage can be calculated from dealt and received)
    { // columns
        columns.push("name");
        for (let i = 0; i < damage_header.length; i++) {
            let header = trimHeader(damage_header[i]);
            let type = header_types[i];
            if (type == 0) {
                columns.push("loss:" + header);
                columns.push("dealt:" + header.replace("_loss", "").replace("loss_", ""));
                columns.push("net:" + header.replace("_loss", "").replace("loss_", ""));
            } else if (type == 1) {
                columns.push("off:" + header);
                columns.push("def:" + header);
                columns.push("both:" + header);
            }
        }
        searchable.push(0);
    }
    let sort: [number, string] = [columns.indexOf(sortBy), sortDir];
    // Set cell formatting and visible columns
    cell_format["formatNumber"] = [];
    cell_format["formatMoney"] = [];
    for (let i = 0; i < columns.length; i++) {
        if (layout.includes(columns[i])) {
            visible.push(i);
        }
        if (i > 0) {
            if (columns[i].includes("~") || columns[i].includes("damage") || (columns[i].includes("infra") && !columns[i].includes("attacks"))) {
                cell_format["formatMoney"].push(i);
            } else {
                cell_format["formatNumber"].push(i);
            }
        }
    }

    // Helper function for adding the data for the columns into the rows
    let addStats2Row = (row: any[], damageTaken: any, damageDealt: any) => {
        for (let i = 0; i < damageTaken.length; i++) {
            let damageTakenStat = damageTaken[i];
            let damageDealtStat = damageDealt[i];

            let type = header_types[i];
            let total;
            if (type == 0) {
                total = damageDealtStat - damageTakenStat;
            } else {
                total = damageDealtStat + damageTakenStat;
            }
            // the three stats for each damage column
            row.push(damageTakenStat);
            row.push(damageDealtStat);
            row.push(total);
        }
    };

    // Helper function for adding a row to the `rows` 2d array
    let addRow = (colEntry: any, index: number) => {
        let colName = colEntry.name;
        let alliance_ids = colEntry.alliance_ids;
        let alliance_names = colEntry.alliance_names;
        let nation_ids = colEntry.nation_ids;
        let nation_names = colEntry.nation_names;
        let nation_aas = colEntry.nation_aa;
        let damage = colEntry.damage;
        // Handle the different layout types
        switch (type) {
            case Layout.COALITION:
                // Use formatCol (coalition) for the name (index = 0)
                cell_format["formatCol"] = [0];
                let row = [index];
                addStats2Row(row, damage[0], damage[1]);
                rows.push(row);
                break;
            case Layout.ALLIANCE: {
                // use formatAA (alliance) for the name (index = 0)
                cell_format["formatAA"] = [0];
                let o = 2;
                for (let i = 0; i < alliance_ids.length; i++) {
                    let row = [];
                    let alliance_id = alliance_ids[i];
                    let alliance_name = alliance_names[i];
                    row.push([alliance_name,alliance_id]);
                    addStats2Row(row, damage[i*2+o], damage[i*2+o+1]);
                    rows.push(row);
                }
                break;
            }
            case Layout.NATION: {
                // use formatNation for the name (index = 0)
                cell_format["formatNation"] = [0];
                let o = 2 + alliance_ids.length * 2;
                for (let i = 0; i < nation_ids.length; i++) {
                    let row = [];
                    let nation_id = nation_ids[i];
                    let nation_name = nation_names[i];
                    let nation_aa = nation_aas[i];
                    row.push([nation_name,nation_id,nation_aa]);
                    addStats2Row(row, damage[i*2+o], damage[i*2+o+1]);
                    rows.push(row);
                }
                break;
            }
        }
    }
    // Add the rows to the `rows` 2d array - calls the above helper functions
    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        addRow(colEntry, i);
    }
    // Setup the table
    _currentRowData = {
        columns: columns,
        data: rows,
        visible: visible,
        searchable: searchable,
        cell_format: cell_format,
        row_format: row_format,
        sort: sort
    }
    let container = document.getElementById("conflict-table-1");
    setupContainer(container as HTMLElement, _currentRowData);
}

// Set the current layout (called on page load)
function loadLayoutFromQuery(query: URLSearchParams) {
    let layout = query.get('layout');
    if (layout) {
        if (layout === "coalition") {
            _layoutData.layout = Layout.COALITION;
        } else if (layout === "alliance" || layout === "1") {
            _layoutData.layout = Layout.ALLIANCE;
        } else if (layout === "nation" || layout === "2") {
            _layoutData.layout = Layout.NATION;
        }
    }
    let sort = query.get('sort');
    if (sort) {
        _layoutData.sort = sort;
    }
    let order = query.get('order');
    if (order) {
        _layoutData.order = order;
    }
    let columns = query.get('columns');
    if (columns) {
        // split by .
        _layoutData.columns = columns.split(".");
    }
}

// Create (or recreate) the table based on the current layout (_layoutData)
function loadCurrentLayout() {
    loadLayout(_rawData, _layoutData.layout, _layoutData.columns, _layoutData.sort, _layoutData.order);
}

// Load the conflict data from the S3 bucket
// setColNames sets the `namesByAllianceId` global var - which is used for formatting the alliance names in the coalition modal (A popup when you click the coalition button in the table)
// Load the current layout (which will create the table)
// If there are posts, load the posts into the timeline
function setupConflictTables(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${config.version.conflict_data}`;
    decompressBson(url).then((data) => {
        _rawData = data;
        setColNames(_rawData.coalitions[0].alliance_ids, _rawData.coalitions[0].alliance_names);
        setColNames(_rawData.coalitions[1].alliance_ids, _rawData.coalitions[1].alliance_names);
        loadCurrentLayout();
        if (_rawData.posts && Object.keys(_rawData.posts).length) {
            loadPosts(_rawData.posts);
        }
    });
}

// Global var for the alliance names (used for formatting the alliance names in the coalition modal)
let namesByAllianceId: {[key: number]: string} = {};
function setColNames(ids: number[], names: string[]) {
    for (let i = 0; i < ids.length; i++) {
        namesByAllianceId[ids[i]] = names[i];
    }
}

// Runs on component load (svelte) i.e. page load
// - Sets the format functions
// - Read query string into layout (loadLayoutFromQuery)
// - Create the conflict tables (setupConflictTables)
onMount(() => {
    // Add the cell format functions to the window object
    addFormatters();
    
    // Add the showNames function to the window object (which shows a popup of the alliances in a coalition)
    (window as any).showNames = (coalitionName: string, index: number) => {
        let col = _rawData.coalitions[index];
        let alliance_ids: number[] = col.alliance_ids;
        var modalTitle = "Coalition " + (index + 1) + ": " + coalitionName;
        let ul = document.createElement("ul");
        for (let i = 0; i < alliance_ids.length; i++) {
            let alliance_id = alliance_ids[i];
            let alliance_name = col.alliance_names[i];
            if (alliance_name == undefined) alliance_name = "N/A";
            let a = document.createElement("a");
            a.setAttribute("href", "https://politicsandwar.com/alliance/id=" + alliance_id);
            a.textContent = alliance_name;
            let li = document.createElement("li");
            li.appendChild(a);
            ul.appendChild(li);
        }
        let idsStr = alliance_ids.join(", ");
        let modalBody = document.createElement("div");
        modalBody.textContent = idsStr;
        modalBody.appendChild(ul);
        modalWithCloseButton(modalTitle, modalBody);
    }

    // Cell format function for a nation
    (window as any).formatNation = (data: any, type: any, row: any, meta: any) => {
        let aaId = data[2] as number;
        let aaName = namesByAllianceId[aaId];
        return '<a href="https://politicsandwar.com/alliance/id=' + data[2] + '">' + aaName + '</a> | <a href="https://politicsandwar.com/nation/id=' + data[1] + '">'  + (data[0]?data[0]:data[1]) + '</a>';
    }

    // Cell format function for a nation
    (window as any).formatAA = (data: any, type: any, row: any, meta: any) => {
        return '<a href="https://politicsandwar.com/alliance/id=' + data[1] + '">' + data[0] + '</a>';
    }

    // Cell format function for a coalition
    (window as any).formatCol = (data: any, type: any, row: any, meta: any) => {
        let index = row.name;
        let button = document.createElement("button");
        button.setAttribute("type", "button");
        button.setAttribute("class", "ms-1 btn btn-info btn-sm fw-bold opacity-75");
        button.setAttribute("onclick", `showNames('${_rawData.coalitions[index].name}',${index})`);
        button.textContent = _rawData.coalitions[index].name;
        return button.outerHTML;
    }

    (window as any).download = function download(useClipboard: boolean, type: string) {
        downloadTableData(_currentRowData, useClipboard, ExportTypes[type as keyof typeof ExportTypes]);
    }

    // Read the query string to get the conflict id as well as the table layout (if present)
    let queryParams = new URLSearchParams(window.location.search);
    loadLayoutFromQuery(queryParams)
    const id = queryParams.get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        // Create the table for the conflict id
        setupConflictTables(conflictId);
    }
});

// Handle the layout button clicks
function handleClick(event: MouseEvent): void {
    _layoutData.layout = parseInt((event.target as HTMLButtonElement).getAttribute("data-bs-layout") as string);
    setQueryParam('layout', _layoutData.layout);
    setQueryParam('sort', null);
    setQueryParam('columns', null);
    loadCurrentLayout();
}
// Load the forum post metadata (from the s3 json) into the timeline (vis.js)
// key = post name, value = [post id, post url text, timestamp]
function loadPosts(posts: {[key: string]: [number, string, number]}) {
    // DOM element where the Timeline will be attached
    var container = document.getElementById('visualization');

    // Create a DataSet (allows two way data-binding)
    var items = new vis.DataSet();

    // Loop through the posts and add them to the DataSet
    for (let key in posts) {
        let post = posts[key];
        let id = post[0];
        let url = "https://forum.politicsandwar.com/index.php?/topic/" + id + '-' + post[1];
        let timestamp = post[2];

        // Convert the timestamp to a Date object
        let date = new Date(timestamp);

        // Add the post to the DataSet
        items.add({id: id, content: `<a href="${url}" target="_blank">${key}</a>`, start: date});
    }

    let start = _rawData.start;
    let end = _rawData.end;
    if (end === -1) end = Date.now();
    var options = {
        // Set the initial start-end range to display in the timeline
        start: start,
        end: end,
        // Height of timeline canvas
        height: '75vh',
        // Width of timeline canvas
        width: '100%',
        // clickToUse: true,
        zoomKey: 'ctrlKey',
        // Which side to put the dates
        orientation: 'top',
        // Enable vertical scrolling
        verticalScroll: true,
        // zoomable: false,
    };

    // Create a Timeline
    var timeline = new vis.Timeline(container, items, options);
    // Add red bar at the start and end dates
    timeline.addCustomTime(start, 't1');
    timeline.addCustomTime(end, 't2');
}

</script>    
<svelte:head>
	<title>Conflict {conflictName}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.css"/>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container-fluid m-0 p-0" style="min-height: calc(100vh - 203px);">
    <h1>
        <a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict: {conflictName}
        <!-- Link the wiki (if it exists) -->
        {#if _rawData?.wiki}
            <a class="btn btn btn-info opacity-75 fw-bold" href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}">Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"></i></a>
        {/if}
    </h1>
    <hr class="mt-1">
    <div class="row p-0 m-0">
        <button class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold {_layoutData.layout == Layout.COALITION ? "bg-light-subtle border border-bottom-0" : "border-0 border-bottom"}" id="profile-pill" data-bs-layout={Layout.COALITION} on:click={handleClick}>
            ◑&nbsp;Coalition
        </button>
        <button class="col-2 btn ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold {_layoutData.layout == Layout.ALLIANCE ? "bg-light-subtle border border-bottom-0" : "border-0 border-bottom"}" id="billing-pill" data-bs-layout={Layout.ALLIANCE} on:click={handleClick}>
            𖣯&nbsp;Alliance
        </button>
        <button class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold {_layoutData.layout == Layout.NATION ? "bg-light-subtle border border-bottom-0" : "border-0 border-bottom"}" id="billing-pill" data-bs-layout={Layout.NATION} on:click={handleClick}>
            ♟&nbsp;Nation
        </button>
        <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="tiering/?id={conflictId}">
            📊&nbsp;Tier/Time
        </a>
        <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="bubble/?id={conflictId}">
            📈&nbsp;Bubble/Time
        </a>
        <a class="col-2 ps-0 pe-0 btn btn-outline-secondary rounded-bottom-0 fw-bold border-0 border-bottom" href="chord/?id={conflictId}">
            🌐&nbsp;Web
        </a>
    </div>
    <ul class="nav fw-bold nav-pills nav-fill m-0 p-0 bg-light-subtle border-bottom border-3 p-1">
    <li>
        Layout Picker:
    </li>
    {#each Object.keys(layouts) as key}
        <li>
        <button class="btn btn-sm ms-1 btn-secondary btn-outline-info opacity-75 fw-bold {_layoutData.columns === layouts[key].columns ? "active" : ""}" on:click={() => {
            // Set the layout variable and recreate the table
            _layoutData.columns = layouts[key].columns;
            _layoutData.sort = layouts[key].sort;
            setQueryParam('sort', _layoutData.sort);
            setQueryParam('columns', _layoutData.columns.join("."));
            loadCurrentLayout();
        }}>{key}</button>
        </li>
    {/each}
    </ul>
    <div class="p-1" id="conflict-table-1"></div>
    <!-- If coalition layout, then display the CB and Status -->
    {#if _layoutData.layout == Layout.COALITION}
    <hr>
    <div class="row m-0">
        {#if _rawData?.cb}
        <div class="col-md-6 col-sm-12">
            <div class="col-md-12 ms-2 p-2 rounded border">
            <h3>Casus Belli</h3>
            <pre>
                {_rawData?.cb}
            </pre>
            </div>
        </div>
        {/if}
        {#if _rawData?.status}
        <div class="col-md-6 col-sm-12">
            <div class="col-md-12 ms-2 p-2 rounded border">
            <h3>Status</h3>
            <pre>
                {_rawData?.status}
            </pre>
            </div>
        </div>
        {/if}
    </div>
    {/if}
    <hr>
    <!-- The date range title -->
    <h4>{formatDate(_rawData?.start)} - {formatDate(_rawData?.end)}</h4>
    <!-- Empty div used for the timeline (vis.js) -->
    <div class="m-0" id="visualization"></div>
</div>
<Footer />