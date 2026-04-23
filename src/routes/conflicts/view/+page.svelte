<script lang="ts">
    import "../../../styles/conflict-shell.css";
    import { browser } from "$app/environment";
    import { base } from "$app/paths";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import Breadcrumbs from "../../../components/Breadcrumbs.svelte";
    import ColumnPresetManager from "../../../components/ColumnPresetManager.svelte";
    import ConflictRouteTabs from "../../../components/ConflictRouteTabs.svelte";
    import Progress from "../../../components/Progress.svelte";
    import ShareResetBar from "../../../components/ShareResetBar.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import { createCompositeConflictGridSession } from "$lib/compositeConflictGrid/session";
    import type {
        CompositeConflictGridClient,
        CompositeConflictGridSession,
    } from "$lib/compositeConflictGrid/types";
    import { createConflictGridProvider } from "$lib/conflictGrid/conflictGridProvider";
    import DataGrid from "$lib/grid/DataGrid.svelte";
    import {
        parseGridPageSizeQueryState,
        serializeGridPageSizeQueryState,
    } from "$lib/grid/queryState";
    import { modalWithCloseButton } from "$lib/modals";
    import { recordPerfSpan } from "$lib/perf";
    import {
        decodeQueryParamValue,
        getCurrentQueryParams,
        setQueryParams,
    } from "$lib/queryState";
    import {
        applySavedQueryParamsIfMissing,
        getCompositeContextStorageScope,
        getScopedPageStorageKey,
        saveCurrentQueryParams,
    } from "$lib/queryStorage";
    import { encodeCompositeSelectionIds } from "$lib/conflictIds";
    import type { CompositeMergeDiagnostics } from "$lib/compositeMerge";
    import {
        normalizeConflictLayoutColumns,
        parseConflictLayoutQuery,
        serializeConflictLayoutQuery,
    } from "$lib/conflictLayoutQueryState";
    import {
        layoutTabFromIndex,
    } from "$lib/conflictTabs";
    import type { ColumnPreset } from "$lib/columnPresets";
    import type { GridPageSize, GridQueryState } from "$lib/grid/types";
    import { yieldToMain } from "$lib/misc";
    import {
        CONFLICT_TABLE_LAYOUT_PRESETS,
        CONFLICT_TABLE_LAYOUT_PRESET_KEYS,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY,
        createDefaultConflictTableLayoutState,
        detectConflictTableLayoutPresetKey,
        isConflictTableDefaultPresetState,
        isConflictTableLayoutStateEqual,
    } from "$lib/conflictTablePresets";

    const Layout = {
        COALITION: 0,
        ALLIANCE: 1,
        NATION: 2,
    } as const;

    const layoutPresets = CONFLICT_TABLE_LAYOUT_PRESETS;
    const layoutPresetKeys = CONFLICT_TABLE_LAYOUT_PRESET_KEYS;

    export let data: {
        conflictIds: string[];
        invalidTokens: string[];
        limited: boolean;
        signature: string;
        selectedAllianceId: number | null;
    };

    let loading = true;
    let loadError: string | null = null;
    let loadErrorDetails: string[] = [];
    let mergeWarnings: string[] = [];
    let resolvedConflictIds: string[] = [];
    let failedConflictIds: string[] = [];

    let selectedAllianceId: number | null = data.selectedAllianceId;
    let selectedAllianceIdValue = selectedAllianceId == null ? "" : String(selectedAllianceId);
    let allianceOptions: Array<{ id: number; name: string }> = [];
    let defaultAllianceId: number | null = null;

    let compositeGridSession: CompositeConflictGridSession | null = null;
    let compositeGridClient: CompositeConflictGridClient | null = null;
    let compositeGridProvider = null;
    let compositeGridPageSizePreference: GridPageSize | null = null;
    let compositeGridInitialState: Partial<GridQueryState> | null = null;
    let compositeGridResetVersion = 0;
    let mergeDiagnostics: CompositeMergeDiagnostics | null = null;
    let mergeRequestId = 0;

    let layoutState = createDefaultConflictTableLayoutState();
    let selectedLayoutPresetKey: string | null = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;
    let lastParsedUrlSearch = "";

    $: compositeTabCapabilities = {
        aava: mergeDiagnostics ? mergeDiagnostics.aavaCapable : true,
        tiering: false,
        bubble: false,
        chord: false,
    };

    $: preservedLayoutQuery = serializeConflictLayoutQuery(layoutState);

    $: {
        const detectedKey = detectConflictTableLayoutPresetKey(layoutState);
        if (selectedLayoutPresetKey !== detectedKey) {
            selectedLayoutPresetKey = detectedKey;
        }
    }

    $: {
        if (browser) {
            const nextSearch = $page.url.search;
            if (nextSearch !== lastParsedUrlSearch) {
                lastParsedUrlSearch = nextSearch;
                parseLayoutFromQuery($page.url.searchParams);
            }
        }
    }

    $: compositeGridProvider =
        compositeGridClient == null
            ? null
            : createConflictGridProvider({
                  client: compositeGridClient,
                  layout: layoutState.layout,
                  defaultSort: {
                      key: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                      dir: "desc",
                  },
                  defaultVisibleColumnKeys: normalizeConflictLayoutColumns(
                      layoutState.layout,
                      DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns,
                  ),
              });

    function scopedStorageKey(aid: number | null): string {
        return getScopedPageStorageKey(
            window.location.pathname,
            getCompositeContextStorageScope(data.conflictIds, aid),
        );
    }

    function setLoadError(message: string, details: string[] = []): void {
        loadError = message;
        loadErrorDetails = details;
    }

    function clearLoadError(): void {
        loadError = null;
        loadErrorDetails = [];
    }

    function buildCompositeGridInitialState(): Partial<GridQueryState> {
        const normalizedColumns = normalizeConflictLayoutColumns(
            layoutState.layout,
            layoutState.columns,
        );
        return {
            sort: {
                key: layoutState.sort,
                dir: layoutState.order,
            },
            visibleColumnKeys: [...normalizedColumns],
            columnOrderKeys: [...normalizedColumns],
            pageIndex: 0,
            pageSize: compositeGridPageSizePreference ?? 10,
            filters: {},
            expandedRowIds: [],
            selectedRowIds: [],
        };
    }

    function resetCompositeGridState(): void {
        compositeGridInitialState = buildCompositeGridInitialState();
        compositeGridResetVersion += 1;
    }

    function parseLayoutFromQuery(query: URLSearchParams): void {
        const nextLayoutState = parseConflictLayoutQuery(query, {
            layout: Layout.COALITION,
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
        });
        layoutState = nextLayoutState;
    }

    function queryDefaults() {
        return {
            layout: "coalition",
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns.join("."),
        };
    }

    function currentCompositeStorageKey(): string | null {
        if (!browser) return null;
        return scopedStorageKey(selectedAllianceId);
    }

    function syncQueryAndStorage(replace = true): void {
        const ids = encodeCompositeSelectionIds(data.conflictIds);
        const serializedLayout = serializeConflictLayoutQuery(layoutState);
        setQueryParams(
            {
                ids,
                aid: selectedAllianceId,
                grid: serializeGridPageSizeQueryState(compositeGridPageSizePreference),
                ...serializedLayout,
            },
            {
                replace,
                defaults: queryDefaults(),
            },
        );
        saveCurrentQueryParams(scopedStorageKey(selectedAllianceId));
    }

    function isSameLayoutState(input: {
        sort: string;
        order: string;
        columns: string[];
    }): boolean {
        return isConflictTableLayoutStateEqual(layoutState, {
            sort: input.sort,
            order: input.order === "asc" ? "asc" : "desc",
            columns: input.columns,
        });
    }

    function handleLayoutSelect(layout: number): void {
        layoutState.layout =
            layout === Layout.ALLIANCE
                ? Layout.ALLIANCE
                : layout === Layout.NATION
                  ? Layout.NATION
                  : Layout.COALITION;
        layoutState.columns = normalizeConflictLayoutColumns(
            layoutState.layout,
            layoutState.columns,
        );
        resetCompositeGridState();
        syncQueryAndStorage(true);
    }

    function applyLayoutPresetKey(key: string): void {
        const preset = layoutPresets[key];
        if (!preset) return;
        const nextOrder: "asc" | "desc" = preset.order === "asc" ? "asc" : "desc";
        const nextColumns = normalizeConflictLayoutColumns(
            layoutState.layout,
            preset.columns,
        );
        if (
            isSameLayoutState({
                sort: preset.sort,
                order: nextOrder,
                columns: nextColumns,
            })
        ) {
            return;
        }

        layoutState.columns = nextColumns;
        layoutState.sort = preset.sort;
        layoutState.order = nextOrder;
        selectedLayoutPresetKey = key;
        resetCompositeGridState();
        syncQueryAndStorage(true);
    }

    function handleColumnPresetLoad(preset: ColumnPreset): void {
        const nextSort = preset.sort || layoutState.sort;
        const nextOrder: "asc" | "desc" =
            preset.order === "asc"
                ? "asc"
                : preset.order === "desc"
                  ? "desc"
                  : layoutState.order;
        const nextColumns = Array.isArray(preset.columns)
            ? normalizeConflictLayoutColumns(layoutState.layout, preset.columns)
            : normalizeConflictLayoutColumns(layoutState.layout, layoutState.columns);

        const noLayoutChange = isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
        });

        layoutState.columns = nextColumns;
        layoutState.sort = nextSort;
        layoutState.order = nextOrder;
        selectedLayoutPresetKey = detectConflictTableLayoutPresetKey(layoutState);
        resetCompositeGridState();

        if (!noLayoutChange) {
            syncQueryAndStorage(true);
        }
    }

    function prepareShareLink(): void {
        syncQueryAndStorage(true);
    }

    function openWarningsModal(): void {
        if (mergeWarnings.length === 0) return;

        const wrapper = document.createElement("div");
        wrapper.className = "overflow-auto";
        wrapper.style.maxHeight = "60vh";
        const list = document.createElement("ul");
        list.className = "mb-0";

        for (const warning of mergeWarnings) {
            const item = document.createElement("li");
            item.textContent = warning;
            list.appendChild(item);
        }

        wrapper.appendChild(list);
        modalWithCloseButton(`Composite merge warnings (${mergeWarnings.length})`, wrapper);
    }

    async function prewarmCompositeSecondaryLayouts(
        client: NonNullable<typeof compositeGridClient>,
        activeLayout: number,
        requestId: number,
    ): Promise<void> {
        await yieldToMain();
        if (requestId !== mergeRequestId) return;
        if (compositeGridClient !== client) return;

        const deferredLayouts = [Layout.COALITION, Layout.ALLIANCE, Layout.NATION].filter(
            (layout) => layout !== activeLayout,
        );
        if (deferredLayouts.length === 0) return;

        try {
            await client.prewarmLayouts(deferredLayouts);
        } catch {
            // Prewarm is opportunistic; route bootstrap already succeeded.
        }
    }

    function destroyCompositeClient(): void {
        compositeGridClient?.destroy();
        compositeGridClient = null;
    }

    function destroyCompositeSession(): void {
        compositeGridSession?.destroy();
        compositeGridSession = null;
    }

    async function beginCompositeBootstrap(syncQuery = true): Promise<void> {
        destroyCompositeClient();
        mergeDiagnostics = null;
        mergeWarnings = [];
        clearLoadError();

        const selectedAid = selectedAllianceId;
        const session = compositeGridSession;
        if (!selectedAid || !session) {
            setLoadError("Select an alliance to build a composite conflict.");
            return;
        }

        const requestId = ++mergeRequestId;
        const client = session.createClient(selectedAid);
        compositeGridClient = client;
        resetCompositeGridState();

        try {
            const payload = await client.bootstrap(layoutState.layout);
            if (requestId !== mergeRequestId) {
                client.destroy();
                return;
            }

            if (payload.timings.datasetCreateMs > 0) {
                recordPerfSpan("conflictGrid.dataset.create", payload.timings.datasetCreateMs, {
                    routeTarget: "/conflicts/view",
                    source: "worker",
                    conflictId: data.signature,
                });
            }
            if (payload.timings.layoutBootstrapMs > 0) {
                recordPerfSpan(
                    "conflictGrid.bootstrap.layout",
                    payload.timings.layoutBootstrapMs,
                    {
                        routeTarget: "/conflicts/view",
                        source: "worker",
                        conflictId: data.signature,
                        layout: layoutState.layout,
                        datasetCreated: payload.timings.datasetCreateMs > 0,
                    },
                );
            }

            mergeDiagnostics = payload.composite.diagnostics;
            mergeWarnings = [...payload.composite.warnings];
            resolvedConflictIds = [...payload.composite.resolvedConflictIds];
            failedConflictIds = [...payload.composite.failedConflictIds];
            clearLoadError();
            if (syncQuery) {
                syncQueryAndStorage(true);
            }
            void prewarmCompositeSecondaryLayouts(
                client,
                layoutState.layout,
                requestId,
            );
        } catch (error: unknown) {
            if (requestId !== mergeRequestId) return;
            destroyCompositeClient();
            const message = error instanceof Error
                ? error.message
                : "Failed to build composite conflict.";
            const details = Array.isArray((error as { details?: unknown })?.details)
                ? ((error as { details?: string[] }).details as string[])
                : [];
            setLoadError(message, details);
        }
    }

    function handleAllianceChange(): void {
        const value = Number(selectedAllianceIdValue);
        selectedAllianceId = Number.isFinite(value) && value > 0 ? value : null;
        if (selectedAllianceId == null) return;
        void beginCompositeBootstrap(true);
    }

    function resetCompositeView(): void {
        layoutState = createDefaultConflictTableLayoutState();
        selectedLayoutPresetKey = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;

        selectedAllianceId = defaultAllianceId ?? allianceOptions[0]?.id ?? selectedAllianceId;
        selectedAllianceIdValue = selectedAllianceId == null ? "" : String(selectedAllianceId);
        compositeGridPageSizePreference = null;
        resetCompositeGridState();
        void beginCompositeBootstrap(true);
    }

    const isResetDirty = () => {
        return (
            !isConflictTableDefaultPresetState(layoutState) ||
            selectedAllianceId !== defaultAllianceId ||
            compositeGridPageSizePreference != null
        );
    };

    function handleCompositeGridStateChange(
        event: CustomEvent<{ state: GridQueryState }>,
    ): void {
        const state = event.detail.state;
        const visible = new Set(state.visibleColumnKeys);
        const orderedVisible = state.columnOrderKeys.filter((key) => visible.has(key));
        const nextColumns = normalizeConflictLayoutColumns(
            layoutState.layout,
            orderedVisible.length > 0 ? orderedVisible : layoutState.columns,
        );
        const nextSort = state.sort?.key ?? DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort;
        const nextOrder: "asc" | "desc" = state.sort?.dir === "asc" ? "asc" : "desc";
        const nextPageSize = state.pageSize === 10 ? null : state.pageSize;
        const layoutChanged = !isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
        });

        if (!layoutChanged && compositeGridPageSizePreference === nextPageSize) {
            return;
        }

        if (layoutChanged) {
            layoutState.columns = nextColumns;
            layoutState.sort = nextSort;
            layoutState.order = nextOrder;
            selectedLayoutPresetKey = detectConflictTableLayoutPresetKey(layoutState);
        }

        compositeGridPageSizePreference = nextPageSize;
        syncQueryAndStorage(true);
    }

    onMount(() => {
        applySavedQueryParamsIfMissing(
            ["aid", "layout", "sort", "order", "columns", "grid"],
            ["ids"],
            scopedStorageKey(data.selectedAllianceId),
        );

        const query = getCurrentQueryParams();
        parseLayoutFromQuery(query);
        compositeGridPageSizePreference = parseGridPageSizeQueryState(
            decodeQueryParamValue("grid", query.get("grid")),
        );

        const session = createCompositeConflictGridSession({
            signature: data.signature,
            conflictIds: data.conflictIds,
            version: String(config.version.conflict_data),
        });
        compositeGridSession = session;

        void session
            .resolve()
            .then((resolved) => {
                if (compositeGridSession !== session) return;

                resolvedConflictIds = [...resolved.resolvedConflictIds];
                failedConflictIds = [...resolved.failedConflictIds];

                if (resolved.resolvedConflictIds.length < 2) {
                    setLoadError(
                        "At least two conflicts must load successfully to build a composite conflict.",
                    );
                    return;
                }

                allianceOptions = [...resolved.allianceOptions];
                if (allianceOptions.length === 0) {
                    setLoadError(
                        "No alliance appears across all selected conflicts, so a composite conflict cannot be built.",
                        resolved.noCommonAllianceDetails,
                    );
                    return;
                }

                if (
                    selectedAllianceId == null ||
                    !allianceOptions.some((option) => option.id === selectedAllianceId)
                ) {
                    selectedAllianceId = resolved.defaultAllianceId;
                }
                selectedAllianceIdValue = selectedAllianceId == null ? "" : String(selectedAllianceId);
                defaultAllianceId = selectedAllianceId;

                void beginCompositeBootstrap(true);
            })
            .catch((error) => {
                console.error("Failed to initialize composite merge", error);
                setLoadError("Failed to load selected conflicts for composite merge.");
            })
            .finally(() => {
                if (compositeGridSession === session) {
                    loading = false;
                }
            });
    });

    onDestroy(() => {
        destroyCompositeClient();
        destroyCompositeSession();
    });
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <title>Composite Conflict View</title>
</svelte:head>

<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: `${base}/` },
                    { label: "Conflicts", href: `${base}/conflicts` },
                    { label: "Composite" },
                ]}
            />
            <span class="ux-page-title-main">Composite Conflicts</span>
        </div>
    </h1>

    {#if loading}
        <Progress />
    {:else}
        <div class="ux-surface p-2 mb-2 d-flex flex-wrap align-items-center gap-2">
            <label class="fw-bold" for="composite-alliance">Friendly alliance:</label>
            <select
                id="composite-alliance"
                class="form-select form-select-sm fw-bold"
                style="width: auto; min-width: 16rem;"
                bind:value={selectedAllianceIdValue}
                on:change={handleAllianceChange}
            >
                {#each allianceOptions as option}
                    <option value={String(option.id)}>{option.name}</option>
                {/each}
            </select>

            <span class="ux-muted ms-2">
                Conflicts loaded: {resolvedConflictIds.length}/{data.conflictIds.length}
            </span>
        </div>

        {#if data.invalidTokens.length > 0}
            <div class="alert alert-warning py-2">
                Ignored invalid conflict IDs: {data.invalidTokens.join(", ")}
            </div>
        {/if}

        {#if data.limited}
            <div class="alert alert-warning py-2">
                Composite selection was limited to the first {data.conflictIds.length} unique conflicts.
            </div>
        {/if}

        {#if failedConflictIds.length > 0}
            <div class="alert alert-warning py-2">
                Some conflicts failed to load and were skipped: {failedConflictIds.join(", ")}
            </div>
        {/if}

        {#if loadError}
            <div class="alert alert-danger py-2">
                <div class="fw-bold">{loadError}</div>
                {#if loadErrorDetails.length > 0}
                    <ul class="mb-0 mt-1">
                        {#each loadErrorDetails as detail}
                            <li>{detail}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {:else if compositeGridProvider}
            <ConflictRouteTabs
                conflictId={null}
                active={layoutTabFromIndex(layoutState.layout)}
                mode="layout-picker"
                routeKind="composite"
                compositeIds={data.conflictIds}
                {selectedAllianceId}
                capabilities={compositeTabCapabilities}
                preservedQuery={preservedLayoutQuery}
                currentLayout={layoutState.layout}
                onLayoutSelect={handleLayoutSelect}
            />

            <ul
                class="layout-picker-bar ux-floating-controls nav nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
            >
                <li class="d-flex align-items-center gap-2 me-1 flex-wrap">
                    <span>Layout Picker:</span>
                    <div class="d-flex flex-wrap gap-1">
                        {#each layoutPresetKeys as key}
                            <button
                                class="btn btn-sm ux-layout-preset-button"
                                class:is-active={selectedLayoutPresetKey === key}
                                on:click={() => applyLayoutPresetKey(key)}>{key}</button
                            >
                        {/each}
                    </div>
                </li>

                <li>
                    <ColumnPresetManager
                        currentColumns={layoutState.columns}
                        currentSort={layoutState.sort}
                        currentOrder={layoutState.order}
                        currentKpis={[]}
                        currentKpiConfig={null}
                        storageKey={currentCompositeStorageKey()}
                        on:load={(event) => handleColumnPresetLoad(event.detail.preset)}
                    />
                </li>

                <li class="ms-auto d-flex flex-wrap gap-1 justify-content-end">
                    <ShareResetBar
                        onReset={resetCompositeView}
                        onSharePrepare={prepareShareLink}
                        resetDirty={isResetDirty()}
                    />
                </li>
            </ul>

            {#if mergeWarnings.length > 0}
                <div class="alert alert-warning py-2 mt-2">
                    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                        <div class="fw-bold mb-0">Merge warnings detected.</div>
                        <button class="btn btn-warning btn-sm fw-bold" type="button" on:click={openWarningsModal}>
                            {mergeWarnings.length} warning{mergeWarnings.length === 1 ? "" : "s"}
                        </button>
                    </div>
                </div>
            {/if}

            <div class="alert alert-info py-2 mt-2">
                Composite graph tabs are disabled until merged graph data is available.
            </div>

            {#if mergeDiagnostics && !mergeDiagnostics.aavaCapable}
                <div class="alert alert-warning py-2 mt-2">
                    AA vs AA is disabled: {mergeDiagnostics.aavaIncompatibilities.join(" ")}
                </div>
            {/if}

            {#if mergeDiagnostics}
                <div class="ux-surface p-2 mb-2">
                    <div class="fw-bold">Composite summary</div>
                    <div class="ux-muted">
                        Friendly alliance: {mergeDiagnostics.selectedAllianceName} ({mergeDiagnostics.selectedAllianceId})
                    </div>
                    <div class="ux-muted">
                        Included conflicts: {mergeDiagnostics.mergedConflictIds.join(", ")}
                    </div>
                </div>
            {/if}

            {#if compositeGridProvider && compositeGridInitialState}
                <DataGrid
                    provider={compositeGridProvider}
                    initialState={compositeGridInitialState}
                    resetKey={`${data.signature}:${layoutState.layout}:${compositeGridResetVersion}`}
                    exportBaseFileName={`composite-${data.signature}`}
                    exportDatasetKey="composite"
                    exportDatasetLabel="Composite conflict"
                    exportButtonLabel="Export"
                    emptyMessage="No rows match the current composite layout."
                    loadingMessage="Loading composite conflict table..."
                    caption="Composite conflict grid"
                    on:stateChange={handleCompositeGridStateChange}
                />
            {/if}
        {/if}
    {/if}
</div>
