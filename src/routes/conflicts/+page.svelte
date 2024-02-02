<script lang=ts>
	/** @type {import('./$types').PageData} */
    import Main from '../../components/Main.svelte'
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
  import { decompressJson, modalWithCloseButton, setupContainer, addFormatters } from '$lib';

let url = "https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip";

onMount(() => {
    addFormatters();
    
    let allianceNameById:{[key: number]: string} = {};
    let allianceIdsByCoalition:{[key: string]: number[][]} = {};

    (window as any).showNames = (coalitionName: string, index: number) => {
        let alliance_ids: number[] = allianceIdsByCoalition[coalitionName][index];
        var modalTitle = "Coalition " + (index + 1) + ": " + coalitionName;
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
        // modal body is coalition ids joined by comma + the list
        let idsStr = alliance_ids.join(", ");
        let modalBody = document.createElement("div");
        modalBody.textContent = idsStr;
        modalBody.appendChild(ul);
        modalWithCloseButton(modalTitle, modalBody);
    }
    (window as any).formatUrl = (data: string, type: any, row: any, meta: any) => {
        let id = row['id'];
        let result = `<a href="conflict?id=${id}">${data}</a>`;
        for (let i = 0; i <= 1; i++) {
            let button = document.createElement("button");
            button.setAttribute("type", "button");
            button.setAttribute("class", "ms-1 btn btn-info btn-sm");
            button.setAttribute("onclick", `showNames('${data}',${i})`);
            button.textContent = "C" + i;
            result += button.outerHTML;
        }
        return result;
    }

    try {
        decompressJson(url).then((result) => {
            let alliance_ids = result.alliance_ids;
            let alliance_names = result.alliance_names;
            for (let i = 0; i < alliance_ids.length; i++) {
                allianceNameById[parseInt(alliance_ids[i])] = alliance_names[i];
            }

            let columns: string[] = result.headers as string[];
            let visible: number[] = [1,2,3,4,5,6,7];
            let searchable: number[] = [1];
            let cell_format: {[key: string]: number[]} = {};
            let sort: [number, string] = [3, 'desc'];
            let rows: any[][] = result.conflicts as any[][];

            for (let i = 0; i < rows.length; i++) {
                let conflict = rows[i];
                allianceIdsByCoalition[conflict[1]] = [conflict[8],conflict[9]];
            }

            cell_format["formatUrl"] = [1];
            cell_format["formatNumber"] = [4, 5];
            cell_format["formatMoney"] = [6, 7];
            cell_format["formatDate"] = [2,3];

            let container = document.getElementById('conflictTable');
            let data = {
                columns: columns,
                data: rows,
                visible: visible,
                searchable: searchable,
                cell_format: cell_format,
                row_format: (row: HTMLElement, data: {[key: string]: any}, index: number) => {
                    let end = data.end;
                    if (end == -1) {
                        row.setAttribute('style', 'background-color: MistyRose');
                    } else if (end < Date.now() - 432000000) {
                        row.setAttribute('style', 'background-color: AliceBlue');
                    }
                },
                sort: sort
            }

            setupContainer(container as HTMLElement, data);

        });
    } catch (error) {
        console.error('Error reading from S3 bucket:', error);
    }
});
</script>    
<svelte:head>
	<title>Conflicts</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <div id="conflictTable"></div>
</div>
<Footer />