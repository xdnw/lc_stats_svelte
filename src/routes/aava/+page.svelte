<script lang="ts">
    import { onMount } from "svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import {
        addFormatters,
        applySavedQueryParamsIfMissing,
        decompressBson,
        downloadTableElem,
        ExportTypes,
        formatAllianceName,
        formatDatasetProvenance,
        getDefaultWarWebHeader,
        getConflictDataUrl,
        normalizeAllianceIds,
        resetQueryParams,
        resolveWarWebMetricMeta,
        saveCurrentQueryParams,
        setQueryParam,
        setupContainer,
        type Conflict,
        type TableData,
    } from "$lib";
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

    $: selectedPrimaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
    $: selectedVsIds =
        selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];

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

    function refreshSelectedColumnsFromQuery() {
        const query = new URLSearchParams(window.location.search);
        const parsedColumns = parseColumns(query.get("columns"), currentHeader);
        const parsedLegacy = parseColumns(query.get("cols"), currentHeader);
        const parsed = parsedColumns.length > 0 ? parsedColumns : parsedLegacy;
        if (parsed.length > 0) selectedColumns = parsed;
    }

    function buildRows() {
        if (!_rawData) return [] as any[];

        const c1Ids = _rawData.coalitions[0].alliance_ids;
        const c2Ids = _rawData.coalitions[1].alliance_ids;
        const allAllianceIds = [...c1Ids, ...c2Ids];

        const headerIndex = _rawData.war_web.headers.indexOf(currentHeader);
        if (headerIndex < 0) return [];

        const matrix = _rawData.war_web.data[headerIndex] as number[][];
        const allianceNameById: Record<number, string> = {};
        _rawData.coalitions.forEach((coalition) => {
            coalition.alliance_ids.forEach((id, i) => {
                allianceNameById[id] = formatAllianceName(
                    coalition.alliance_names[i],
                    id,
                );
            });
        });

        const primaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
        const vsIds =
            selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];

        const pIndices = primaryIds
            .map((id) => allAllianceIds.indexOf(id))
            .filter((i) => i >= 0);
        const vIndices = vsIds
            .map((id) => allAllianceIds.indexOf(id))
            .filter((i) => i >= 0);

        type RowAgg = {
            alliance: [string, number];
            primary_to_row: number;
            row_to_primary: number;
            net: number;
            total: number;
            primary_share_pct: number;
            row_share_pct: number;
            abs_net: number;
        };

        const tempRows: RowAgg[] = [];
        let sumPrimaryToRow = 0;
        let sumRowToPrimary = 0;

        for (const rIndex of vIndices) {
            let p2r = 0;
            let r2p = 0;
            for (const pIndex of pIndices) {
                const a = matrix[pIndex]?.[rIndex] ?? 0;
                const b = matrix[rIndex]?.[pIndex] ?? 0;
                p2r += Number.isFinite(a) ? a : 0;
                r2p += Number.isFinite(b) ? b : 0;
            }
            sumPrimaryToRow += p2r;
            sumRowToPrimary += r2p;
            const id = allAllianceIds[rIndex];
            tempRows.push({
                alliance: [allianceNameById[id] ?? `AA:${id}`, id],
                primary_to_row: p2r,
                row_to_primary: r2p,
                net: p2r - r2p,
                total: p2r + r2p,
                primary_share_pct: 0,
                row_share_pct: 0,
                abs_net: Math.abs(p2r - r2p),
            });
        }

        tempRows.forEach((row) => {
            row.primary_share_pct =
                sumPrimaryToRow > 0
                    ? (row.primary_to_row / sumPrimaryToRow) * 100
                    : 0;
            row.row_share_pct =
                sumRowToPrimary > 0
                    ? (row.row_to_primary / sumRowToPrimary) * 100
                    : 0;
        });

        return tempRows;
    }

    function renderTable() {
        const container = document.getElementById("aava-table");
        if (!container) return;
        container.innerHTML = "";

        const primaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
        const vsIds =
            selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];

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

    function setHeader(header: string) {
        currentHeader = header;
        syncQueryParams();
        renderTable();
    }

    function swapPrimaryCoalition() {
        if (!_rawData) return;
        primaryCoalitionIndex = primaryCoalitionIndex === 0 ? 1 : 0;

        syncQueryParams();
        renderTable();
    }

    function setAllForPrimary() {
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, [
            ...normalizeAllianceIds(getPrimaryCoalition()?.alliance_ids ?? []),
        ]);
        syncQueryParams();
        renderTable();
    }

    function setNoneForPrimary() {
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, [], {
            allowEmpty: true,
        });
        syncQueryParams();
        renderTable();
    }

    function setAllForVs() {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        setCoalitionSelection(vsIndex, [
            ...normalizeAllianceIds(getVsCoalition()?.alliance_ids ?? []),
        ]);
        syncQueryParams();
        renderTable();
    }

    function setNoneForVs() {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        setCoalitionSelection(vsIndex, [], { allowEmpty: true });
        syncQueryParams();
        renderTable();
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
        renderTable();
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
        renderTable();
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
        renderTable();
    }

    function retryLoad() {
        if (!conflictId) return;
        loadConflict(conflictId);
    }

    function hydrateStateFromQuery(data: Conflict) {
        const query = new URLSearchParams(window.location.search);
        const hasExplicitSelectionParams = ["c0", "c1", "pids", "vids"].some(
            (k) => query.has(k),
        );

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
        const url = getConflictDataUrl(id, config.version.conflict_data);
        decompressBson(url)
            .then((data: Conflict) => {
                _rawData = data;
                conflictName = data.name;
                datasetProvenance = formatDatasetProvenance(
                    config.version.conflict_data,
                    (data as any).update_ms,
                );
                hydrateStateFromQuery(data);
                renderTable();
                _loaded = true;
                saveCurrentQueryParams();
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
        (window as any).formatAllianceLink = (data: [string, number]) => {
            const allianceName = formatAllianceName(data?.[0], data?.[1]);
            const allianceId = data?.[1];
            return `<a href="https://politicsandwar.com/alliance/id=${allianceId}">${allianceName}</a>`;
        };
        (window as any).formatPercent = (data: number) => {
            if (!Number.isFinite(data)) return "0.00%";
            return `${data.toFixed(2)}%`;
        };
        (window as any).download = (useClipboard: boolean, type: string) => {
            const tableElem = document
                .getElementById("aava-table")
                ?.querySelector("table") as HTMLTableElement | null;
            if (!tableElem) return;
            downloadTableElem(
                tableElem,
                useClipboard,
                ExportTypes[type as keyof typeof ExportTypes],
            );
        };

        const query = new URLSearchParams(window.location.search);
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
        <a href="conflicts" aria-label="Back to conflicts"
            ><i class="bi bi-arrow-left"></i></a
        >&nbsp;Conflict: {conflictName}
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

    <div class="ux-surface ux-tab-panel p-2 fw-bold mb-2">
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
            <ShareResetBar onReset={resetFilters} />
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
