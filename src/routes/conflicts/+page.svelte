<script lang=ts>
    import Main from '../../components/Main.svelte'
    import Navbar from '../../components/Navbar.svelte'
    import Sidebar from '../../components/Sidebar.svelte'
    import Footer from '../../components/Footer.svelte'
    import { onMount } from 'svelte';
</script>    
<svelte:head>
	<title>Conflicts</title>
</svelte:head>
<Navbar />
<Sidebar />
<div class="container">
    <h1>Conflicts page</h1>
    <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/conflict/6">Conflict 6</a></li>
    </ul>
</div>
<Footer />