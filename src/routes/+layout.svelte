<script lang="ts">
    import "../styles/app-shell.css";
    import Navbar from "../components/Navbar.svelte";
    import Footer from "../components/Footer.svelte";
</script>

<Navbar />
<main>
    <slot />
</main>
<Footer />
