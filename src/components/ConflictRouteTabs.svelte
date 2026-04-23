<script lang="ts">
    import { browser } from "$app/environment";
    import { base } from "$app/paths";
    import { beginJourneySpan } from "$lib/perf";
    import {
        CONFLICT_LAYOUT_TAB_INDEX,
        buildConflictTabDescriptors,
        type ConflictLayoutTab,
        type ConflictRouteKind,
        type ConflictTab,
        type ConflictTabCapabilities,
        type ConflictTabDescriptor,
    } from "$lib/conflictTabs";
    import type { ConflictReturnQuery } from "$lib/conflictReturnQuery";

    type PrefetchArtifactsModule = typeof import("$lib/prefetchArtifactsClient");

    let prefetchArtifactsPromise: Promise<PrefetchArtifactsModule> | null = null;

    function loadPrefetchArtifacts(): Promise<PrefetchArtifactsModule> {
        if (!prefetchArtifactsPromise) {
            prefetchArtifactsPromise = import("$lib/prefetchArtifactsClient");
        }

        return prefetchArtifactsPromise;
    }

    function withPrefetchArtifacts(
        work: (module: PrefetchArtifactsModule) => void,
    ): void {
        void loadPrefetchArtifacts()
            .then(work)
            .catch((error) => {
                console.warn("Failed to load conflict tab prefetch helpers", error);
            });
    }

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
    export let preservedQuery: ConflictReturnQuery | null = null;

    const LAYOUT_TABS: ConflictLayoutTab[] = ["coalition", "alliance", "nation"];
    const NON_LAYOUT_TABS: Array<Exclude<ConflictTab, ConflictLayoutTab>> = [
        "aava",
        "metric-time",
        "tiering",
        "bubble",
        "chord",
    ];

    const TAB_LABELS: Record<ConflictTab, string> = {
        coalition: "◑ Coalition",
        alliance: "𖣯 Alliance",
        nation: "♟ Nation",
        aava: "⚔️ AA vs AA",
        "metric-time": "⏱ Metric/Time",
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

    function readConflictIdFromLocation(): string | null {
        if (!browser) return null;
        const rawId = new URLSearchParams(window.location.search).get("id");
        const trimmed = rawId?.trim() ?? "";
        return trimmed.length > 0 ? trimmed : null;
    }

    $: effectiveConflictId =
        (conflictId?.trim() ? conflictId.trim() : null) ??
        (effectiveRouteKind === "single" ? readConflictIdFromLocation() : null);

    $: tabDescriptors = buildConflictTabDescriptors({
        activeTab: active,
        routeKind: effectiveRouteKind,
        capabilities,
        hrefContext: {
            routeKind: effectiveRouteKind,
            conflictId: effectiveConflictId,
            compositeIds,
            selectedAllianceId,
            basePath: base,
            preservedQuery,
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

    function prefetchTab(
        descriptor: ConflictTabDescriptor,
        intentStrength: "hover" | "focus" | "pointerdown",
    ): void {
        const tab = descriptor.tab;
        if (
            effectiveRouteKind !== "single" ||
            !effectiveConflictId ||
            tab === active ||
            descriptor.disabled
        ) {
            return;
        }

        const conflictId = effectiveConflictId;
        if (!conflictId) return;

        const primaryPriority = "high";

        withPrefetchArtifacts((prefetchArtifacts) => {
            if (LAYOUT_TABS.includes(tab as ConflictLayoutTab)) {
                prefetchArtifacts.warmConflictRouteArtifacts(conflictId, {
                    layouts: [CONFLICT_LAYOUT_TAB_INDEX[tab as ConflictLayoutTab]],
                    priority: primaryPriority,
                    reasonBase: `tabs-${intentStrength}-conflict`,
                    routeTarget: "/conflict",
                    intentStrength,
                });
                return;
            }

            if (tab === "bubble") {
                prefetchArtifacts.warmBubbleRouteArtifacts(conflictId, {
                    priority: primaryPriority,
                    reasonBase: `tabs-${intentStrength}-bubble`,
                    routeTarget: "/bubble",
                    intentStrength,
                });
            } else if (tab === "tiering") {
                prefetchArtifacts.warmTieringRouteArtifacts(conflictId, {
                    priority: primaryPriority,
                    reasonBase: `tabs-${intentStrength}-tiering`,
                    routeTarget: "/tiering",
                    intentStrength,
                });
            } else if (tab === "metric-time") {
                prefetchArtifacts.warmMetricTimeRouteArtifacts(conflictId, {
                    priority: primaryPriority,
                    reasonBase: `tabs-${intentStrength}-metric-time`,
                    routeTarget: "/metric-time",
                    intentStrength,
                });
            } else if (tab === "aava" || tab === "chord") {
                prefetchArtifacts.warmConflictPayload(conflictId, {
                    priority: primaryPriority,
                    reason: `tabs-${intentStrength}-${tab}-payload`,
                    routeTarget: tab === "chord" ? "/chord" : "/aava",
                    intentStrength,
                });
            }
        });

        if (tab === "bubble") {
            beginJourneySpan("journey.conflict_to_bubble.firstMount", {
                conflictId: effectiveConflictId,
                trigger: "tab-intent",
            });
        }
    }

    function promoteTabTarget(descriptor: ConflictTabDescriptor): void {
        if (descriptor.disabled) return;
        const target = descriptor.tab === "bubble"
            ? "/bubble"
            : descriptor.tab === "metric-time"
              ? "/metric-time"
            : descriptor.tab === "tiering"
              ? "/tiering"
              : descriptor.tab === "chord"
                ? "/chord"
                : descriptor.tab === "aava"
                  ? "/aava"
                  : "/conflict";

        withPrefetchArtifacts((prefetchArtifacts) => {
            prefetchArtifacts.promoteArtifactTarget(target);
        });
    }

    function onTabHover(descriptor: ConflictTabDescriptor): void {
        prefetchTab(descriptor, "hover");
    }

    function onTabFocus(descriptor: ConflictTabDescriptor): void {
        prefetchTab(descriptor, "focus");
    }

    function onTabPointerDown(descriptor: ConflictTabDescriptor): void {
        promoteTabTarget(descriptor);
        prefetchTab(descriptor, "pointerdown");
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
                    on:mouseenter={() => onTabHover(descriptor)}
                    on:focus={() => onTabFocus(descriptor)}
                    on:pointerdown={() => onTabPointerDown(descriptor)}
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
                on:mouseenter={() => onTabHover(descriptor)}
                on:focus={() => onTabFocus(descriptor)}
                on:pointerdown={() => onTabPointerDown(descriptor)}
                data-sveltekit-preload-code="hover"
            >
                {TAB_LABELS[tab]}
            </a>
        {/if}
    {/each}
</div>

<style>
    :global(.ux-tabstrip) {
        display: flex;
        flex-wrap: nowrap;
        overflow: visible;
        margin-top: 0;
        gap: 0;
        margin-bottom: -1px;
    }

    :global(.ux-tabstrip .btn),
    :global(.ux-tabstrip a.btn) {
        flex: 1 1 0 !important;
        min-width: 0;
        color: var(--ux-text) !important;
        background: color-mix(in srgb, var(--ux-surface-alt) 94%, transparent);
        border: 1px solid var(--ux-border) !important;
        min-height: 2rem;
        margin: 0;
        padding: 0.32rem 0.32rem !important;
        font-size: var(--ux-text-md) !important;
        line-height: 1.15 !important;
        white-space: nowrap;
        border-radius: 0 !important;
        box-shadow: none !important;
        font-weight: 600 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
    }

    :global(.ux-tabstrip .btn.is-active),
    :global(.ux-tabstrip a.btn.is-active),
    :global(.ux-tabstrip .btn.border-bottom-0),
    :global(.ux-tabstrip a.btn.border-bottom-0),
    :global(.ux-tabstrip .btn.bg-light-subtle),
    :global(.ux-tabstrip a.btn.bg-light-subtle) {
        color: var(--ux-text) !important;
        background: var(--ux-surface) !important;
        border-color: var(--ux-border) !important;
        border-bottom-color: var(--ux-surface) !important;
        box-shadow: inset 0 2px 0 color-mix(in srgb, var(--ux-brand) 28%, transparent) !important;
        font-weight: 600 !important;
        position: relative;
        z-index: 2;
    }

    :global(.ux-tabstrip .btn.border-bottom-0),
    :global(.ux-tabstrip a.btn.border-bottom-0),
    :global(.ux-tabstrip .btn.is-active),
    :global(.ux-tabstrip a.btn.is-active) {
        border-bottom-width: 1px !important;
    }

    :global(html[data-bs-theme="dark"] .ux-tabstrip .btn.is-active),
    :global(html[data-bs-theme="dark"] .ux-tabstrip a.btn.is-active),
    :global(html[data-bs-theme="dark"] .ux-tabstrip .btn.border-bottom-0),
    :global(html[data-bs-theme="dark"] .ux-tabstrip a.btn.border-bottom-0),
    :global(html[data-bs-theme="dark"] .ux-tabstrip .btn.bg-light-subtle),
    :global(html[data-bs-theme="dark"] .ux-tabstrip a.btn.bg-light-subtle) {
        background: color-mix(in srgb, var(--ux-surface) 90%, transparent) !important;
        border-bottom-color: color-mix(in srgb, var(--ux-surface) 90%, transparent) !important;
        box-shadow: inset 0 2px 0 color-mix(in srgb, var(--ux-brand) 26%, transparent) !important;
    }

    :global(.ux-tabstrip .btn:not(.is-active):hover),
    :global(.ux-tabstrip a.btn:not(.is-active):hover) {
        background: color-mix(in srgb, var(--ux-brand) 10%, var(--ux-surface-alt)) !important;
    }

    :global(.ux-tabstrip .btn:focus-visible),
    :global(.ux-tabstrip a.btn:focus-visible) {
        box-shadow: inset 0 2px 0 color-mix(in srgb, var(--ux-brand) 24%, transparent),
            0 0 0 0.12rem color-mix(in srgb, var(--ux-brand) 18%, transparent) !important;
    }

    :global(.ux-tabstrip + .ux-surface),
    :global(.ux-tabstrip + ul.ux-surface),
    :global(.ux-tabstrip + div.ux-surface) {
        border-top: 0 !important;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }

    :global(.ux-tab-panel) {
        border-top: 1px solid var(--ux-border) !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
        background: color-mix(in srgb, var(--ux-surface) 95%, transparent);
    }

    @media (max-width: 768px) {
        :global(.ux-tabstrip) {
            flex-wrap: wrap;
            gap: 0.2rem;
            margin-bottom: 0.2rem;
        }

        :global(.ux-tabstrip > .btn),
        :global(.ux-tabstrip > a.btn) {
            flex: 1 1 calc(50% - 0.2rem) !important;
            min-width: 0;
            font-size: 0.82rem;
            white-space: normal;
            text-align: center;
            padding: 0.28rem 0.32rem !important;
            border-radius: 0 !important;
        }
    }
</style>
