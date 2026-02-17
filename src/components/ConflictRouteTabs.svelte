<script lang="ts">
    type ConflictTab =
        | "coalition"
        | "alliance"
        | "nation"
        | "tiering"
        | "bubble"
        | "chord";

    export let conflictId: string | null = null;
    export let active: ConflictTab = "coalition";
    export let mode: "links" | "layout-picker" = "links";
    export let currentLayout: number = 0;
    export let onLayoutSelect: ((layout: number) => void) | null = null;
</script>

<div class="row p-0 m-0 ux-tabstrip fw-bold">
    {#if mode === "layout-picker"}
        <button
            class="col-2 ps-0 pe-0 btn {currentLayout === 0 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(0)}
        >
            ◑&nbsp;Coalition
        </button>
        <button
            class="col-2 ps-0 pe-0 btn {currentLayout === 1 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(1)}
        >
            𖣯&nbsp;Alliance
        </button>
        <button
            class="col-2 ps-0 pe-0 btn {currentLayout === 2 ? 'is-active' : ''}"
            on:click={() => onLayoutSelect?.(2)}
        >
            ♟&nbsp;Nation
        </button>
    {:else}
        <a
            href="conflict?id={conflictId}&layout=coalition"
            class="col-2 ps-0 pe-0 btn {active === 'coalition'
                ? 'is-active'
                : ''}"
        >
            ◑&nbsp;Coalition
        </a>
        <a
            href="conflict?id={conflictId}&layout=alliance"
            class="col-2 btn ps-0 pe-0 {active === 'alliance'
                ? 'is-active'
                : ''}"
        >
            𖣯&nbsp;Alliance
        </a>
        <a
            href="conflict?id={conflictId}&layout=nation"
            class="col-2 ps-0 pe-0 btn {active === 'nation' ? 'is-active' : ''}"
        >
            ♟&nbsp;Nation
        </a>
    {/if}

    <a
        class="col-2 ps-0 pe-0 btn {active === 'tiering' ? 'is-active' : ''}"
        href="tiering?id={conflictId}"
    >
        📊&nbsp;Tier/Time
    </a>
    <a
        class="col-2 ps-0 pe-0 btn {active === 'bubble' ? 'is-active' : ''}"
        href="bubble?id={conflictId}"
    >
        📈&nbsp;Bubble/Time
    </a>
    <a
        class="col-2 ps-0 pe-0 btn {active === 'chord' ? 'is-active' : ''}"
        href="chord?id={conflictId}"
    >
        🌐&nbsp;Web
    </a>
</div>
