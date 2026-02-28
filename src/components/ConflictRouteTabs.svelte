<script lang="ts">
    import { base } from "$app/paths";
    import { getConflictDataUrl, getConflictGraphDataUrl } from "$lib/runtime";
    import {
        queueRuntimePrefetch,
        queueUrlPrefetch,
    } from "$lib/prefetchCoordinator";
    import { beginJourneySpan } from "$lib/journeyPerf";
    import { appConfig as config } from "$lib/appConfig";

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
    export let disabledTabs: ConflictTab[] = [];

    /** Tabs that use graph_data; everything else uses conflict_data. */
    const GRAPH_TABS: Set<ConflictTab> = new Set(["tiering", "bubble"]);

    function isTabDisabled(tab: ConflictTab): boolean {
        return disabledTabs.includes(tab);
    }

    function buildTabHref(tab: ConflictTab): string {
        if (tab === "coalition" || tab === "alliance" || tab === "nation") {
            return `${base}/conflict?id=${conflictId}&layout=${tab}`;
        }
        if (tab === "aava") return `${base}/aava?id=${conflictId}`;
        if (tab === "tiering") return `${base}/tiering?id=${conflictId}`;
        if (tab === "bubble") return `${base}/bubble?id=${conflictId}`;
        return `${base}/chord?id=${conflictId}`;
    }

    function prefetchTab(tab: ConflictTab) {
        if (!conflictId || tab === active || isTabDisabled(tab)) return;
        const url = GRAPH_TABS.has(tab)
            ? getConflictGraphDataUrl(conflictId, config.version.graph_data)
            : getConflictDataUrl(conflictId, config.version.conflict_data);
        queueUrlPrefetch(url, {
            priority: "high",
            crossRoute: true,
        });
        if (tab === "bubble") {
            beginJourneySpan("journey.conflict_to_bubble.firstMount", {
                conflictId,
                trigger: "tab-intent",
            });
            queueRuntimePrefetch("plotly", {
                priority: "idle",
                crossRoute: true,
            });
        }
        if (tab === "coalition" || tab === "alliance" || tab === "nation") {
            queueRuntimePrefetch("table", {
                priority: "idle",
                crossRoute: true,
            });
        }
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
            href={buildTabHref("coalition")}
            class="col ps-0 pe-0 btn {active === 'coalition'
                ? 'is-active'
                : ''}"
            on:mouseenter={() => prefetchTab("coalition")}
            data-sveltekit-preload-code="hover"
        >
            ◑&nbsp;Coalition
        </a>
        <a
            href={buildTabHref("alliance")}
            class="col btn ps-0 pe-0 {active === 'alliance' ? 'is-active' : ''}"
            on:mouseenter={() => prefetchTab("alliance")}
            data-sveltekit-preload-code="hover"
        >
            𖣯&nbsp;Alliance
        </a>
        <a
            href={buildTabHref("nation")}
            class="col ps-0 pe-0 btn {active === 'nation' ? 'is-active' : ''}"
            on:mouseenter={() => prefetchTab("nation")}
            data-sveltekit-preload-code="hover"
        >
            ♟&nbsp;Nation
        </a>
    {/if}

    {#if isTabDisabled("aava")}
        <button class="col ps-0 pe-0 btn" disabled>⚔️&nbsp;AA vs AA</button>
    {:else}
        <a
            class="col ps-0 pe-0 btn {active === 'aava' ? 'is-active' : ''}"
            href={buildTabHref("aava")}
            on:mouseenter={() => prefetchTab("aava")}
            data-sveltekit-preload-code="hover"
        >
            ⚔️&nbsp;AA vs AA
        </a>
    {/if}

    {#if isTabDisabled("tiering")}
        <button class="col ps-0 pe-0 btn" disabled>📊&nbsp;Tier/Time</button>
    {:else}
        <a
            class="col ps-0 pe-0 btn {active === 'tiering' ? 'is-active' : ''}"
            href={buildTabHref("tiering")}
            on:mouseenter={() => prefetchTab("tiering")}
            data-sveltekit-preload-code="hover"
        >
            📊&nbsp;Tier/Time
        </a>
    {/if}
    {#if isTabDisabled("bubble")}
        <button class="col ps-0 pe-0 btn" disabled>📈&nbsp;Bubble/Time</button>
    {:else}
        <a
            class="col ps-0 pe-0 btn {active === 'bubble' ? 'is-active' : ''}"
            href={buildTabHref("bubble")}
            on:mouseenter={() => prefetchTab("bubble")}
            data-sveltekit-preload-code="hover"
        >
            📈&nbsp;Bubble/Time
        </a>
    {/if}
    {#if isTabDisabled("chord")}
        <button class="col ps-0 pe-0 btn" disabled>🌐&nbsp;Web</button>
    {:else}
        <a
            class="col ps-0 pe-0 btn {active === 'chord' ? 'is-active' : ''}"
            href={buildTabHref("chord")}
            on:mouseenter={() => prefetchTab("chord")}
            data-sveltekit-preload-code="hover"
        >
            🌐&nbsp;Web
        </a>
    {/if}
</div>
