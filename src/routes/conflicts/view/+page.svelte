<script lang="ts">
    import { browser } from "$app/environment";
    import { base } from "$app/paths";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import Breadcrumbs from "../../../components/Breadcrumbs.svelte";
    import ColumnPresetManager from "../../../components/ColumnPresetManager.svelte";
    import ConflictRouteTabs from "../../../components/ConflictRouteTabs.svelte";
    import Progress from "../../../components/Progress.svelte";
    import ShareResetBar from "../../../components/ShareResetBar.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import { decompressBson } from "$lib/binary";
    import DataGrid from "$lib/grid/DataGrid.svelte";
    import {
        parseGridPageSizeQueryState,
        serializeGridPageSizeQueryState,
    } from "$lib/grid/queryState";
    import { formatAllianceName } from "$lib/formatting";
    import { modalWithCloseButton } from "$lib/modals";
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
    import { getConflictDataUrl } from "$lib/runtime";
    import type { CompositeMergeDiagnostics } from "$lib/compositeMerge";
    import { loadConflictContext } from "$lib/conflictContext";
    import {
        normalizeConflictLayoutColumns,
        parseConflictLayoutQuery,
        serializeConflictLayoutQuery,
    } from "$lib/conflictLayoutQueryState";
    import type { ConflictRouteContext } from "$lib/routeBootstrap";
    import { createConflictGridDataset } from "$lib/conflictGrid/dataset";
    import { createConflictGridLocalProvider } from "$lib/conflictGrid/localProvider";
    import {
        layoutTabFromIndex,
    } from "$lib/conflictTabs";
    import type { ColumnPreset } from "$lib/columnPresets";
    import type { Conflict } from "$lib/types";
    import type { GridPageSize, GridQueryState } from "$lib/grid/types";
    import {
        CONFLICT_TABLE_LAYOUT_PRESETS,
        CONFLICT_TABLE_LAYOUT_PRESET_KEYS,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY,
        createDefaultConflictTableLayoutState,
        detectConflictTableLayoutPresetKey,
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

    let mergedConflict: Conflict | null = null;
    let compositeGridDataset: ReturnType<typeof createConflictGridDataset> | null = null;
    let compositeGridProvider = null;
    let compositeGridPageSizePreference: GridPageSize | null = null;
    let compositeGridInitialState: Partial<GridQueryState> | null = null;
    let compositeGridResetVersion = 0;
    let mergeDiagnostics: CompositeMergeDiagnostics | null = null;

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
        compositeGridDataset == null
            ? null
            : createConflictGridLocalProvider({
                  dataset: compositeGridDataset,
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

    function collectAllianceCandidates(
        conflicts: Array<{ id: string; data: Conflict }>,
        orderedConflictIds: string[],
    ): Array<{ id: number; name: string }> {
        if (conflicts.length === 0) return [];

        const idSets = conflicts.map((entry) => {
            const ids = [
                ...entry.data.coalitions[0].alliance_ids,
                ...entry.data.coalitions[1].alliance_ids,
            ].map((id) => Number(id));
            return new Set<number>(ids);
        });

        const [first, ...rest] = idSets;
        const commonIds = Array.from(first).filter((id) =>
            rest.every((set) => set.has(id)),
        );

        const nameById = new Map<number, string>();
        for (const entry of conflicts) {
            for (const coalition of entry.data.coalitions) {
                for (let i = 0; i < coalition.alliance_ids.length; i += 1) {
                    const id = Number(coalition.alliance_ids[i]);
                    if (!Number.isFinite(id)) continue;
                    if (!nameById.has(id)) {
                        nameById.set(id, String(coalition.alliance_names[i] ?? `Alliance ${id}`));
                    }
                }
            }
        }

        const commonIdSet = new Set(commonIds);
        const conflictById = new Map(conflicts.map((entry) => [entry.id, entry]));
        const priorityById = new Map<number, number>();
        let order = 0;
        for (const conflictId of orderedConflictIds) {
            const conflict = conflictById.get(conflictId);
            if (!conflict) continue;
            for (const coalition of conflict.data.coalitions) {
                for (const allianceId of coalition.alliance_ids) {
                    const id = Number(allianceId);
                    if (!commonIdSet.has(id) || priorityById.has(id)) continue;
                    priorityById.set(id, order);
                    order += 1;
                }
            }
        }

        return commonIds
            .map((id) => ({ id, name: formatAllianceName(nameById.get(id), id) }))
            .sort((left, right) => {
                const leftPriority = priorityById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
                const rightPriority = priorityById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
                if (leftPriority !== rightPriority) return leftPriority - rightPriority;
                return left.name.localeCompare(right.name);
            });
    }

    function selectDefaultAllianceId(
        options: Array<{ id: number; name: string }>,
        conflicts: Array<{ id: string; data: Conflict }>,
        orderedConflictIds: string[],
    ): number | null {
        if (options.length === 0) return null;
        const optionIds = new Set(options.map((option) => option.id));
        const conflictById = new Map(conflicts.map((entry) => [entry.id, entry]));

        for (const conflictId of orderedConflictIds) {
            const conflict = conflictById.get(conflictId);
            if (!conflict) continue;
            for (const coalition of conflict.data.coalitions) {
                for (const allianceId of coalition.alliance_ids) {
                    const id = Number(allianceId);
                    if (optionIds.has(id)) {
                        return id;
                    }
                }
            }
        }

        return options[0]?.id ?? null;
    }

    function buildNoCommonAllianceDetails(conflicts: Array<{ id: string; data: Conflict }>): string[] {
        if (conflicts.length === 0) return [];

        const allianceNameById = new Map<number, string>();
        const allianceConflictIds = new Map<number, Set<string>>();

        for (const entry of conflicts) {
            const allianceIds = new Set<number>();
            for (const coalition of entry.data.coalitions) {
                for (let i = 0; i < coalition.alliance_ids.length; i += 1) {
                    const allianceId = Number(coalition.alliance_ids[i]);
                    if (!Number.isFinite(allianceId)) continue;
                    allianceIds.add(allianceId);
                    if (!allianceNameById.has(allianceId)) {
                        allianceNameById.set(
                            allianceId,
                            formatAllianceName(
                                String(coalition.alliance_names[i] ?? `Alliance ${allianceId}`),
                                allianceId,
                            ),
                        );
                    }
                }
            }

            for (const allianceId of allianceIds) {
                if (!allianceConflictIds.has(allianceId)) {
                    allianceConflictIds.set(allianceId, new Set<string>());
                }
                allianceConflictIds.get(allianceId)?.add(entry.id);
            }
        }

        const details: string[] = [];
        const conflictLabel = conflicts
            .map((entry) => `${entry.id} (${entry.data.name || "Unnamed"})`)
            .join(", ");
        details.push(`Selected conflicts: ${conflictLabel}`);

        const total = conflicts.length;
        const nearMatches = Array.from(allianceConflictIds.entries())
            .map(([allianceId, conflictIds]) => ({
                allianceId,
                name: allianceNameById.get(allianceId) ?? `Alliance ${allianceId}`,
                presentIn: conflictIds,
                count: conflictIds.size,
            }))
            .filter((entry) => entry.count > 1)
            .sort((left, right) => {
                if (left.count !== right.count) return right.count - left.count;
                return left.name.localeCompare(right.name);
            })
            .slice(0, 6);

        if (nearMatches.length === 0) {
            details.push("No alliance appears in more than one loaded conflict.");
            return details;
        }

        details.push(`Closest overlaps across ${total} conflicts:`);
        for (const entry of nearMatches) {
            const missing = conflicts
                .map((conflict) => conflict.id)
                .filter((id) => !entry.presentIn.has(id));
            details.push(
                `${entry.name} (${entry.allianceId}) appears in ${entry.count}/${total}; missing from: ${missing.join(", ")}`,
            );
        }

        return details;
    }

    async function loadConflicts(ids: string[], maxConcurrency = 4): Promise<Array<{ id: string; data: Conflict }>> {
        const loaded: Array<{ id: string; data: Conflict }> = [];
        failedConflictIds = [];
        let index = 0;

        const workers = Array.from({ length: Math.min(maxConcurrency, ids.length) }, async () => {
            while (index < ids.length) {
                const current = index;
                index += 1;

                const id = ids[current];
                const url = getConflictDataUrl(id, config.version.conflict_data);
                try {
                    const payload = (await decompressBson(url)) as Conflict;
                    loaded.push({ id, data: payload });
                } catch {
                    failedConflictIds = [...failedConflictIds, id];
                }
            }
        });

        await Promise.all(workers);
        return loaded;
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

    function rebuildMerge(conflicts: Array<{ id: string; data: Conflict }>): void {
        mergedConflict = null;
        compositeGridDataset = null;
        mergeDiagnostics = null;
        mergeWarnings = [];

        if (!selectedAllianceId) {
            setLoadError("Select an alliance to build a composite conflict.");
            return;
        }

        const payloadById = new Map(conflicts.map((entry) => [entry.id, entry.data]));
        const context: ConflictRouteContext = {
            mode: "composite",
            conflictId: null,
            conflictSignature: data.signature,
            compositeIds: [...data.conflictIds],
            selectedAllianceId,
        };

        const requestId = ++mergeRequestId;
        void loadConflictContext(context, config.version.conflict_data, {
            loadConflict: async (id) => {
                const payload = payloadById.get(id);
                if (!payload) {
                    throw new Error(`Conflict ${id} is missing from loaded payloads.`);
                }
                return payload;
            },
        })
            .then((resolved) => {
                if (requestId !== mergeRequestId) return;
                mergedConflict = resolved.conflict;
                compositeGridDataset = createConflictGridDataset({
                    datasetKey: `composite:${data.signature}:aid:${selectedAllianceId ?? "none"}`,
                    conflictId: data.signature,
                    data: resolved.conflict,
                });
                resetCompositeGridState();
                mergeDiagnostics = resolved.diagnostics;
                mergeWarnings = [...resolved.warnings, ...resolved.aavaIncompatibilities];
                clearLoadError();
            })
            .catch((error: unknown) => {
                if (requestId !== mergeRequestId) return;
                const message = error instanceof Error
                    ? error.message
                    : "Failed to build composite conflict.";
                const details = Array.isArray((error as any)?.details)
                    ? ((error as any).details as string[])
                    : [];
                setLoadError(message, details);
            });
    }

    function handleAllianceChange(): void {
        const value = Number(selectedAllianceIdValue);
        selectedAllianceId = Number.isFinite(value) && value > 0 ? value : null;
        if (selectedAllianceId == null) return;
        rebuildResolvedMerge(true);
    }

    function resetCompositeView(): void {
        layoutState = createDefaultConflictTableLayoutState();
        selectedLayoutPresetKey = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;

        selectedAllianceId = defaultAllianceId ?? allianceOptions[0]?.id ?? selectedAllianceId;
        selectedAllianceIdValue = selectedAllianceId == null ? "" : String(selectedAllianceId);
        compositeGridPageSizePreference = null;
        resetCompositeGridState();
        rebuildResolvedMerge(true);
    }

    let resolvedPayloads: Array<{ id: string; data: Conflict }> = [];
    let mergeRequestId = 0;

    const isResetDirty = () => {
        return (
            layoutState.layout !== Layout.COALITION ||
            layoutState.sort !== DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort ||
            layoutState.order !== "desc" ||
            layoutState.columns.join(".") !== DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns.join(".") ||
            selectedAllianceId !== defaultAllianceId ||
            compositeGridPageSizePreference != null
        );
    };

    function rebuildResolvedMerge(syncQuery = true): void {
        if (resolvedPayloads.length === 0) return;
        rebuildMerge(resolvedPayloads);
        if (!loadError && syncQuery) {
            syncQueryAndStorage(true);
        }
    }

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

        void loadConflicts(data.conflictIds)
            .then((loaded) => {
                resolvedPayloads = loaded;
                resolvedConflictIds = loaded.map((entry) => entry.id);

                if (loaded.length < 2) {
                    setLoadError("At least two conflicts must load successfully to build a composite conflict.");
                    return;
                }

                allianceOptions = collectAllianceCandidates(loaded, data.conflictIds);
                if (allianceOptions.length === 0) {
                    setLoadError(
                        "No alliance appears across all selected conflicts, so a composite conflict cannot be built.",
                        buildNoCommonAllianceDetails(loaded),
                    );
                    return;
                }

                if (
                    selectedAllianceId == null ||
                    !allianceOptions.some((option) => option.id === selectedAllianceId)
                ) {
                    selectedAllianceId = selectDefaultAllianceId(allianceOptions, loaded, data.conflictIds);
                }
                selectedAllianceIdValue = selectedAllianceId == null ? "" : String(selectedAllianceId);
                defaultAllianceId = selectedAllianceId;

                rebuildResolvedMerge(true);
            })
            .catch((error) => {
                console.error("Failed to initialize composite merge", error);
                setLoadError("Failed to load selected conflicts for composite merge.");
            })
            .finally(() => {
                loading = false;
            });
    });
</script>

<svelte:head>
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
        {:else if mergedConflict}
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
                class="layout-picker-bar ux-floating-controls nav fw-bold nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
            >
                <li class="d-flex align-items-center gap-2 me-1 flex-wrap">
                    <span>Layout Picker:</span>
                    <div class="d-flex flex-wrap gap-1">
                        {#each layoutPresetKeys as key}
                            <button
                                class="btn btn-sm fw-bold"
                                class:ux-btn={selectedLayoutPresetKey === key}
                                class:btn-outline-secondary={selectedLayoutPresetKey !== key}
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
