<script lang=ts>
	/** @type {import('./$types').PageData} */
	export let data: {id: number};
    import Main from '../../../components/Main.svelte'
    import Navbar from '../../../components/Navbar.svelte'
    import Sidebar from '../../../components/Sidebar.svelte'
    import Footer from '../../../components/Footer.svelte'
    import { onMount } from 'svelte';
</script>    
<svelte:head>
	<title>Conflict {data.id}</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <h1>Conflict page {data.id}</h1>
    TODO
</div>
<Footer />