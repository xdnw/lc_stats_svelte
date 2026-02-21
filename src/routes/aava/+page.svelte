<script lang="ts">
    import { onMount, tick } from "svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import {
        addFormatters,
        applySavedQueryParamsIfMissing,
        buildAavaSelectionRows,
        decompressBson,
        downloadTableElem,
        ExportTypes,
        formatAllianceName,
        formatDatasetProvenance,
        getDefaultWarWebHeader,
        getConflictDataUrl,
        getConflictGraphDataUrl,
        getCurrentQueryParams,
        normalizeAllianceIds,
        resetQueryParams,
        resolveWarWebMetricMeta,
        saveCurrentQueryParams,
        setQueryParam,
        setupContainer,
        type Conflict,
        type TableData,
        yieldToMain,
    } from "$lib";
    import { setWindowGlobal } from "$lib/globals";
    import { AAVA_METRIC_KEYS, getAavaMetricLabels } from "$lib/aava";
    import {
        makeKpiId,
        readSharedKpiConfig,
        saveSharedKpiConfig,
        type AavaScopeSnapshot,
    } from "$lib/kpi";
    import { config } from "../+layout";

    type ColumnKey =
        | "name"
        | "primary_to_row"
        | "row_to_primary"
        | "net"
        | "total"
        | "primary_share_pct"
        | "row_share_pct"
        | "abs_net";

    const ALL_COLUMN_KEYS: ColumnKey[] = [
        "name",
        "primary_to_row",
        "row_to_primary",
        "net",
        "total",
        "primary_share_pct",
        "row_share_pct",
        "abs_net",
    ];

    const DEFAULT_VISIBLE_COLUMN_KEYS: ColumnKey[] = [
        "name",
        "primary_to_row",
        "row_to_primary",
        "net",
        "total",
        "primary_share_pct",
        "row_share_pct",
    ];

    let conflictName = "";
    let conflictId: string | null = null;
    let datasetProvenance = "";

    let _rawData: Conflict | null = null;
    let _loaded = false;
    let _loadError: string | null = null;

    let currentHeader = "wars";
    let primaryCoalitionIndex = 0;
    let selectedByCoalition: [number[], number[]] = [[], []];
    let selectedPrimaryIds: number[] = [];
    let selectedVsIds: number[] = [];
    let selectedColumns: ColumnKey[] = [...DEFAULT_VISIBLE_COLUMN_KEYS];
    let rankingMetricToAdd = "net";
    let rankingLimitToAdd = 10;
    let metricMetricToAdd = "net";
    let metricAggToAdd: "sum" | "avg" = "sum";
    let metricNormalizeByToAdd = "";
    let rowsCache = new Map<string, any[]>();
    let renderQueued = false;

    function clearRowsCache() {
        rowsCache.clear();
    }

    $: selectedPrimaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
    $: selectedVsIds =
        selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];
    $: aavaMetricLabels = getAavaMetricLabels(currentHeader);
    $: isResetDirty = (() => {
        if (!_rawData) return false;
        const defaultHeader = getDefaultWarWebHeader(_rawData);
        const defaults = defaultSelectionsByCoalition(_rawData);
        const defaultCols = DEFAULT_VISIBLE_COLUMN_KEYS;
        const sameCols =
            selectedColumns.length === defaultCols.length &&
            selectedColumns.every((col, idx) => col === defaultCols[idx]);
        const sameC0 =
            selectedByCoalition[0].length === defaults[0].length &&
            selectedByCoalition[0].every((id, idx) => id === defaults[0][idx]);
        const sameC1 =
            selectedByCoalition[1].length === defaults[1].length &&
            selectedByCoalition[1].every((id, idx) => id === defaults[1][idx]);
        return !(
            primaryCoalitionIndex === 0 &&
            currentHeader === defaultHeader &&
            sameCols &&
            sameC0 &&
            sameC1
        );
    })();

    function getCoalition(index: number) {
        return _rawData?.coalitions[index];
    }

    function getPrimaryCoalition() {
        return getCoalition(primaryCoalitionIndex);
    }

    function getVsCoalition() {
        return getCoalition(primaryCoalitionIndex === 0 ? 1 : 0);
    }

    function getColumnLabels(header: string): Record<ColumnKey, string> {
        const meta = resolveWarWebMetricMeta(header);
        return {
            name: "Alliance",
            primary_to_row: meta.primaryToRowLabel(header),
            row_to_primary: meta.rowToPrimaryLabel(header),
            net: "Net",
            total: "Total",
            primary_share_pct: "Compared share %",
            row_share_pct: "Selected share %",
            abs_net: "Abs Net",
        };
    }

    function parseIdList(raw: string | null): number[] {
        if (!raw || raw === "none") return [];
        return raw
            .split(".")
            .map((x) => +x)
            .filter((x) => Number.isFinite(x) && x > 0);
    }

    function normalizeColumnToken(value: string): string {
        return value.trim().toLowerCase().replace(/\s+/g, " ");
    }

    function resolveColumnKeyFromToken(
        token: string,
        labels: Record<ColumnKey, string>,
    ): ColumnKey | null {
        const normalized = normalizeColumnToken(token);
        if (!normalized) return null;

        if (ALL_COLUMN_KEYS.includes(token as ColumnKey)) {
            return token as ColumnKey;
        }

        for (const key of ALL_COLUMN_KEYS) {
            if (normalizeColumnToken(labels[key]) === normalized) {
                return key;
            }
        }

        const legacyMap: Record<string, ColumnKey> = {
            alliance: "name",
            "primary → row": "primary_to_row",
            "row → primary": "row_to_primary",
            net: "net",
            total: "total",
            "primary share %": "primary_share_pct",
            "selected share %": "primary_share_pct",
            "row share %": "row_share_pct",
            "compared share %": "row_share_pct",
            "abs net": "abs_net",
        };

        if (legacyMap[normalized]) {
            return legacyMap[normalized];
        }

        // Legacy: old "sent by / received from" labels
        if (normalized.endsWith("sent by selected coalition")) {
            return "primary_to_row";
        }
        if (normalized.endsWith("received from compared coalition")) {
            return "row_to_primary";
        }
        // New semantic labels contain "selected" or "compared" (but not "share")
        if (normalized.includes("selected") && !normalized.includes("share")) {
            return "primary_to_row";
        }
        if (normalized.includes("compared") && !normalized.includes("share")) {
            return "row_to_primary";
        }

        return null;
    }

    function parseColumns(raw: string | null, header: string): ColumnKey[] {
        if (!raw) return [];
        const labels = getColumnLabels(header);
        const unique: ColumnKey[] = [];

        for (const token of raw.split(".")) {
            const key = resolveColumnKeyFromToken(token, labels);
            if (key && !unique.includes(key)) unique.push(key);
        }

        if (!unique.includes("name")) unique.unshift("name");
        return unique.length > 0 ? unique : [];
    }

    function parseCoalitionIndex(raw: string | null): number {
        return raw === "1" ? 1 : 0;
    }

    function hasIntentionalSelectionParams(query: URLSearchParams): boolean {
        const keys = ["c0", "c1", "pids", "vids"];
        return keys.some((key) => {
            const value = query.get(key);
            return value !== null && value.trim().length > 0;
        });
    }

    function defaultSelectionsByCoalition(
        data: Conflict = _rawData as Conflict,
    ): [number[], number[]] {
        return [
            normalizeAllianceIds(data?.coalitions[0]?.alliance_ids ?? []),
            normalizeAllianceIds(data?.coalitions[1]?.alliance_ids ?? []),
        ];
    }

    function setCoalitionSelection(
        coalitionIndex: 0 | 1,
        ids: number[],
        options?: { allowEmpty?: boolean },
    ) {
        if (!_rawData) return;
        const allowed = new Set(
            normalizeAllianceIds(
                _rawData.coalitions[coalitionIndex]?.alliance_ids ?? [],
            ),
        );
        const requested = normalizeAllianceIds(ids);
        const valid = Array.from(
            new Set(requested.filter((id) => allowed.has(id))),
        );
        const fallbackAll = Array.from(allowed);
        const resolved =
            valid.length > 0 || (options?.allowEmpty && requested.length === 0)
                ? valid
                : fallbackAll;

        selectedByCoalition =
            coalitionIndex === 0
                ? [resolved, [...selectedByCoalition[1]]]
                : [[...selectedByCoalition[0]], resolved];
    }

    function resolveSelectionFromQuery(
        data: Conflict,
        query: URLSearchParams,
    ): [number[], number[]] {
        const defaults = defaultSelectionsByCoalition(data);
        const allowed0 = new Set(defaults[0]);
        const allowed1 = new Set(defaults[1]);

        const c0Raw = query.get("c0");
        const c1Raw = query.get("c1");
        if (c0Raw !== null || c1Raw !== null) {
            const c0Parsed = parseIdList(c0Raw).filter((id) =>
                allowed0.has(id),
            );
            const c1Parsed = parseIdList(c1Raw).filter((id) =>
                allowed1.has(id),
            );
            const c0 =
                c0Raw === null
                    ? [...defaults[0]]
                    : c0Parsed.length > 0 || c0Raw === "none"
                      ? c0Parsed
                      : [...defaults[0]];
            const c1 =
                c1Raw === null
                    ? [...defaults[1]]
                    : c1Parsed.length > 0 || c1Raw === "none"
                      ? c1Parsed
                      : [...defaults[1]];
            return [c0, c1];
        }

        const legacyPidsRaw = query.get("pids");
        const legacyVidsRaw = query.get("vids");
        if (legacyPidsRaw === null && legacyVidsRaw === null) {
            return defaults;
        }

        const legacyPc = parseCoalitionIndex(query.get("pc")) as 0 | 1;
        const legacyVs = (legacyPc === 0 ? 1 : 0) as 0 | 1;
        const next: [number[], number[]] = [[...defaults[0]], [...defaults[1]]];

        if (legacyPidsRaw !== null) {
            const allowedPrimary = new Set(defaults[legacyPc]);
            const parsedPrimary = parseIdList(legacyPidsRaw).filter((id) =>
                allowedPrimary.has(id),
            );
            next[legacyPc] =
                parsedPrimary.length > 0 || legacyPidsRaw === "none"
                    ? parsedPrimary
                    : [...defaults[legacyPc]];
        }

        if (legacyVidsRaw !== null) {
            const allowedVs = new Set(defaults[legacyVs]);
            const parsedVs = parseIdList(legacyVidsRaw).filter((id) =>
                allowedVs.has(id),
            );
            next[legacyVs] =
                parsedVs.length > 0 || legacyVidsRaw === "none"
                    ? parsedVs
                    : [...defaults[legacyVs]];
        }

        return next;
    }

    function syncQueryParams() {
        const primaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
        const vsIds =
            selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];
        setQueryParam("header", currentHeader);
        setQueryParam("pc", primaryCoalitionIndex);
        setQueryParam(
            "c0",
            selectedByCoalition[0].length
                ? selectedByCoalition[0].join(".")
                : "none",
        );
        setQueryParam(
            "c1",
            selectedByCoalition[1].length
                ? selectedByCoalition[1].join(".")
                : "none",
        );
        setQueryParam(
            "pids",
            primaryIds.length ? primaryIds.join(".") : "none",
        );
        setQueryParam("vids", vsIds.length ? vsIds.join(".") : "none");
        saveCurrentQueryParams();
    }

    function makeSelectionSnapshot(): AavaScopeSnapshot {
        const selectedName = getPrimaryCoalition()?.name ?? "Selected";
        const comparedName = getVsCoalition()?.name ?? "Compared";
        return {
            header: currentHeader,
            primaryCoalitionIndex: primaryCoalitionIndex as 0 | 1,
            primaryIds: [...selectedPrimaryIds],
            vsIds: [...selectedVsIds],
            label: `${selectedName} vs ${comparedName} · ${selectedPrimaryIds.length}/${selectedVsIds.length}`,
        };
    }

    function addAavaRankingWidget() {
        if (!conflictId) return;
        if (selectedPrimaryIds.length === 0 || selectedVsIds.length === 0)
            return;
        const config = readSharedKpiConfig(conflictId);
        config.widgets = [
            ...(config.widgets ?? []),
            {
                id: makeKpiId("ranking"),
                kind: "ranking",
                entity: "alliance",
                metric: rankingMetricToAdd,
                scope: "selection",
                limit: Math.max(1, rankingLimitToAdd),
                source: "aava",
                aavaSnapshot: makeSelectionSnapshot(),
            },
        ];
        saveSharedKpiConfig(conflictId, config);
    }

    function addAavaMetricWidget() {
        if (!conflictId) return;
        if (selectedPrimaryIds.length === 0 || selectedVsIds.length === 0)
            return;
        const config = readSharedKpiConfig(conflictId);
        config.widgets = [
            ...(config.widgets ?? []),
            {
                id: makeKpiId("metric"),
                kind: "metric",
                entity: "alliance",
                metric: metricMetricToAdd,
                scope: "selection",
                aggregation: metricAggToAdd,
                source: "aava",
                normalizeBy: metricNormalizeByToAdd || null,
                aavaSnapshot: makeSelectionSnapshot(),
            },
        ];
        saveSharedKpiConfig(conflictId, config);
    }

    function refreshSelectedColumnsFromQuery() {
        const query = getCurrentQueryParams();
        const parsedColumns = parseColumns(query.get("columns"), currentHeader);
        const parsedLegacy = parseColumns(query.get("cols"), currentHeader);
        const parsed = parsedColumns.length > 0 ? parsedColumns : parsedLegacy;
        if (parsed.length > 0) selectedColumns = parsed;
    }

    function buildRowsForSelection(
        header: string,
        primaryIds: number[],
        vsIds: number[],
    ) {
        if (!_rawData) return [] as any[];
        const cacheKey = `${header}|${primaryIds.join(".")}|${vsIds.join(".")}`;
        const cached = rowsCache.get(cacheKey);
        if (cached) return cached;
        const rows = buildAavaSelectionRows(_rawData, {
            header,
            primaryIds,
            vsIds,
        });
        rowsCache.set(cacheKey, rows);
        return rows;
    }

    function buildRows() {
        return buildRowsForSelection(
            currentHeader,
            selectedPrimaryIds,
            selectedVsIds,
        );
    }

    function renderTable() {
        renderQueued = false;
        const container = document.getElementById("aava-table");
        if (!container) return;
        container.innerHTML = "";

        let primaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
        let vsIds =
            selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];

        if (_rawData && (primaryIds.length === 0 || vsIds.length === 0)) {
            const query = getCurrentQueryParams();
            if (!hasIntentionalSelectionParams(query)) {
                selectedByCoalition = defaultSelectionsByCoalition(_rawData);
                primaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
                vsIds =
                    selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ??
                    [];
            }
        }

        if (!_rawData || primaryIds.length === 0 || vsIds.length === 0) return;

        refreshSelectedColumnsFromQuery();

        const labels = getColumnLabels(currentHeader);
        const rows = buildRows();
        const visible = ALL_COLUMN_KEYS.map((k, idx) =>
            selectedColumns.includes(k) ? idx : -1,
        ).filter((idx) => idx >= 0);

        const rowData: TableData = {
            columns: ALL_COLUMN_KEYS.map((k) => labels[k]),
            data: rows.map((row) => [
                row.alliance,
                row.primary_to_row,
                row.row_to_primary,
                row.net,
                row.total,
                row.primary_share_pct,
                row.row_share_pct,
                row.abs_net,
            ]),
            searchable: [0],
            visible,
            cell_format: {
                formatAllianceLink: [0],
                formatNumber: [1, 2, 3, 4, 7],
                formatPercent: [5, 6],
            },
            row_format: null,
            sort: [ALL_COLUMN_KEYS.indexOf("net"), "desc"],
        };

        setupContainer(container, rowData);
    }

    function scheduleRenderTable() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(() => renderTable());
    }

    function setHeader(header: string) {
        currentHeader = header;
        syncQueryParams();
        scheduleRenderTable();
    }

    function swapPrimaryCoalition() {
        if (!_rawData) return;
        primaryCoalitionIndex = primaryCoalitionIndex === 0 ? 1 : 0;

        syncQueryParams();
        scheduleRenderTable();
    }

    function setAllForPrimary() {
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, [
            ...normalizeAllianceIds(getPrimaryCoalition()?.alliance_ids ?? []),
        ]);
        syncQueryParams();
        scheduleRenderTable();
    }

    function setNoneForPrimary() {
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, [], {
            allowEmpty: true,
        });
        syncQueryParams();
        scheduleRenderTable();
    }

    function setAllForVs() {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        setCoalitionSelection(vsIndex, [
            ...normalizeAllianceIds(getVsCoalition()?.alliance_ids ?? []),
        ]);
        syncQueryParams();
        scheduleRenderTable();
    }

    function setNoneForVs() {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        setCoalitionSelection(vsIndex, [], { allowEmpty: true });
        syncQueryParams();
        scheduleRenderTable();
    }

    function togglePrimaryAlliance(id: number) {
        id = Number(id);
        const currentPrimary = selectedByCoalition[primaryCoalitionIndex] ?? [];
        const next = currentPrimary.includes(id)
            ? currentPrimary.filter((x) => x !== id)
            : [...currentPrimary, id];
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, next, {
            allowEmpty: true,
        });
        syncQueryParams();
        scheduleRenderTable();
    }

    function toggleVsAlliance(id: number) {
        id = Number(id);
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        const currentVs = selectedByCoalition[vsIndex] ?? [];
        const next = currentVs.includes(id)
            ? currentVs.filter((x) => x !== id)
            : [...currentVs, id];
        setCoalitionSelection(vsIndex, next, { allowEmpty: true });
        syncQueryParams();
        scheduleRenderTable();
    }

    function resetFilters() {
        if (!_rawData) return;
        primaryCoalitionIndex = 0;
        currentHeader = getDefaultWarWebHeader(_rawData);
        selectedByCoalition = defaultSelectionsByCoalition(_rawData);
        selectedColumns = [...DEFAULT_VISIBLE_COLUMN_KEYS];
        resetQueryParams(
            [
                "header",
                "pc",
                "c0",
                "c1",
                "pids",
                "vids",
                "columns",
                "cols",
                "sort",
                "order",
            ],
            ["id"],
        );
        saveCurrentQueryParams();
        scheduleRenderTable();
    }

    function retryLoad() {
        if (!conflictId) return;
        loadConflict(conflictId);
    }

    function hydrateStateFromQuery(data: Conflict) {
        const query = getCurrentQueryParams();
        const hasExplicitSelectionParams = hasIntentionalSelectionParams(query);

        primaryCoalitionIndex = parseCoalitionIndex(query.get("pc"));
        currentHeader = query.get("header") ?? getDefaultWarWebHeader(data);
        if (!data.war_web.headers.includes(currentHeader))
            currentHeader = getDefaultWarWebHeader(data);
        selectedByCoalition = resolveSelectionFromQuery(data, query);
        if (
            !hasExplicitSelectionParams &&
            ((selectedByCoalition[primaryCoalitionIndex] ?? []).length === 0 ||
                (selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [])
                    .length === 0)
        ) {
            selectedByCoalition = defaultSelectionsByCoalition(data);
        }

        const qColumns = parseColumns(query.get("columns"), currentHeader);
        const qLegacy = parseColumns(query.get("cols"), currentHeader);
        const resolvedCols = qColumns.length > 0 ? qColumns : qLegacy;

        selectedColumns =
            resolvedCols.length > 0
                ? resolvedCols
                : [...DEFAULT_VISIBLE_COLUMN_KEYS];
        if (!selectedColumns.includes("name")) selectedColumns.unshift("name");
    }

    function loadConflict(id: string) {
        _loadError = null;
        _loaded = false;
        clearRowsCache();
        const url = getConflictDataUrl(id, config.version.conflict_data);
        decompressBson(url)
            .then(async (data: Conflict) => {
                _rawData = data;
                conflictName = data.name;
                datasetProvenance = formatDatasetProvenance(
                    config.version.conflict_data,
                    (data as any).update_ms,
                );
                hydrateStateFromQuery(data);
                await tick();
                await yieldToMain();
                renderTable();
                _loaded = true;
                saveCurrentQueryParams();

                // Warm graph payload cache so switching to Tiering/Bubble is faster.
                const schedulePrefetch =
                    typeof (window as any).requestIdleCallback === "function"
                        ? (cb: () => void) =>
                              (window as any).requestIdleCallback(cb, {
                                  timeout: 2500,
                              })
                        : (cb: () => void) => window.setTimeout(cb, 300);
                schedulePrefetch(() => {
                    const graphUrl = getConflictGraphDataUrl(
                        id,
                        config.version.graph_data,
                    );
                    decompressBson(graphUrl).catch(() => {
                        // Best-effort prefetch only.
                    });
                });
            })
            .catch((error) => {
                console.error("Failed to load AAvA data", error);
                _loadError =
                    "Could not load conflict web data. Please try again later.";
                _loaded = true;
            });
    }

    onMount(() => {
        applySavedQueryParamsIfMissing(
            ["header", "pc", "columns", "cols"],
            ["id"],
        );

        addFormatters();
        setWindowGlobal("formatAllianceLink", (data: [string, number]) => {
            const allianceName = formatAllianceName(data?.[0], data?.[1]);
            const allianceId = data?.[1];
            return `<a href="https://politicsandwar.com/alliance/id=${allianceId}">${allianceName}</a>`;
        });
        setWindowGlobal("formatPercent", (data: number) => {
            if (!Number.isFinite(data)) return "0.00%";
            return `${data.toFixed(2)}%`;
        });
        setWindowGlobal("download", (useClipboard: boolean, type: string) => {
            const tableElem = document
                .getElementById("aava-table")
                ?.querySelector("table") as HTMLTableElement | null;
            if (!tableElem) return;
            downloadTableElem(
                tableElem,
                useClipboard,
                ExportTypes[type as keyof typeof ExportTypes],
            );
        });

        const query = getCurrentQueryParams();
        const id = query.get("id");
        if (!id) {
            _loadError = "Missing conflict id in URL";
            _loaded = true;
            return;
        }
        conflictId = id;
        loadConflict(id);
    });
</script>

<svelte:head>
    <title>AAvA {conflictName}</title>
</svelte:head>

<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: "/" },
                    { label: "Conflicts", href: "/conflicts" },
                    {
                        label: conflictName || "Conflict",
                        href: conflictId
                            ? "/conflict?id=" + conflictId
                            : undefined,
                    },
                    { label: "AAvA" },
                ]}
            />
            <span class="ux-page-title-main">Conflict: {conflictName}</span>
        </div>
        {#if _rawData?.wiki}
            <a
                class="btn ux-btn fw-bold"
                href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
            >
                Wiki:{_rawData.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"
                ></i>
            </a>
        {/if}
    </h1>
    <ConflictRouteTabs {conflictId} active="aava" />

    <div
        class="ux-surface ux-tab-panel p-2 fw-bold mb-2 aava-controls ux-floating-controls"
    >
        <div
            class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"
        >
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-bold">AAvA Controls</span>
                <button
                    class="btn ux-btn btn-sm fw-bold"
                    on:click={swapPrimaryCoalition}
                >
                    Swap coalitions
                </button>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="dropdown" data-bs-auto-close="outside">
                    <button
                        class="btn ux-btn btn-sm"
                        type="button"
                        id="aavaKpiManagerDropdown"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                    >
                        KPI widgets&nbsp;<i class="bi bi-chevron-down"></i>
                    </button>
                    <div
                        class="dropdown-menu p-2 aava-kpi-dropdown-menu"
                        aria-labelledby="aavaKpiManagerDropdown"
                        style="min-width: 340px;"
                    >
                        <div class="small text-muted mb-1">
                            Add shared KPI widgets from current AAvA snapshot
                        </div>
                        <div class="row g-1">
                            <div class="col-12">
                                <div class="small text-muted mb-1">
                                    Ranking widget
                                </div>
                                <select
                                    class="form-select form-select-sm"
                                    bind:value={rankingMetricToAdd}
                                >
                                    {#each AAVA_METRIC_KEYS as key}
                                        <option value={key}
                                            >{aavaMetricLabels[key]}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                            <div class="col-12">
                                <input
                                    class="form-control form-control-sm"
                                    type="number"
                                    min="1"
                                    max="50"
                                    bind:value={rankingLimitToAdd}
                                    placeholder="Top N"
                                />
                            </div>
                            <div class="col-12">
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary w-100"
                                    on:click|preventDefault|stopPropagation={addAavaRankingWidget}
                                    disabled={selectedPrimaryIds.length === 0 ||
                                        selectedVsIds.length === 0}
                                    >+ Add ranking widget</button
                                >
                            </div>

                            <div class="col-12 mt-2">
                                <div class="small text-muted mb-1">
                                    Metric widget
                                </div>
                                <div class="small text-muted">
                                    Entity: Alliance
                                </div>
                            </div>
                            <div class="col-12">
                                <select
                                    class="form-select form-select-sm"
                                    bind:value={metricAggToAdd}
                                >
                                    <option value="sum">SUM</option>
                                    <option value="avg">AVG</option>
                                </select>
                            </div>
                            <div class="col-12">
                                <select
                                    class="form-select form-select-sm"
                                    bind:value={metricMetricToAdd}
                                >
                                    {#each AAVA_METRIC_KEYS as key}
                                        <option value={key}
                                            >{aavaMetricLabels[key]}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                            <div class="col-12">
                                <select
                                    class="form-select form-select-sm"
                                    bind:value={metricNormalizeByToAdd}
                                >
                                    <option value="">No normalization</option>
                                    {#each AAVA_METRIC_KEYS as key}
                                        <option value={key}
                                            >Per {aavaMetricLabels[key]}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                            <div class="col-12 small text-muted">
                                Snapshot: {makeSelectionSnapshot().label} · {currentHeader}
                            </div>
                            <div class="col-12">
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary w-100"
                                    on:click|preventDefault|stopPropagation={addAavaMetricWidget}
                                    disabled={selectedPrimaryIds.length === 0 ||
                                        selectedVsIds.length === 0}
                                    >+ Add metric widget</button
                                >
                            </div>
                            <div class="col-12 small text-muted">
                                Added widgets appear on the shared KPI dashboard
                                in Conflict.
                            </div>
                        </div>
                    </div>
                </div>
                <ShareResetBar
                    onReset={resetFilters}
                    resetDirty={isResetDirty}
                />
            </div>
        </div>

        {#if !_loaded}
            <Progress />
        {/if}

        {#if _loadError}
            <div
                class="alert alert-danger m-2 d-flex justify-content-between align-items-center"
            >
                <span>{_loadError}</span>
                <button
                    class="btn btn-sm btn-outline-danger fw-bold"
                    on:click={retryLoad}>Retry</button
                >
            </div>
        {/if}

        {#if _rawData}
            <div class="mb-2">
                <div class="mb-1">Header:</div>
                {#each _rawData.war_web.headers as header (header)}
                    <button
                        class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                        class:active={currentHeader === header}
                        on:click={() => setHeader(header)}>{header}</button
                    >
                {/each}
            </div>

            <div class="row g-2">
                <div class="col-md-6">
                    <div
                        class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red"
                    >
                        <div
                            class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1"
                        >
                            <strong>
                                <span class="badge text-bg-danger ms-1"
                                    >Selected coalition</span
                                >
                                ({getPrimaryCoalition()?.name})
                                {selectedPrimaryIds.length}/{getPrimaryCoalition()
                                    ?.alliance_ids.length ?? 0}
                            </strong>
                            <div class="d-flex gap-1">
                                <button
                                    class="btn ux-btn btn-sm fw-bold"
                                    on:click={setAllForPrimary}>All</button
                                >
                                <button
                                    class="btn ux-btn btn-sm fw-bold"
                                    on:click={setNoneForPrimary}>None</button
                                >
                            </div>
                        </div>
                        {#each getPrimaryCoalition()?.alliance_ids ?? [] as id, i}
                            <button
                                class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                                class:active={selectedPrimaryIds.includes(
                                    Number(id),
                                )}
                                on:click={() =>
                                    togglePrimaryAlliance(Number(id))}
                            >
                                {formatAllianceName(
                                    getPrimaryCoalition()?.alliance_names[i],
                                    Number(id),
                                )}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="col-md-6">
                    <div
                        class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--blue"
                    >
                        <div
                            class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1"
                        >
                            <strong>
                                <span class="badge text-bg-primary ms-1"
                                    >Compared coalition</span
                                >
                                ({getVsCoalition()?.name})
                                {selectedVsIds.length}/{getVsCoalition()
                                    ?.alliance_ids.length ?? 0}
                            </strong>
                            <div class="d-flex gap-1">
                                <button
                                    class="btn ux-btn btn-sm fw-bold"
                                    on:click={setAllForVs}>All</button
                                >
                                <button
                                    class="btn ux-btn btn-sm fw-bold"
                                    on:click={setNoneForVs}>None</button
                                >
                            </div>
                        </div>
                        {#each getVsCoalition()?.alliance_ids ?? [] as id, i}
                            <button
                                class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                                class:active={selectedVsIds.includes(
                                    Number(id),
                                )}
                                on:click={() => toggleVsAlliance(Number(id))}
                            >
                                {formatAllianceName(
                                    getVsCoalition()?.alliance_names[i],
                                    Number(id),
                                )}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="small text-muted mt-2">
                {resolveWarWebMetricMeta(currentHeader).directionNote(
                    currentHeader,
                )}
                Each row is one alliance from the Compared coalition. "Net" = Selected
                value minus Compared value (positive favours Selected).
            </div>
        {/if}
    </div>

    {#if _rawData && (selectedPrimaryIds.length === 0 || selectedVsIds.length === 0)}
        <div class="alert alert-warning fw-bold">
            Select at least one alliance on both sides to render the table.
        </div>
    {/if}

    <div id="aava-table"></div>

    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>
