<script lang="ts">
    import { base } from "$app/paths";
    import { onMount } from "svelte";
    import Breadcrumbs from "../../../components/Breadcrumbs.svelte";
    import ConflictRouteTabs from "../../../components/ConflictRouteTabs.svelte";
    import Progress from "../../../components/Progress.svelte";
    import ShareResetBar from "../../../components/ShareResetBar.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import { addFormatters } from "$lib/formatterInit";
    import { decompressBson } from "$lib/binary";
    import { computeLayoutTableData } from "$lib/layoutTable";
    import { setupContainer } from "$lib/containerSetup";
    import { formatAllianceName, formatNationName } from "$lib/formatting";
    import {
        applySavedQueryParamsIfMissing,
        getCurrentQueryParams,
        getScopedPageStorageKey,
        saveCurrentQueryParams,
        setQueryParams,
    } from "$lib/queryState";
    import { encodeCompositeSelectionIds } from "$lib/conflictIds";
    import { getConflictDataUrl } from "$lib/runtime";
    import {
        isCompositeMergeError,
        mergeCompositeConflict,
        type CompositeMergeDiagnostics,
    } from "$lib/compositeMerge";
    import type { TableCallbacks } from "$lib/tableCallbacks";
    import type { Conflict } from "$lib/types";

    const Layout = {
        COALITION: 0,
        ALLIANCE: 1,
        NATION: 2,
    } as const;

    const SUMMARY_LAYOUT = {
        sort: "off:wars",
        columns: [
            "name",
            "net:damage",
            "off:wars",
            "def:wars",
            "dealt:damage",
            "loss:damage",
        ],
    };

    export let data: {
        conflictIds: string[];
        invalidTokens: string[];
        limited: boolean;
        signature: string;
        selectedAllianceId: number | null;
    };

    let loading = true;
    let loadError: string | null = null;
    let mergeWarnings: string[] = [];
    let resolvedConflictIds: string[] = [];
    let failedConflictIds: string[] = [];

    let selectedAllianceId: number | null = data.selectedAllianceId;
    let allianceOptions: Array<{ id: number; name: string }> = [];

    let mergedConflict: Conflict | null = null;
    let mergeDiagnostics: CompositeMergeDiagnostics | null = null;

    let layoutState: {
        layout: 0 | 1 | 2;
        sort: string;
        order: "asc" | "desc";
        columns: string[];
    } = {
        layout: Layout.COALITION,
        sort: SUMMARY_LAYOUT.sort,
        order: "desc",
        columns: [...SUMMARY_LAYOUT.columns],
    };

    let namesByAllianceId: Record<number, string> = {};

    function scopedStorageKey(aid: number | null): string {
        return getScopedPageStorageKey(
            window.location.pathname,
            `${data.signature}:aid=${aid ?? "none"}`,
        );
    }

    function parseLayoutFromQuery(query: URLSearchParams): void {
        const layout = query.get("layout");
        if (layout === "alliance" || layout === "1") {
            layoutState.layout = Layout.ALLIANCE;
        } else if (layout === "nation" || layout === "2") {
            layoutState.layout = Layout.NATION;
        } else {
            layoutState.layout = Layout.COALITION;
        }

        const sort = query.get("sort");
        if (sort) layoutState.sort = sort;

        const order = query.get("order");
        if (order === "asc" || order === "desc") {
            layoutState.order = order;
        }

        const columns = query.get("columns");
        if (columns) {
            layoutState.columns = columns
                .split(".")
                .map((value) => value.trim())
                .filter(Boolean);
        }
    }

    function queryDefaults() {
        return {
            layout: Layout.COALITION,
            sort: SUMMARY_LAYOUT.sort,
            order: "desc",
            columns: SUMMARY_LAYOUT.columns.join("."),
        };
    }

    function syncQueryAndStorage(replace = true): void {
        const ids = encodeCompositeSelectionIds(data.conflictIds);
        setQueryParams(
            {
                ids,
                aid: selectedAllianceId,
                layout: layoutState.layout,
                sort: layoutState.sort,
                order: layoutState.order,
                columns: layoutState.columns.join("."),
            },
            {
                replace,
                defaults: queryDefaults(),
            },
        );
        saveCurrentQueryParams(scopedStorageKey(selectedAllianceId));
    }

    function collectAllianceCandidates(conflicts: Array<{ id: string; data: Conflict }>): Array<{ id: number; name: string }> {
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

        return commonIds
            .map((id) => ({ id, name: formatAllianceName(nameById.get(id), id) }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    function getIncompatibleConflicts(
        conflicts: Array<{ id: string; data: Conflict }>,
        allianceId: number,
    ): string[] {
        return conflicts
            .filter((entry) => {
                const [left, right] = entry.data.coalitions;
                return !left.alliance_ids.includes(allianceId) && !right.alliance_ids.includes(allianceId);
            })
            .map((entry) => entry.id);
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

    function formatNationCell(data: any): string {
        const allianceId = Number(data[2]);
        const allianceName = formatAllianceName(namesByAllianceId[allianceId], allianceId);
        const nationName = formatNationName(data[0], data[1]);
        return (
            '<a href="https://politicsandwar.com/alliance/id=' +
            allianceId +
            '">' +
            allianceName +
            '</a> | <a href="https://politicsandwar.com/nation/id=' +
            data[1] +
            '">' +
            nationName +
            "</a>"
        );
    }

    function formatAllianceCell(data: any): string {
        const allianceId = Number(data[1]);
        const allianceName = formatAllianceName(data[0], allianceId);
        return (
            '<a href="https://politicsandwar.com/alliance/id=' +
            allianceId +
            '">' +
            allianceName +
            "</a>"
        );
    }

    function formatCoalitionCell(data: any): string {
        const idx = Number(data);
        const coalition = mergedConflict?.coalitions[idx];
        return coalition?.name ?? `Coalition ${idx + 1}`;
    }

    function renderMergedTable(): void {
        if (!mergedConflict) return;

        namesByAllianceId = {};
        for (const coalition of mergedConflict.coalitions) {
            for (let i = 0; i < coalition.alliance_ids.length; i += 1) {
                const allianceId = Number(coalition.alliance_ids[i]);
                namesByAllianceId[allianceId] = coalition.alliance_names[i];
            }
        }

        const tableData = computeLayoutTableData(
            mergedConflict,
            layoutState.layout,
            layoutState.columns,
            layoutState.sort,
            layoutState.order,
        );

        if (layoutState.layout === Layout.COALITION) {
            tableData.row_format = (row: HTMLElement, rowData: any) => {
                const index = Number(rowData[0]);
                if (index === 0) row.classList.add("bg-danger-subtle");
                else if (index === 1) row.classList.add("bg-info-subtle");
            };
        }

        const callbacks: TableCallbacks = {
            cellFormatters: {
                formatNation: formatNationCell,
                formatAA: formatAllianceCell,
                formatCol: formatCoalitionCell,
            },
        };

        const container = document.getElementById("composite-table");
        if (!container) return;
        setupContainer(container as HTMLElement, tableData, callbacks);
    }

    function rebuildMerge(conflicts: Array<{ id: string; data: Conflict }>): void {
        mergedConflict = null;
        mergeDiagnostics = null;
        mergeWarnings = [];

        if (!selectedAllianceId) {
            loadError = "Select an alliance to build a composite conflict.";
            return;
        }

        try {
            const merged = mergeCompositeConflict(conflicts, selectedAllianceId);
            mergedConflict = merged.conflict;
            mergeDiagnostics = merged.diagnostics;
            mergeWarnings = merged.diagnostics.warnings;
            loadError = null;
        } catch (error) {
            if (isCompositeMergeError(error)) {
                const details = Array.isArray((error as any).details)
                    ? ((error as any).details as string[])
                    : [];
                if (details.length > 0) {
                    loadError = `${error.message} Incompatible conflicts: ${details.join(", ")}`;
                } else {
                    loadError = error.message;
                }
                return;
            }
            loadError = "Failed to build composite conflict.";
        }
    }

    function handleAllianceChange(event: Event): void {
        const value = Number((event.target as HTMLSelectElement).value);
        selectedAllianceId = Number.isFinite(value) ? value : null;
        if (selectedAllianceId == null) return;
        syncQueryAndStorage(true);
        if (resolvedPayloads.length > 0) {
            rebuildMerge(resolvedPayloads);
            if (!loadError) renderMergedTable();
        }
    }

    function handleLayoutSelect(layout: number): void {
        if (layout !== Layout.COALITION && layout !== Layout.ALLIANCE && layout !== Layout.NATION) {
            return;
        }
        layoutState.layout = layout;
        syncQueryAndStorage(true);
        if (mergedConflict) {
            renderMergedTable();
        }
    }

    function resetCompositeView(): void {
        layoutState.layout = Layout.COALITION;
        layoutState.columns = [...SUMMARY_LAYOUT.columns];
        layoutState.sort = SUMMARY_LAYOUT.sort;
        layoutState.order = "desc";

        selectedAllianceId = allianceOptions[0]?.id ?? selectedAllianceId;
        syncQueryAndStorage(true);
        if (resolvedPayloads.length > 0) {
            rebuildMerge(resolvedPayloads);
            if (!loadError) renderMergedTable();
        }
    }

    let resolvedPayloads: Array<{ id: string; data: Conflict }> = [];

    const isResetDirty = () => {
        return (
            layoutState.layout !== Layout.COALITION ||
            layoutState.sort !== SUMMARY_LAYOUT.sort ||
            layoutState.order !== "desc" ||
            layoutState.columns.join(".") !== SUMMARY_LAYOUT.columns.join(".") ||
            selectedAllianceId !== (allianceOptions[0]?.id ?? null)
        );
    };

    onMount(() => {
        addFormatters();

        applySavedQueryParamsIfMissing(
            ["aid", "layout", "sort", "order", "columns"],
            ["ids"],
            scopedStorageKey(data.selectedAllianceId),
        );

        parseLayoutFromQuery(getCurrentQueryParams());

        void loadConflicts(data.conflictIds)
            .then((loaded) => {
                resolvedPayloads = loaded;
                resolvedConflictIds = loaded.map((entry) => entry.id);

                if (loaded.length < 2) {
                    loadError = "At least two conflicts must load successfully to build a composite conflict.";
                    return;
                }

                allianceOptions = collectAllianceCandidates(loaded);
                if (allianceOptions.length === 0) {
                    loadError = "No alliance appears across all selected conflicts, so a composite conflict cannot be built.";
                    return;
                }

                if (
                    selectedAllianceId == null ||
                    !allianceOptions.some((option) => option.id === selectedAllianceId)
                ) {
                    selectedAllianceId = allianceOptions[0].id;
                }

                const incompatible = getIncompatibleConflicts(loaded, selectedAllianceId);
                if (incompatible.length > 0) {
                    loadError = `Selected alliance cannot produce a composite conflict. Incompatible conflicts: ${incompatible.join(", ")}`;
                    return;
                }

                rebuildMerge(loaded);
                if (!loadError) {
                    syncQueryAndStorage(true);
                    renderMergedTable();
                }
            })
            .catch((error) => {
                console.error("Failed to initialize composite merge", error);
                loadError = "Failed to load selected conflicts for composite merge.";
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
                bind:value={selectedAllianceId}
                on:change={handleAllianceChange}
            >
                {#each allianceOptions as option}
                    <option value={option.id}>{option.name}</option>
                {/each}
            </select>

            <span class="ux-muted ms-2">
                Conflicts loaded: {resolvedConflictIds.length}/{data.conflictIds.length}
            </span>

            <ShareResetBar onReset={resetCompositeView} resetDirty={isResetDirty()} />
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

        {#if mergeWarnings.length > 0}
            <div class="alert alert-warning py-2">
                <div class="fw-bold">Merge warnings</div>
                <ul class="mb-0">
                    {#each mergeWarnings as warning}
                        <li>{warning}</li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if loadError}
            <div class="alert alert-danger">{loadError}</div>
        {:else if mergedConflict}
            <ConflictRouteTabs
                conflictId={null}
                active="coalition"
                mode="layout-picker"
                currentLayout={layoutState.layout}
                onLayoutSelect={handleLayoutSelect}
                disabledTabs={["aava", "tiering", "bubble", "chord"]}
            />

            <div class="alert alert-info py-2 mt-2">
                Composite graph tabs are disabled until merged graph data is available.
            </div>

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

            <div id="composite-table" class="inline-block"></div>
        {/if}
    {/if}
</div>
