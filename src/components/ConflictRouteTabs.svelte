<script lang="ts">
    import { base } from "$app/paths";
    import { getConflictDataUrl, getConflictGraphDataUrl } from "$lib/runtime";
    import {
        queueRuntimePrefetch,
        queueUrlPrefetch,
    } from "$lib/prefetchCoordinator";
    import { beginJourneySpan } from "$lib/journeyPerf";
    import { appConfig as config } from "$lib/appConfig";
    import {
        buildConflictTabDescriptors,
        type ConflictLayoutTab,
        type ConflictRouteKind,
        type ConflictTab,
        type ConflictTabCapabilities,
        type ConflictTabDescriptor,
    } from "$lib/conflictTabs";

    export let conflictId: string | null = null;
    export let compositeIds: string[] | null = null;
    export let selectedAllianceId: number | null = null;
    export let active: ConflictTab = "coalition";
    export let mode: "links" | "layout-picker" = "links";
    export let routeKind: ConflictRouteKind | null = null;
    export let currentLayout: number = 0;
    export let onLayoutSelect: ((layout: number) => void) | null = null;
    export let capabilities: ConflictTabCapabilities = {};
    export let disabledTabs: ConflictTab[] = [];

    /** Tabs that use graph_data; everything else uses conflict_data. */
    const GRAPH_TABS: Set<ConflictTab> = new Set(["tiering", "bubble"]);

    const LAYOUT_TABS: ConflictLayoutTab[] = ["coalition", "alliance", "nation"];
    const NON_LAYOUT_TABS: Array<Exclude<ConflictTab, ConflictLayoutTab>> = [
        "aava",
        "tiering",
        "bubble",
        "chord",
    ];

    const TAB_LABELS: Record<ConflictTab, string> = {
        coalition: "◑ Coalition",
        alliance: "𖣯 Alliance",
        nation: "♟ Nation",
        aava: "⚔️ AA vs AA",
        tiering: "📊 Tier/Time",
        bubble: "📈 Bubble/Time",
        chord: "🌐 Web",
    };

    function hasCompositeContext(): boolean {
        return (
            Array.isArray(compositeIds) &&
            compositeIds.length >= 2 &&
            Number.isFinite(selectedAllianceId) &&
            (selectedAllianceId ?? 0) > 0
        );
    }

    function resolveRouteKind(): ConflictRouteKind {
        if (routeKind) return routeKind;
        return hasCompositeContext() ? "composite" : "single";
    }

    $: effectiveRouteKind = resolveRouteKind();

    $: tabDescriptors = buildConflictTabDescriptors({
        activeTab: active,
        routeKind: effectiveRouteKind,
        capabilities,
        hrefContext: {
            routeKind: effectiveRouteKind,
            conflictId,
            compositeIds,
            selectedAllianceId,
            basePath: base,
        },
        disabledTabs,
    });

    function getTabDescriptor(tab: ConflictTab): ConflictTabDescriptor {
        return tabDescriptors.find((entry) => entry.tab === tab) ?? {
            tab,
            href: null,
            disabled: true,
            active: false,
        };
    }

    function prefetchTab(descriptor: ConflictTabDescriptor) {
        const tab = descriptor.tab;
        if (
            effectiveRouteKind !== "single" ||
            !conflictId ||
            tab === active ||
            descriptor.disabled
        ) {
            return;
        }
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
        {#each LAYOUT_TABS as tab}
            {@const descriptor = getTabDescriptor(tab)}
            {#if descriptor.disabled}
                <button class="col ps-0 pe-0 btn {active === tab ? 'is-active' : ''}" disabled>
                    {TAB_LABELS[tab]}
                </button>
            {:else}
                <a
                    href={descriptor.href ?? undefined}
                    class="col ps-0 pe-0 btn {active === tab ? 'is-active' : ''}"
                    on:mouseenter={() => prefetchTab(descriptor)}
                    data-sveltekit-preload-code="hover"
                >
                    {TAB_LABELS[tab]}
                </a>
            {/if}
        {/each}
    {/if}

    {#each NON_LAYOUT_TABS as tab}
        {@const descriptor = getTabDescriptor(tab)}
        {#if descriptor.disabled}
            <button class="col ps-0 pe-0 btn {active === tab ? 'is-active' : ''}" disabled>
                {TAB_LABELS[tab]}
            </button>
        {:else}
            <a
                class="col ps-0 pe-0 btn {active === tab ? 'is-active' : ''}"
                href={descriptor.href ?? undefined}
                on:mouseenter={() => prefetchTab(descriptor)}
                data-sveltekit-preload-code="hover"
            >
                {TAB_LABELS[tab]}
            </a>
        {/if}
    {/each}
</div>
