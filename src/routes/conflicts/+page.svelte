<script lang=ts>
	import { base } from '$app/paths';
	/** @type {import('./$types').PageData} */
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
    import { decompressBson, modalWithCloseButton, setupContainer, addFormatters } from '$lib';

    let url = "https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip";

onMount(() => {
    addFormatters();
    
    let allianceNameById:{[key: number]: string} = {};
    let allianceIdsByCoalition:{[key: string]: number[][]} = {};
    let colNames:{[key:string]: string[]} = {};

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
    (window as any).formatUrl = (data: string, type: any, row: any, meta: any) => {
        let id = row['id'];
        let result = `<span class='text-nowrap'>`;
        for (let i = 0; i <= 1; i++) {
            let button = document.createElement("button");
            button.setAttribute("type", "button");
            button.setAttribute("class", "ms-1 btn btn-info btn-sm fw-bold");
            button.setAttribute("onclick", `showNames('${data}',${i})`);
            button.textContent = 'C'+(i+1);
            result += button.outerHTML;
        }
        result += `&nbsp;<a href="conflict?id=${id}">${data}</a></span>`
        return result;
    }

    try {
        decompressBson(url).then((result) => {
            let alliance_ids = result.alliance_ids;
            let alliance_names = result.alliance_names;
            for (let i = 0; i < alliance_ids.length; i++) {
                allianceNameById[parseInt(alliance_ids[i])] = alliance_names[i];
            }
            let columns: string[] = result.headers as string[];
            let visible: number[] = [1,2,3,4,5,6,7,8,9];
            let searchable: number[] = [1];
            let cell_format: {[key: string]: number[]} = {};
            let sort: [number, string] = [5, 'desc'];
            let rows: any[][] = result.conflicts as any[][];

            for (let i = 0; i < rows.length; i++) {
                let conflict = rows[i];
                let conName = conflict[1];
                console.log("Conflict name: ", conName, "Alliance IDs: ", conflict[10], conflict[11], "Coalition names: ", conflict[2], conflict[3]);
                allianceIdsByCoalition[conName] = [conflict[10],conflict[11]];
                colNames[conName] = [conflict[2], conflict[3]];
            }

            columns.push("total")
            for (let i in rows) {
                let damage = rows[i][6] + rows[i][7];
                rows[i].push(damage);
            }

            cell_format["formatUrl"] = [1];
            cell_format["formatNumber"] = [6, 7, 16];
            cell_format["formatMoney"] = [8,9];
            cell_format["formatDate"] = [4,5];

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
                        row.classList.add('bg-warning');
                    } else if (end < Date.now() - 432000000) {
                        row.classList.add('bg-light');
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
<div class="container" style="min-height: calc(100vh - 203px);">
    <h1><a href="{base}/"><i class="bi bi-arrow-left"></i></a>&nbsp;Conflicts</h1>
    <div id="conflictTable"></div>
</div>
<Footer />