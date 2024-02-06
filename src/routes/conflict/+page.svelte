<script lang=ts>
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
    import { addFormatters, decompressBson, modalWithCloseButton, setupContainer } from '$lib';

let conflictName = "";
let conflictId = -1;

enum Layout {
    COALITION,
    ALLIANCE,
    NATION
}

function trimHeader(header: string) {
    if (header.includes("_value")) {
        header = "~$" + header.replace("_value", "");
    }
    if (header.includes("_loss")) {
        header = header.replace("_loss", "");
    }
    if (header.includes("loss_")) {
        header = header.replace("loss_", "");
    }
    if (header === "~$loss") {
        header = "damage";
    }
    return header.replaceAll("_", " ");
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
    conflictName = _rawData.name;
    let coalitions = _rawData.coalitions;
    let counts_header = _rawData.counts_header;
    let damage_header = _rawData.damage_header;

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: {[key: string]: number[]} = {};
    let row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null = null;

    let col1: Set<number> = new Set<number>(coalitions[0].alliance_ids);
    let col2: Set<number> = new Set<number>(coalitions[1].alliance_ids);

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
            row_format = (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                let id = data['name'][2];
                if (col1.has(id)) {
                    row.classList.add('bg-light');
                } else if (col2.has(id)) {
                    // row.classList.add('bg-secondary');
                }
            }
            break;
    }  

    { // columns
        columns.push("name");
        for (let i = 0; i < counts_header.length; i++) {
            let header = trimHeader(counts_header[i]);
            console.log(header);
            columns.push("off:" + header);
            columns.push("def:" + header);
            columns.push("both:" + header);
        }
        for (let i = 0; i < damage_header.length; i++) {
            let header = trimHeader(damage_header[i]);
            console.log(header);
            columns.push("loss:" + header);
            columns.push("dealt:" + header.replace("_loss", "").replace("loss_", ""));
            columns.push("net:" + header.replace("_loss", "").replace("loss_", ""));
        }

        searchable.push(0);
        cell_format["coalitionNames"] = [0];
    }
    let sort: [number, string] = [columns.indexOf(sortBy), sortDir];
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

    let addRow = (colEntry: any, index: number) => {
        let colName = colEntry.name;
        let alliance_ids = colEntry.alliance_ids;
        let alliance_names = colEntry.alliance_names;
        let nation_ids = colEntry.nation_ids;
        let nation_names = colEntry.nation_names;
        let nation_aas = colEntry.nation_aa;
        let stats = colEntry.counts;
        let damage = colEntry.damage;
        switch (type) {
            case Layout.COALITION:
                cell_format["formatCol"] = [0];
                let row = [];
                row.push(index);
                addStats2Row(row, stats[0], stats[1], damage[0], damage[1]);
                rows.push(row);
                break;
            case Layout.ALLIANCE: {
                cell_format["formatAA"] = [0];
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
                cell_format["formatNation"] = [0];
                let o = 2 + alliance_ids.length * 2;
                for (let i = 0; i < nation_ids.length; i++) {
                    let row = [];
                    let nation_id = nation_ids[i];
                    let nation_name = nation_names[i];
                    let nation_aa = nation_aas[i];
                    row.push([nation_name,nation_id,nation_aa]);
                    addStats2Row(row, stats[i*2+o], stats[i*2+o+1], damage[i*2+o], damage[i*2+o+1]);
                    rows.push(row);
                }
                break;
            }
        }
    }
    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        addRow(colEntry, i);
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
let breakdownCols = ["GROUND_TANKS_MUNITIONS_USED_UNNECESSARY","DOUBLE_FORTIFY","GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY","GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY_INACTIVE","GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR_INACTIVE","GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR","AIRSTRIKE_SOLDIERS_NONE","AIRSTRIKE_SOLDIERS_SHOULD_USE_GROUND","AIRSTRIKE_TANKS_NONE","AIRSTRIKE_SHIP_NONE","AIRSTRIKE_INACTIVE_NO_GROUND","AIRSTRIKE_INACTIVE_NO_SHIP","AIRSTRIKE_FAILED_NOT_DOGFIGHT","AIRSTRIKE_AIRCRAFT_NONE","AIRSTRIKE_AIRCRAFT_NONE_INACTIVE","AIRSTRIKE_AIRCRAFT_LOW","AIRSTRIKE_INFRA","AIRSTRIKE_MONEY","NAVAL_MAX_VS_NONE"].map(col => `off:${col.toLowerCase().replaceAll("_", " ")} attacks`);
let layouts:{[key: string]: {sort: string, columns: string[]}} = {
    // net damage, o/w d/w inflicted received
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
let _layoutData = {
    layout: Layout.COALITION,
    columns: layouts.Attacks.columns,
    sort: layouts.Attacks.sort,
    sortDir: "desc"
};

function loadCurrentLayout() {
    loadLayout(_rawData, _layoutData.layout, _layoutData.columns, _layoutData.sort, _layoutData.sortDir);
}

function setupConflictTables(conflictId: number) {
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip`;
    decompressBson(url).then((data) => {
        _rawData = data;
        setColNames(_rawData.coalitions[0].alliance_ids, _rawData.coalitions[0].alliance_names);
        setColNames(_rawData.coalitions[1].alliance_ids, _rawData.coalitions[1].alliance_names);
        loadCurrentLayout();
    });
}

let namesByAllianceId: {[key: number]: string} = {};
function setColNames(ids: number[], names: string[]) {
    for (let i = 0; i < ids.length; i++) {
        namesByAllianceId[ids[i]] = names[i];
    }
}

onMount(() => {
    addFormatters();
    
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

    (window as any).formatNation = (data: any, type: any, row: any, meta: any) => {
        let aaId = data[2] as number;
        let aaName = namesByAllianceId[aaId];
        return `<a href="https://politicsandwar.com/nation/id=${data[1]}">${data[0]?data[0]:data[1]}</a> | <a href="https://politicsandwar.com/alliance/id=${data[2]}">${aaName}</a>`;
    }

    (window as any).formatAA = (data: any, type: any, row: any, meta: any) => {
        return `<a href="https://politicsandwar.com/alliance/id=${data[1]}">${data[0]}</a>`;
    }

    (window as any).formatCol = (data: any, type: any, row: any, meta: any) => {
        let button = document.createElement("button");
        button.setAttribute("type", "button");
        button.setAttribute("class", "ms-1 btn btn-info btn-sm");
        button.setAttribute("onclick", `showNames('${_rawData.coalitions[row.name].name}',${row.name})`);
        button.textContent = "Coalition " + row.name;
        return button.outerHTML;
    }

    const id = new URLSearchParams(window.location.search).get('id');
    if (id && !isNaN(+id) && Number.isInteger(+id)) {
        conflictId = +id;
        setupConflictTables(conflictId);
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
<div class="container-fluid" style="min-height: calc(100vh - 203px);">
    <h1><a href="conflicts"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflict: {conflictName}</h1>
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
        <li class="nav-item">
            <a class="nav-link" id="billing-pill" role="tab" aria-selected="false" data-bs-layout={Layout.NATION} href="tiering/?id={conflictId}">
                <i class="bi bi-bar-chart-line-fill"></i>&nbsp;Tiering
            </a>
        </li>
        <li class="nav-item">
            <button class="nav-link" id="billing-pill" role="tab" aria-selected="false" data-bs-layout={Layout.NATION} on:click={() => alert("Coming soon")}>
                <i class="bi bi-bar-chart-steps"></i>&nbsp;TODO: Rank/Time
            </button>
        </li>
        <li class="nav-item">
            <button class="nav-link" id="billing-pill" role="tab" aria-selected="false" data-bs-layout={Layout.NATION} on:click={() => alert("Coming soon")}>
                <i class="bi bi-graph-up"></i>&nbsp;TODO: Graphs
            </button>
        </li>
    </ul>
    <div id="conflict-table-1"></div>
</div>
<Footer />