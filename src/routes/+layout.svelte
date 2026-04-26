<script lang="ts">
    import "../styles/app-shell.css";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import Navbar from "../components/Navbar.svelte";
    import Footer from "../components/Footer.svelte";

    if (browser) {
        // Load non-critical shell styles (forms, dropdowns, modals, btn-close)
        // after first paint so they do not block the initial render. They are
        // not visible on any route until after data loads or user interaction.
        onMount(() => {
            void import("../styles/app-shell-deferred.css");
        });
    }
</script>

<Navbar />
<main>
    <slot />
</main>
<Footer />
