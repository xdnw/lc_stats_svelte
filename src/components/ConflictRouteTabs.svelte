<script lang="ts">
    import { browser } from "$app/environment";
    import { base } from "$app/paths";
    import {
        promoteArtifactTarget,
        warmBubbleDefaultArtifact,
        warmConflictGraphPayload,
        warmConflictPayload,
        warmConflictTableArtifact,
        warmRuntimeArtifact,
        warmTieringDefaultArtifact,
    } from "$lib/prefetchArtifacts";
    import { beginJourneySpan } from "$lib/perf";
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
    export let preservedQuery: Record<string, string | null | undefined> | null = null;

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
    ) {
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

        const isStrongIntent = intentStrength === "pointerdown";
        const primaryPriority = "high";
        const runtimePriority = isStrongIntent ? "high" : "idle";

        if (tab === "bubble") {
            warmConflictGraphPayload(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-bubble-graph-payload`,
                routeTarget: "/bubble",
                intentStrength,
            });
            warmBubbleDefaultArtifact(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-bubble-default-trace`,
                routeTarget: "/bubble",
                intentStrength,
            });
            warmRuntimeArtifact("plotly", {
                priority: runtimePriority,
                reason: `tabs-${intentStrength}-bubble-runtime`,
                routeTarget: "/bubble",
                intentStrength,
            });
        } else if (tab === "tiering") {
            warmConflictGraphPayload(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-tiering-graph-payload`,
                routeTarget: "/tiering",
                intentStrength,
            });
            warmTieringDefaultArtifact(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-tiering-default-dataset`,
                routeTarget: "/tiering",
                intentStrength,
            });
        } else {
            warmConflictPayload(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-${tab}-payload`,
                routeTarget: tab === "chord" ? "/chord" : tab === "aava" ? "/aava" : "/conflict",
                intentStrength,
            });
            warmConflictTableArtifact(conflictId, {
                priority: primaryPriority,
                reason: `tabs-${intentStrength}-${tab}-table`,
                routeTarget: "/conflict",
                intentStrength,
            });
            if (tab === "coalition" || tab === "alliance" || tab === "nation") {
                warmRuntimeArtifact("table", {
                    priority: runtimePriority,
                    reason: `tabs-${intentStrength}-table-runtime`,
                    routeTarget: "/conflict",
                    intentStrength,
                });
            }
        }

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
            : descriptor.tab === "tiering"
              ? "/tiering"
              : descriptor.tab === "chord"
                ? "/chord"
                : descriptor.tab === "aava"
                  ? "/aava"
                  : "/conflict";
        promoteArtifactTarget(target);
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
