<script lang=ts>
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
    import { decompressJson, modalWithCloseButton, setupContainer } from '$lib';

let idsByCoalitionName: {[key: string]: number[]} = {};
let namesByAllianceId: {[key: number]: string} = {};

let conflictName = "";

enum Layout {
    COALITION,
    ALLIANCE,
    NATION
}

function loadLayout(_rawData: {
    name: string,
    coalitions: {
        name: string,
        alliance_ids: number[],
        alliance_names: string[],
        nation_aa: number[],
        nation_ids: number[],
        nation_names: string[],
        counts: [number[], number[]],
        damage: [number[], number[]]
    }[],
    counts_header: string[],
    damage_header: string[],
}, type: Layout, layout: string[], sortBy: string, sortDir: string) {
    conflictName = _rawData["name"];
    let coalitions = _rawData["coalitions"];
    let counts_header = _rawData["counts_header"];
    let damage_header = _rawData["damage_header"];

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: {[key: string]: number[]} = {};
    let row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null = null;

    switch (type) {
        case Layout.COALITION:
        row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let name = data['name'][0];
                if (coalitions[0].name === name) {
                    row.classList.add('bg-light');
                } else if (coalitions[1].name === name) {
                    // row.classList.add('bg-secondary');
                }
            }
            break;
        case Layout.ALLIANCE:
            let col1: Set<number> = new Set<number>(coalitions[0].alliance_ids);
            let col2: Set<number> = new Set<number>(coalitions[1].alliance_ids);
            row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let id = data['name'][1];
                if (col1.has(id)) {
                    row.classList.add('bg-light');
                } else if (col2.has(id)) {
                    // row.classList.add('bg-secondary');
                }
            }
            break;
        case Layout.NATION:
            break;
    }

    { // columns
        columns.push("name");
        for (let i = 0; i < counts_header.length; i++) {
            let header = counts_header[i];
            columns.push(header + "_off");
            columns.push(header + "_def");
            columns.push(header + "_total");
        }
        for (let i = 0; i < damage_header.length; i++) {
            let header = damage_header[i];
            columns.push(header);
            columns.push(header + "_dealt");
            columns.push(header + "_net");
        }

        searchable.push(0);
        cell_format["coalitionNames"] = [0];
    }
    let sort: [number, string] = [columns.indexOf(sortBy), sortDir];

    for (let i = 0; i < columns.length; i++) {
        if (layout.includes(columns[i])) {
            visible.push(i);
        }
    }


    cell_format["formatNumber"] = Array.from({length: columns.length}, (_, i) => i + 1);
    let addStats2Row = (row: any[], offStats: any, defStats: any, damageTaken: any, damageDealt: any) => {
        for (let i = 0; i < offStats.length; i++) {
            let offStat = offStats[i];
            let defStat = defStats[i];
            let totalStat = offStat + defStat;
            row.push(offStat);
            row.push(defStat);
            row.push(totalStat);
        }
        for (let i = 0; i < damageTaken.length; i++) {
            let damageTakenStat = damageTaken[i];
            let damageDealtStat = damageDealt[i];
            let damageNetStat = damageDealtStat - damageTakenStat;
            row.push(damageTakenStat);
            row.push(damageDealtStat);
            row.push(damageNetStat);
        }
    };

    let addRow = (colEntry: any) => {
        let colName = colEntry.name;
        let alliance_ids = colEntry.alliance_ids;
        let alliance_names = colEntry.alliance_names;
        let nation_ids = colEntry.nation_ids;
        let nation_names = colEntry.nation_names;
        let nation_aa = colEntry.nation_aa;
        let stats = colEntry.counts;
        let damage = colEntry.damage;
        console.log("NAME " + colName);
        switch (type) {
            case Layout.COALITION:
                let row = [];
                row.push([colName,alliance_ids,alliance_names]);
                addStats2Row(row, stats[0], stats[1], damage[0], damage[1]);
                rows.push(row);
                break;
            case Layout.ALLIANCE: {
                let o = 2;
                for (let i = 0; i < alliance_ids.length; i++) {
                    let row = [];
                    let alliance_id = alliance_ids[i];
                    let alliance_name = alliance_names[i];
                    row.push([alliance_name,alliance_id]);
                    addStats2Row(row, stats[i*2+o], stats[i*2+o+1], damage[i*2+o], damage[i*2+o+1]);
                    rows.push(row);
                }
                break;
            }
            case Layout.NATION: {
                console.log(JSON.stringify(nation_ids));
                let o = 2 + alliance_ids.length * 2;
                for (let i = 0; i < nation_ids.length; i++) {
                    let row = [];
                    let nation_id = nation_ids[i];
                    let nation_name = nation_names[i];
                    let nation_aa = 
                    row.push([nation_name,nation_id]);
                    addStats2Row(row, stats[i*2+o], stats[i*2+o+1], damage[i*2+o], damage[i*2+o+1]);
                    rows.push(row);
                }
                break;
            }

        }
    }
    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        console.log("ADD COL " + colEntry.name);
        addRow(colEntry);
    }
    let data = {
        columns: columns,
        data: rows,
        visible: visible,
        searchable: searchable,
        cell_format: cell_format,
        row_format: row_format,
        sort: sort
    }
    let container = document.getElementById("conflict-table-1");
    setupContainer(container as HTMLElement, data);
}

let _rawData: any = null;
let _layoutData = {
    layout: Layout.COALITION,
    columns: ["name","wars_off","wars_def"],
    sort: "wars_off",
    sortDir: "desc"
};

function loadCurrentLayout() {
    loadLayout(_rawData, _layoutData.layout, _layoutData.columns, _layoutData.sort, _layoutData.sortDir);
}

function setupConflictTables(theId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${theId}.gzip`;
    decompressJson(url).then((data) => {
        _rawData = data;
        loadCurrentLayout();
    });
}

onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) {
        let potentialId = urlParams.get('id');
        if (potentialId !== null && !isNaN(+potentialId) && Number.isInteger(+potentialId)) {
            console.log('Loading conflict table ' +potentialId);
            setupConflictTables(+potentialId);
        }
    }
});
function handleClick(event: MouseEvent): void {
    _layoutData.layout = parseInt((event.target as HTMLButtonElement).getAttribute("data-bs-layout") as string) ;
    loadCurrentLayout();
}
</script>    
<svelte:head>
	<title>Conflict {conflictName}</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <h1>Conflict: {conflictName}</h1>
    <ul class="nav nav-pills nav-fill" id="js-pills-1" role="tablist">
        <li class="nav-item">
            <button class="nav-link active" id="profile-pill" data-bs-toggle="pill" type="button" role="tab" aria-selected="true" data-bs-layout={Layout.COALITION} on:click={handleClick}>
                <i class="bi bi-cookie"></i>&nbsp;Coalition
            </button>
        </li>
        <li class="nav-item">
            <button class="nav-link" id="billing-pill" data-bs-toggle="pill" type="button" role="tab" aria-selected="false" data-bs-layout={Layout.ALLIANCE} on:click={handleClick}>
                <i class="bi bi-diagram-3-fill"></i>&nbsp;Alliance
            </button>
        </li>
        <li class="nav-item">
            <button class="nav-link" id="billing-pill" data-bs-toggle="pill" type="button" role="tab" aria-selected="false" data-bs-layout={Layout.NATION} on:click={handleClick}>
                <i class="bi bi-person-vcard-fill"></i>&nbsp;Nation
            </button>
        </li>
    </ul>
    <div id="conflict-table-1"></div>
</div>
<Footer />