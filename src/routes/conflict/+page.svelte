<script lang=ts>
    import Main from '../../components/Main.svelte'
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
    import { decompressJson, modalWithCloseButton, setupContainer } from '$lib';

let idsByCoalitionName: {[key: string]: number[]} = {};
let namesByAllianceId: {[key: number]: string} = {};

function coalitionNames(data: string, type: unknown, row: unknown, meta: unknown): string {
    let button = document.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("class", "btn btn-primary btn-sm");
    // make button call function showNames with data
    button.setAttribute("onclick", `showNames('${data}')`);
    button.textContent = data[0];
    return button.outerHTML;
}

function showNames(coalitionName: string) {
    let alliance_ids = idsByCoalitionName[coalitionName];
    let alliance_names = alliance_ids.map((id) => namesByAllianceId[id]);
    
    var modalTitle = coalitionName + " Alliances";
    let ul = document.createElement("ul");
    for (let i = 0; i < alliance_ids.length; i++) {
        let alliance_id = alliance_ids[i];
        let alliance_name = alliance_names[i];
        let a = document.createElement("a");
        a.setAttribute("href", "https://politicsandwar.com/alliance/id=" + alliance_id);
        a.textContent = alliance_name;
        let li = document.createElement("li");
        li.appendChild(a);
        ul.appendChild(li);
    }
    // modal body is coalition ids joined by comma + the list
    let idsStr = alliance_ids.join(", ");
    let modalBody = document.createElement("div");
    modalBody.textContent = idsStr;
    modalBody.appendChild(ul);
    modalWithCloseButton(modalTitle, modalBody);
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
    damage_header: string[]
}) {
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
    
    let searchColNames = ["names","wars_off"]

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
    cell_format["formatNumber"] = Array.from({length: columns.length}, (_, i) => i + 1);
    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        let name = colEntry["name"];
        let alliance_ids = colEntry["alliance_ids"];
        let alliance_names = colEntry["alliance_names"];
        let nation_ids = colEntry["nation_ids"];
        let nation_names = colEntry["nation_names"];
        let stats = colEntry["counts"];
        let damage = colEntry["damage"];

        let row = [];
        row.push([name,alliance_ids,alliance_names]);
        {
            let offStats = stats[0];
            let defStats = stats[1];

            for (let i = 0; i < offStats.length; i++) {
                let offStat = offStats[i];
                let defStat = defStats[i];
                let totalStat = offStat + defStat;
                row.push(offStat);
                row.push(defStat);
                row.push(totalStat);
            }

            let damageTaken = damage[0];
            let damageDealt = damage[1];

            for (let i = 0; i < damageTaken.length; i++) {
                let damageTakenStat = damageTaken[i];
                let damageDealtStat = damageDealt[i];
                let damageNetStat = damageDealtStat - damageTakenStat;
                row.push(damageTakenStat);
                row.push(damageDealtStat);
                row.push(damageNetStat);
            }
        }
       rows.push(row);
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
        initConflictTables(result);
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