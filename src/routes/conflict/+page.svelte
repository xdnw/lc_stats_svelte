<script lang=ts>
    import Main from '../../components/Main.svelte'
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
    import { decompressJson, modalWithCloseButton, setupContainer } from '$lib';

let idsByCoalitionName: {[key: string]: number[]} = {};
let namesByAllianceId: {[key: number]: string} = {};

enum Layout {
    COALITION,
    ALLIANCE,
    NATION
}

function loadLayout(type: Layout, layout: string[], _rawData: {
    coalitions: {
        name: string,
        alliance_ids: number[],
        alliance_names: string[],
        nation_ids: number[],
        nation_names: string[],
        counts: [number[], number[]],
        damage: [number[], number[]]
    }[],
    counts_header: string[],
    damage_header: string[]
}) {

}

function initConflictTables(_rawData: {
    coalitions: {
        name: string,
        alliance_ids: number[],
        alliance_names: string[],
        nation_ids: number[],
        nation_names: string[],
        counts: [number[], number[]],
        damage: [number[], number[]]
    }[],
    counts_header: string[],
    damage_header: string[],
}, type: Layout, layout: string[]) {
    let coalitions = _rawData["coalitions"];
    let counts_header = _rawData["counts_header"];
    let damage_header = _rawData["damage_header"];

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let sort: [number, string] = [0, 'desc'];
    let cell_format: {[key: string]: number[]} = {};
    let row_format: {[key: string]: number[]} = {};
    
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
        let colName = colEntry["name"];
        let alliance_ids = colEntry["alliance_ids"];
        let alliance_names = colEntry["alliance_names"];
        let nation_ids = colEntry["nation_ids"];
        let nation_names = colEntry["nation_names"];
        let stats = colEntry["counts"];
        let damage = colEntry["damage"];
        switch (type) {
            case Layout.COALITION:
                let row = [];
                row.push([colName,alliance_ids,alliance_names]);
                addStats2Row(row, stats[0], stats[1], damage[0], damage[1]);
                rows.push(row);
                break;
            case Layout.ALLIANCE:
                for (let i = 0; i < alliance_ids.length; i++) {
                    let row = [];
                    let alliance_id = alliance_ids[i];
                    let alliance_name = alliance_names[i];
                    console.log(alliance_name + " | " + alliance_id);
                    row.push([alliance_name,alliance_id]);
                    addStats2Row(row, stats[i*2+2], stats[i*2+3], damage[i*2+2], damage[i*2+3]);
                    rows.push(row);
                }
                break;
            case Layout.NATION:
                break;

        }
    }
    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
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

function setupConflictTables(theId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${theId}.gzip`;
    decompressJson(url).then((result) => {
        console.log(result);
        initConflictTables(result, Layout.ALLIANCE, [
            "name",
            "wars_off",
            "wars_def"
        ]);
    });
}

var conflictId = -1;

onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) {
        let potentialId = urlParams.get('id');
        if (potentialId !== null && !isNaN(+potentialId) && Number.isInteger(+potentialId)) {
            conflictId = +potentialId;
            console.log('Loading conflict table ' + conflictId);
            setupConflictTables(conflictId);
        }
    }
});
</script>    
<svelte:head>
	<title>Conflict {conflictId}</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <h1>Conflict page {conflictId}</h1>
    <div id="conflict-table-1"></div>
</div>
<Footer />