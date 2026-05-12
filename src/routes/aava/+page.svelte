<script lang="ts">
    import "../../styles/conflict-shell.css";
    import "../../styles/conflict-widgets.css";
    import { browser } from "$app/environment";
    import { appConfig as config } from "$lib/appConfig";
    import { parseCompositeSelectionIds } from "$lib/conflictIds";
    import { startPerfSpan } from "$lib/perf";

    type AavaRouteClientComponent = typeof import("./AavaRouteClient.svelte").default;
    type PrefetchArtifactsModule = typeof import("$lib/prefetchArtifactsClient");

    let aavaRouteClientComponent: AavaRouteClientComponent | null = null;
    let routeClientLoadError: string | null = null;
    let routeClientLoadPromise: Promise<void> | null = null;
    let routePayloadWarmPromise: Promise<void> | null = null;
    let finishRouteClientLoadSpan: (() => void) | null = null;

    async function ensureAavaRouteClientLoaded(): Promise<void> {
        if (aavaRouteClientComponent) {
            return;
        }

        if (!routeClientLoadPromise) {
            finishRouteClientLoadSpan ??= startPerfSpan(
                "journey.conflict_to_aava.clientEntryLoad",
            );
            routeClientLoadPromise = import("./AavaRouteClient.svelte")
                .then((module) => {
                    aavaRouteClientComponent = module.default;
                    routeClientLoadError = null;
                })
                .catch((error) => {
                    console.error("Failed to load AAvA route client", error);
                    routeClientLoadError = "Could not load the AAvA route shell. Please retry.";
                })
                .finally(() => {
                    finishRouteClientLoadSpan?.();
                    finishRouteClientLoadSpan = null;
                    routeClientLoadPromise = null;
                });
        }

        await routeClientLoadPromise;
    }

    async function ensureAavaRoutePayloadWarmed(): Promise<void> {
        if (routePayloadWarmPromise) {
            return routePayloadWarmPromise;
        }

        routePayloadWarmPromise = import("$lib/prefetchArtifactsClient")
            .then((prefetchArtifacts: PrefetchArtifactsModule) => {
                const query = new URLSearchParams(window.location.search);
                const conflictId = (query.get("id") ?? "").trim();
                if (conflictId.length > 0) {
                    prefetchArtifacts.warmConflictPayload(conflictId, {
                        priority: "high",
                        reason: "route-aava-entry-payload",
                        routeTarget: "/aava",
                        intentStrength: "load",
                        crossRoute: false,
                    });
                    return;
                }

                const compositeIds = parseCompositeSelectionIds(query.get("ids")).ids;
                const rawAllianceId = (query.get("aid") ?? "").trim();
                const selectedAllianceId = /^\d+$/.test(rawAllianceId)
                    ? Number.parseInt(rawAllianceId, 10)
                    : null;

                if (compositeIds.length >= 2 && selectedAllianceId != null && selectedAllianceId > 0) {
                    prefetchArtifacts.warmCompositeContextArtifact({
                        ids: compositeIds,
                        aid: selectedAllianceId,
                        priority: "high",
                        reason: "route-aava-entry-composite-context",
                        routeTarget: "/aava",
                        intentStrength: "load",
                        crossRoute: false,
                    });
                }
            })
            .catch((error) => {
                console.warn("Failed to warm AAvA route payload", error);
            });

        await routePayloadWarmPromise;
    }

    function retryRouteClientLoad(): void {
        routeClientLoadError = null;
        void ensureAavaRouteClientLoaded();
    }

    if (browser) {
        void ensureAavaRoutePayloadWarmed();
        void ensureAavaRouteClientLoaded();
    }
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <title>AAvA Conflict</title>
</svelte:head>

{#if aavaRouteClientComponent}
    <svelte:component this={aavaRouteClientComponent} />
{:else}
    <div class="container-fluid p-2 ux-page-body aava-route-entry-shell" aria-busy="true">
        <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
            <div class="ux-page-title-stack">
                <span class="ux-page-title-main">AAvA Conflict</span>
                <span class="small text-muted">
                    Loading route controls and conflict context...
                </span>
            </div>
        </h1>

        <div class="row p-0 m-0 ux-tabstrip fw-bold">
            <button class="col ps-0 pe-0 btn" disabled>◑ Coalition</button>
            <button class="col ps-0 pe-0 btn" disabled>𖣯 Alliance</button>
            <button class="col ps-0 pe-0 btn" disabled>♟ Nation</button>
            <button class="col ps-0 pe-0 btn is-active" disabled>⚔️ AA vs AA</button>
            <button class="col ps-0 pe-0 btn" disabled>📊 Tier/Time</button>
            <button class="col ps-0 pe-0 btn" disabled>📈 Bubble/Time</button>
            <button class="col ps-0 pe-0 btn" disabled>🌐 Web</button>
        </div>

        <div
            class="ux-surface ux-tab-panel p-2 mb-2 aava-controls ux-floating-controls ux-compact-controls"
        >
            <div
                class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"
            >
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">AAvA Controls</span>
                    <button class="btn ux-btn btn-sm" disabled>Swap coalitions</button>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <button class="btn ux-btn btn-sm" disabled>KPI Builder</button>
                    <button class="btn ux-btn btn-sm" disabled>Copy Link</button>
                    <button class="btn ux-btn btn-sm" disabled>Reset</button>
                </div>
            </div>

            {#if routeClientLoadError}
                <div
                    class="alert alert-danger m-2 d-flex justify-content-between align-items-center"
                >
                    <span>{routeClientLoadError}</span>
                    <button
                        class="btn btn-sm btn-outline-danger fw-bold"
                        on:click={retryRouteClientLoad}
                    >
                        Retry
                    </button>
                </div>
            {/if}

            <div
                class="ux-progress-line"
                role="status"
                aria-label="Loading AAvA route"
                aria-live="polite"
            >
                <div class="ux-progress-line-track"></div>
                <div class="ux-progress-line-bar"></div>
            </div>

            <div class="row g-2 mt-2">
                <div class="col-md-6">
                    <div
                        class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red aava-route-entry-shell__panel"
                    >
                        <div class="mb-2">
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <span class="fw-bold">Header: wars</span>
                                <button class="btn ux-btn btn-sm" type="button" disabled>
                                    Loading header picker...
                                </button>
                            </div>
                        </div>
                        <div
                            class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1"
                        >
                            <strong>
                                <span class="badge text-bg-danger ms-1">Selected coalition</span>
                            </strong>
                        </div>
                        <div class="small ux-muted">
                            Use "Edit alliances" to search, bulk-select, or
                            clear coalition alliances.
                        </div>
                        <div class="mt-2">
                            <button class="btn ux-btn btn-sm" type="button" disabled>
                                Loading alliances...
                            </button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div
                        class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--blue aava-route-entry-shell__panel"
                    >
                        <div
                            class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1"
                        >
                            <strong>
                                <span class="badge text-bg-primary ms-1">Compared coalition</span>
                            </strong>
                        </div>
                        <div class="small ux-muted">
                            Use "Edit alliances" to search, bulk-select, or
                            clear coalition alliances.
                        </div>
                        <div class="mt-2">
                            <button class="btn ux-btn btn-sm" type="button" disabled>
                                Loading alliances...
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="small text-muted mt-2">
                wars counts wars where each side was the attacker/initiator.
                Each row is one alliance from the Compared coalition. "Net" = Selected
                value minus Compared value (positive favours Selected).
            </div>
        </div>

        <div class="ux-surface aava-route-entry-shell__table small text-muted">
            Preparing AAvA table...
        </div>
    </div>
{/if}

<style>
    .aava-route-entry-shell__panel {
        min-height: 10rem;
    }

    .aava-route-entry-shell__table {
        min-height: 20rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
    }
</style>
