<script lang=ts>
	import { config } from './../+layout.ts';
/**
 * This page is for viewing the table of all conflicts
*/
import { base } from '$app/paths';
import Navbar from '../../components/Navbar.svelte'
import Sidebar from '../../components/Sidebar.svelte'
import Footer from '../../components/Footer.svelte'
import { onMount } from 'svelte';
import { decompressBson, modalWithCloseButton, setupContainer, addFormatters, downloadTableData, type TableData, type ExportType, ExportTypes } from '$lib';

let _currentRowData: TableData;

// onMount runs when this component (i.e. the page) is loaded
// This registers the formatting functions, and then loads the data from s3 and creates the conflict list table
onMount(() => {
try {
    // Add the cell format functions to the window
    addFormatters();
    
    // These store a map of the alliance and coalition names
    // - Used by the row format function for coloring the rows
    // - Used to create the modal for the coalition alliances
    let allianceNameById:{[key: number]: string} = {};
    let allianceIdsByCoalition:{[key: string]: number[][]} = {};
    let colNames:{[key:string]: string[]} = {};

    // This runs when the coalition button is pressed
    // Displays a modal with the alliance ids and list of alliance name (linking to the game page)
    (window as any).showNames = (coalitionName: string, index: number) => {
        let alliance_ids: number[] = allianceIdsByCoalition[coalitionName][index];
        let name = colNames[coalitionName][index];
        var modalTitle = `[C${index+1}] ${name}: ${coalitionName}`;
        let ul = document.createElement("ul");
        for (let i = 0; i < alliance_ids.length; i++) {
            let alliance_id = alliance_ids[i];
            let alliance_name = allianceNameById[alliance_id];
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
    // Function to format the url for the conflict name
    // Has a C1 and C2 button for showing coalition alliances modal
    // + the name of the conflict (linking to the conflict page)
    (window as any).formatUrl = (data: string, type: any, row: any, meta: any) => {
        let id = row['id'];
        let result = `<span class='text-nowrap'>`;
        for (let i = 0; i <= 1; i++) {
            let button = document.createElement("button");
            button.setAttribute("type", "button");
            button.setAttribute("class", "ms-1 btn btn-outline-info btn-secondary btn-sm fw-bold opacity-75");
            button.setAttribute("onclick", `showNames('${data}',${i})`);
            button.textContent = 'C'+(i+1);
            result += button.outerHTML;
        }
        result += `&nbsp;<a href="conflict?id=${id}">${data}</a></span>`
        return result;
    }

    (window as any).download = function download(useClipboard: boolean, type: string) {
        downloadTableData(_currentRowData, useClipboard, ExportTypes[type as keyof typeof ExportTypes]);
    }

    // Url of s3 bucket
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip?${config.version.conflicts}`;
    
    decompressBson(url).then((result) => {
        /*
        Result is an object with the following keys:
        alliance_ids: number[]; - array of alliance ids
        alliance_names: string[]; - array of alliance names (corresponding to the alliance_ids array)
        headers: string[]; - array of the column names, currently (by index):
        - 0:id
        - 1:name
        - 2:c1_name
        - 3:c2_name
        - 4:start
        - 5:end
        - 6:wars
        - 7:active_wars
        - 8:c1_dealt
        - 9:c2_dealt
        - 10:c1
        - 11:c2
        - 12:wiki
        - 13:status
        - 14:cb
        - 15:posts - not displayed
        conflicts: any[][]; - 2D array of the table cell data in the form [row index][column index]
        */
        let alliance_ids = result.alliance_ids;
        let alliance_names = result.alliance_names;
        for (let i = 0; i < alliance_ids.length; i++) {
            allianceNameById[alliance_ids[i]] = alliance_names[i];
        }
        let columns: string[] = result.headers as string[];
        let visible: number[] = [1,2,3,4,5,6,7,8,9];
        let searchable: number[] = [1];
        let cell_format: {[key: string]: number[]} = {};
        let sort: [number, string] = [5, 'desc'];
        let rows: any[][] = result.conflicts as any[][];

        // Set the coalition names
        for (let i = 0; i < rows.length; i++) {
            let conflict = rows[i];
            let conName = conflict[1];
            allianceIdsByCoalition[conName] = [conflict[10],conflict[11]];
            colNames[conName] = [conflict[2], conflict[3]];
        }

        // Add total damage column (as combination of c1_dealt and c2_dealt)
        columns.push("total")
        for (let i in rows) {
            let damage = rows[i][8] + rows[i][8];
            rows[i].push(damage);
        }

        // Set the cell format functions to specific columns
        cell_format["formatUrl"] = [1];
        cell_format["formatNumber"] = [6, 7, 16];
        cell_format["formatMoney"] = [8,9];
        cell_format["formatDate"] = [4,5];

        let container = document.getElementById('conflictTable');
        _currentRowData = {
            columns: columns,
            data: rows,
            visible: visible,
            searchable: searchable,
            cell_format: cell_format,
            row_format: (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                // Highlight rows based on the end date (ongoing = warning, ended <5d ago = light, ended = no color)
                let end = data.end;
                if (end == -1) {
                    row.classList.add('bg-danger-subtle');
                } else if (end < Date.now() - 432000000) { // 432000000 = 5 days in milliseconds
                    row.classList.add('bg-light-subtle');
                } else {
                    row.classList.add('bg-warning-subtle');
                }
            },
            sort: sort
        }

        // Setup the conflicts table
        setupContainer(container as HTMLElement, _currentRowData);

    });
} catch (error) {
    console.error('Error reading from S3 bucket:', error);
}
});
</script>    
<svelte:head>
    <!-- Modify head -->
	<title>Conflicts</title>
</svelte:head>
<!-- Add navbar component to page  -->
<Navbar />
<!-- Add sidebar component to page -->
<Sidebar />
<div class="container" style="min-height: calc(100vh - 203px);">
    <!-- Back button (bootstrap icons) links to `base` (svelte variable for the base path) -->
    <h1><a href="{base}/"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflicts</h1>
    <div id="conflictTable"></div>
</div>
<!-- Add footer component to page -->
<Footer />