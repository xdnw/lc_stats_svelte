<script lang=ts>
	/** @type {import('./$types').PageData} */
    import Main from '../../components/Main.svelte'
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
  import { decompressJson, setupContainer } from '$lib';

let url = "https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip";

onMount(() => {
    console.log('Conflict page mounted');
    try {
        decompressJson(url).then((result) => {
            let columns: string[] = result.headers as string[];
            let visible: number[] = [1,2,3,4,5,6,7];
            let searchable: number[] = [1];
            let cell_format: {[key: string]: number[]} = {};
            let row_format: {[key: string]: number[]} = {};
            let sort: [number, string] = [3, 'desc'];
            let rows: any[][] = result.conflicts as any[][];

            let container = document.getElementById('conflictTable');
            let data = {
                columns: columns,
                data: rows,
                visible: visible,
                searchable: searchable,
                cell_format: cell_format,
                row_format: row_format,
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
	<title>Conflict setupContainer</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <div id="conflictTable"></div>
</div>
<Footer />