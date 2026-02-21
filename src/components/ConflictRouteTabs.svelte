<script lang="ts">
    import {
        decompressBson,
        getConflictDataUrl,
        getConflictGraphDataUrl,
    } from "$lib";
    import { config } from "../routes/+layout";

    type ConflictTab =
        | "coalition"
        | "alliance"
        | "aava"
        | "nation"
        | "tiering"
        | "bubble"
        | "chord";

    export let conflictId: string | null = null;
    export let active: ConflictTab = "coalition";
    export let mode: "links" | "layout-picker" = "links";
    export let currentLayout: number = 0;
    export let onLayoutSelect: ((layout: number) => void) | null = null;

    /** Tabs that use graph_data; everything else uses conflict_data. */
    const GRAPH_TABS: Set<ConflictTab> = new Set(["tiering", "bubble"]);

    function prefetchTab(tab: ConflictTab) {
        if (!conflictId || tab === active) return;
        const url = GRAPH_TABS.has(tab)
            ? getConflictGraphDataUrl(conflictId, config.version.graph_data)
            : getConflictDataUrl(conflictId, config.version.conflict_data);
        decompressBson(url).catch(() => {});
    }
</script>

<div class="row p-0 m-0 ux-tabstrip fw-bold">
    {#if mode === "layout-picker"}
        <button
            class="col ps-0 pe-0 btn {currentLayout === 0 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(0)}
        >
            ◑&nbsp;Coalition
        </button>
        <button
            class="col ps-0 pe-0 btn {currentLayout === 1 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(1)}
        >
            𖣯&nbsp;Alliance
        </button>
        <button
            class="col ps-0 pe-0 btn {currentLayout === 2 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(2)}
        >
            ♟&nbsp;Nation
        </button>
    {:else}
        <a
            href="conflict?id={conflictId}&layout=coalition"
            class="col ps-0 pe-0 btn {active === 'coalition'
                ? 'is-active'
                : ''}"
            on:mouseenter={() => prefetchTab("coalition")}
        >
            ◑&nbsp;Coalition
        </a>
        <a
            href="conflict?id={conflictId}&layout=alliance"
            class="col btn ps-0 pe-0 {active === 'alliance' ? 'is-active' : ''}"
            on:mouseenter={() => prefetchTab("alliance")}
        >
            𖣯&nbsp;Alliance
        </a>
        <a
            href="conflict?id={conflictId}&layout=nation"
            class="col ps-0 pe-0 btn {active === 'nation' ? 'is-active' : ''}"
            on:mouseenter={() => prefetchTab("nation")}
        >
            ♟&nbsp;Nation
        </a>
    {/if}

    <a
        class="col ps-0 pe-0 btn {active === 'aava' ? 'is-active' : ''}"
        href="aava?id={conflictId}"
        on:mouseenter={() => prefetchTab("aava")}
    >
        ⚔️&nbsp;AA vs AA
    </a>

    <a
        class="col ps-0 pe-0 btn {active === 'tiering' ? 'is-active' : ''}"
        href="tiering?id={conflictId}"
        on:mouseenter={() => prefetchTab("tiering")}
    >
        📊&nbsp;Tier/Time
    </a>
    <a
        class="col ps-0 pe-0 btn {active === 'bubble' ? 'is-active' : ''}"
        href="bubble?id={conflictId}"
        on:mouseenter={() => prefetchTab("bubble")}
    >
        📈&nbsp;Bubble/Time
    </a>
    <a
        class="col ps-0 pe-0 btn {active === 'chord' ? 'is-active' : ''}"
        href="chord?id={conflictId}"
        on:mouseenter={() => prefetchTab("chord")}
    >
        🌐&nbsp;Web
    </a>
</div>
