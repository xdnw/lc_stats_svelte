<script lang="ts">
    import { page } from "$app/stores";
    import { onMount, tick } from "svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import SelectionModal from "../../components/SelectionModal.svelte";
    import KpiBuilderModal from "../../components/KpiBuilderModal.svelte";
    import type {
        SelectionId,
        SelectionModalItem,
    } from "$lib/selection/types";
    import { base } from "$app/paths";
    import {
        addFormatters,
        buildAavaSelectionRows,
        buildCoalitionAllianceItems,
        buildStringSelectionItems,
        bootstrapConflictRouteLifecycle,
        downloadTableElem,
        ExportTypes,
        firstSelectedString,
        formatAllianceName,
        formatDatasetProvenance,
        getDefaultWarWebHeader,
        getConflictGraphDataUrl,
        getCurrentQueryParams,
        loadConflictContext,
        normalizeAllianceIds,
        resetQueryParams,
        resolveWarWebMetricMeta,
        saveCurrentQueryParams,
        setQueryParam,
        setupContainer,
        queueUrlPrefetch,
        toNumberSelection,
        type ConflictRouteContext,
        type Conflict,
        type TableCallbacks,
        type TableData,
        validateSingleSelection,
        yieldToMain,
    } from "$lib";
    import { AAVA_METRIC_KEYS, getAavaMetricLabels } from "$lib/aava";
    import {
        makeKpiId,
        moveWidgetByDelta,
        readCompositeSharedKpiConfig,
        readSharedKpiConfig,
        saveCompositeSharedKpiConfig,
        saveSharedKpiConfig,
        sanitizeKpiWidget,
        type AavaScopeSnapshot,
        type ConflictKPIWidget,
    } from "$lib/kpi";
    import {
        encodeCompositeSelectionIds,
        getCompositeConflictSignature,
        parseCompositeSelectionIds,
    } from "$lib/conflictIds";
    import { getScopedPageStorageKey } from "$lib/queryState";
    import { appConfig as config } from "$lib/appConfig";
    import type { ConflictTabCapabilities } from "$lib/conflictTabs";

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
    let compositeIds: string[] | null = null;
    let selectedAllianceId: number | null = null;
    let contextMode: "single" | "composite" = "single";
    let contextSignature = "";
    let resolvedContext: ConflictRouteContext | null = null;
    let compositeLoadWarnings: string[] = [];
    let datasetProvenance = "";

    let tabRouteKind: "single" | "composite" = "single";
    let tabConflictId: string | null = null;
    let tabCompositeIds: string[] | null = null;
    let tabSelectedAllianceId: number | null = null;

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
    let showKpiBuilderModal = false;
    let showHeaderModal = false;
    let showPrimaryAllianceModal = false;
    let showVsAllianceModal = false;
    let headerModalItems: SelectionModalItem[] = [];
    let primaryAllianceModalItems: SelectionModalItem[] = [];
    let vsAllianceModalItems: SelectionModalItem[] = [];
    let rowsCache = new Map<string, any[]>();
    let renderQueued = false;
    let sharedKpiWidgets: ConflictKPIWidget[] = [];
    let primaryCoalition: Conflict["coalitions"][number] | undefined;
    let vsCoalition: Conflict["coalitions"][number] | undefined;

    $: aavaTabCapabilities = (
        tabRouteKind === "composite"
            ? {
                  aava: true,
                  tiering: false,
                  bubble: false,
                  chord: false,
              }
            : {}
    ) as ConflictTabCapabilities;

    $: {
        const id = ($page.url.searchParams.get("id") ?? "").trim();
        const parsed = parseCompositeSelectionIds($page.url.searchParams.get("ids"));
        const rawAid = ($page.url.searchParams.get("aid") ?? "").trim();
        const aid = /^\d+$/.test(rawAid) ? Number.parseInt(rawAid, 10) : null;

        if (id.length > 0) {
            tabRouteKind = "single";
            tabConflictId = id;
            tabCompositeIds = null;
            tabSelectedAllianceId = null;
        } else if (parsed.ids.length >= 2 && aid != null && aid > 0) {
            tabRouteKind = "composite";
            tabConflictId = null;
            tabCompositeIds = parsed.ids;
            tabSelectedAllianceId = aid;
        } else {
            tabRouteKind = contextMode;
            tabConflictId = conflictId;
            tabCompositeIds = compositeIds;
            tabSelectedAllianceId = selectedAllianceId;
        }
    }

    function formatAllianceLinkCell(data: unknown): string {
        const value = data as [string, number] | undefined;
        const allianceId = value?.[1] ?? 0;
        const allianceName = formatAllianceName(value?.[0], allianceId);
        return `<a href="https://politicsandwar.com/alliance/id=${allianceId}">${allianceName}</a>`;
    }

    function formatPercentCell(data: unknown): string {
        const value = Number(data);
        if (!Number.isFinite(value)) return "0.00%";
        return `${value.toFixed(2)}%`;
    }

    function downloadAavaTable(useClipboard: boolean, type: string): void {
        const tableElem = document
            .getElementById("aava-table")
            ?.querySelector("table") as HTMLTableElement | null;
        if (!tableElem) return;
        downloadTableElem(
            tableElem,
            useClipboard,
            ExportTypes[type as keyof typeof ExportTypes],
        );
    }

    function clearRowsCache() {
        rowsCache.clear();
    }

    function contextPreserveParams(): string[] {
        return contextMode === "composite" ? ["ids", "aid"] : ["id"];
    }

    function currentContextQuery(): { ids?: string; aid?: number; id?: string } {
        if (contextMode === "composite" && compositeIds && selectedAllianceId) {
            return {
                ids: encodeCompositeSelectionIds(compositeIds),
                aid: selectedAllianceId,
            };
        }
        return {
            id: conflictId ?? undefined,
        };
    }

    function getAavaQueryStorageKey(query?: URLSearchParams): string | undefined {
        const source = query ?? getCurrentQueryParams();
        const id = (source.get("id") ?? "").trim();
        if (id.length > 0) {
            return getScopedPageStorageKey(window.location.pathname, `id=${id}`);
        }

        const idsRaw = source.get("ids");
        const aidRaw = (source.get("aid") ?? "").trim();
        if (!idsRaw || !/^\d+$/.test(aidRaw)) return undefined;

        const parsed = parseCompositeSelectionIds(idsRaw);
        if (parsed.ids.length < 2) return undefined;

        const signature = getCompositeConflictSignature(parsed.ids);
        return getScopedPageStorageKey(window.location.pathname, `composite=${signature}:aid=${aidRaw}`);
    }

    function readScopedKpiConfig() {
        if (contextMode === "composite") {
            return readCompositeSharedKpiConfig(contextSignature);
        }
        return readSharedKpiConfig(conflictId);
    }

    function saveScopedKpiConfig(config: { widgets: ConflictKPIWidget[] }) {
        if (contextMode === "composite") {
            saveCompositeSharedKpiConfig(contextSignature, {
                version: 1,
                widgets: config.widgets,
            });
            return;
        }
        saveSharedKpiConfig(conflictId, { version: 1, widgets: config.widgets });
    }

    $: selectedPrimaryIds = selectedByCoalition[primaryCoalitionIndex] ?? [];
    $: selectedVsIds =
        selectedByCoalition[primaryCoalitionIndex === 0 ? 1 : 0] ?? [];
    $: primaryCoalition = _rawData?.coalitions[primaryCoalitionIndex];
    $: vsCoalition = _rawData?.coalitions[primaryCoalitionIndex === 0 ? 1 : 0];
    $: aavaMetricLabels = getAavaMetricLabels(currentHeader);
    $: encodedCompositeIds = compositeIds
        ? encodeCompositeSelectionIds(compositeIds)
        : null;
    $: conflictBackHref =
        contextMode === "composite" && encodedCompositeIds && selectedAllianceId
            ? `${base}/conflicts/view?ids=${encodeURIComponent(encodedCompositeIds)}&aid=${selectedAllianceId}`
            : conflictId
              ? `${base}/conflict?id=${conflictId}`
              : undefined;
    $: pageTitlePrefix = contextMode === "composite" ? "Composite" : "Conflict";
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

    function getColumnLabels(header: string): Record<ColumnKey, string> {
        const labels = getAavaMetricLabels(header);
        return {
            name: "Alliance",
            primary_to_row: labels.primary_to_row,
            row_to_primary: labels.row_to_primary,
            net: "Net",
            total: "Total",
            primary_share_pct: labels.primary_share_pct,
            row_share_pct: labels.row_share_pct,
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
        const contextQuery = currentContextQuery();
        setQueryParam("id", contextQuery.id ?? null);
        setQueryParam("ids", contextQuery.ids ?? null);
        setQueryParam("aid", contextQuery.aid ?? null);

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
        saveCurrentQueryParams(getAavaQueryStorageKey());
    }

    function makeSelectionSnapshot(): AavaScopeSnapshot {
        const selectedName = primaryCoalition?.name ?? "Selected";
        const comparedName = vsCoalition?.name ?? "Compared";
        return {
            header: currentHeader,
            primaryCoalitionIndex: primaryCoalitionIndex as 0 | 1,
            primaryIds: [...selectedPrimaryIds],
            vsIds: [...selectedVsIds],
            label: `${selectedName} vs ${comparedName} · ${selectedPrimaryIds.length}/${selectedVsIds.length}`,
        };
    }

    function addAavaRankingWidget() {
        if (!contextSignature) return;
        if (selectedPrimaryIds.length === 0 || selectedVsIds.length === 0)
            return;
        const config = readScopedKpiConfig();
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
        saveScopedKpiConfig(config);
        refreshSharedKpiWidgets();
    }

    function addAavaMetricWidget() {
        if (!contextSignature) return;
        if (selectedPrimaryIds.length === 0 || selectedVsIds.length === 0)
            return;
        const config = readScopedKpiConfig();
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
        saveScopedKpiConfig(config);
        refreshSharedKpiWidgets();
    }

    function refreshSharedKpiWidgets() {
        if (!contextSignature) {
            sharedKpiWidgets = [];
            return;
        }
        const config = readScopedKpiConfig();
        const sanitized = Array.isArray(config.widgets)
            ? config.widgets
                  .map((item: unknown) => sanitizeKpiWidget(item, makeKpiId))
                  .filter(
                      (
                          item: ConflictKPIWidget | null,
                      ): item is ConflictKPIWidget => item !== null,
                  )
            : [];

        // Drop unsupported legacy widget shapes and keep storage aligned with current schema.
        if (
            !Array.isArray(config.widgets) ||
            sanitized.length !== config.widgets.length
        ) {
            config.widgets = sanitized;
            saveScopedKpiConfig(config);
        }

        sharedKpiWidgets = sanitized;
    }

    function removeSharedWidget(id: string) {
        if (!contextSignature) return;
        const config = readScopedKpiConfig();
        config.widgets = (config.widgets ?? []).filter(
            (widget) => widget.id !== id,
        );
        saveScopedKpiConfig(config);
        refreshSharedKpiWidgets();
    }

    function moveSharedWidget(id: string, delta: number) {
        if (!contextSignature) return;
        const config = readScopedKpiConfig();
        config.widgets = moveWidgetByDelta(config.widgets ?? [], id, delta);
        saveScopedKpiConfig(config);
        refreshSharedKpiWidgets();
    }

    function openKpiBuilderModal() {
        refreshSharedKpiWidgets();
        showKpiBuilderModal = true;
    }

    function closeKpiBuilderModal() {
        showKpiBuilderModal = false;
    }

    function metricDescription(metric: string): string {
        const labels = getAavaMetricLabels(currentHeader);
        const label = labels[metric as keyof typeof labels] ?? metric;
        if (metric === "primary_to_row") {
            return `${label}: selected coalition value toward each compared alliance.`;
        }
        if (metric === "row_to_primary") {
            return `${label}: compared coalition value toward the selected coalition.`;
        }
        if (metric === "net") {
            return `${label}: selected minus compared (positive favors selected).`;
        }
        if (metric === "total") {
            return `${label}: selected plus compared values.`;
        }
        if (metric === "primary_share_pct") {
            return `${label}: selected coalition share percentage by row.`;
        }
        if (metric === "row_share_pct") {
            return `${label}: compared coalition share percentage by row.`;
        }
        if (metric === "abs_net") {
            return `${label}: absolute net magnitude, ignoring direction.`;
        }
        return `${label}: AAvA snapshot metric for selected alliances.`;
    }

    function widgetManagerLabel(widget: ConflictKPIWidget): string {
        if (widget.kind === "preset") {
            return `Conflict preset: ${widget.key}`;
        }
        if (widget.kind === "ranking") {
            const metric =
                widget.source === "aava"
                    ? (aavaMetricLabels[
                          widget.metric as keyof typeof aavaMetricLabels
                      ] ?? widget.metric)
                    : widget.metric;
            const source = widget.source === "aava" ? "AAvA" : "Conflict";
            return `${source} ranking: top ${widget.limit} ${widget.entity}s by ${metric}`;
        }
        const metric =
            widget.source === "aava"
                ? (aavaMetricLabels[
                      widget.metric as keyof typeof aavaMetricLabels
                  ] ?? widget.metric)
                : widget.metric;
        return `${widget.aggregation.toUpperCase()} ${widget.entity} ${metric}`;
    }

    function aavaKpiSelectionReason(): string {
        if (selectedPrimaryIds.length > 0 && selectedVsIds.length > 0) {
            return "";
        }
        return "Select at least one alliance on both sides before adding snapshot widgets.";
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
        const cacheKey = `${header}|${primaryCoalitionIndex}|${primaryIds.join(".")}|${vsIds.join(".")}`;
        const cached = rowsCache.get(cacheKey);
        if (cached) return cached;
        const rows = buildAavaSelectionRows(_rawData, {
            header,
            primaryIds,
            vsIds,
            primaryCoalitionIndex: primaryCoalitionIndex as 0 | 1,
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

        const tableCallbacks: TableCallbacks = {
            cellFormatters: {
                formatAllianceLink: formatAllianceLinkCell,
                formatPercent: formatPercentCell,
            },
            actions: {
                download: downloadAavaTable,
            },
        };

        setupContainer(container, rowData, tableCallbacks);
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

    function openHeaderModal() {
        showHeaderModal = true;
    }

    function closeHeaderModal() {
        showHeaderModal = false;
    }

    function applyHeaderModal(event: CustomEvent<{ ids: SelectionId[] }>) {
        const nextHeader = firstSelectedString(event.detail.ids);
        if (!nextHeader) return;
        setHeader(nextHeader);
        showHeaderModal = false;
    }

    $: headerModalItems = buildStringSelectionItems(
        _rawData?.war_web.headers ?? [],
    );

    function swapPrimaryCoalition() {
        if (!_rawData) return;
        primaryCoalitionIndex = primaryCoalitionIndex === 0 ? 1 : 0;

        syncQueryParams();
        scheduleRenderTable();
    }

    function buildCoalitionModalItems(
        coalitionIndex: 0 | 1,
    ): SelectionModalItem[] {
        const coalition = _rawData?.coalitions[coalitionIndex];
        if (!coalition) return [];
        return buildCoalitionAllianceItems([coalition], formatAllianceName);
    }

    function openPrimaryAllianceModal() {
        primaryAllianceModalItems = buildCoalitionModalItems(
            primaryCoalitionIndex as 0 | 1,
        );
        showPrimaryAllianceModal = true;
    }

    function openVsAllianceModal() {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        vsAllianceModalItems = buildCoalitionModalItems(vsIndex);
        showVsAllianceModal = true;
    }

    function closePrimaryAllianceModal() {
        showPrimaryAllianceModal = false;
    }

    function closeVsAllianceModal() {
        showVsAllianceModal = false;
    }

    function applyPrimaryAllianceModal(
        event: CustomEvent<{ ids: SelectionId[] }>,
    ) {
        const nextIds = toNumberSelection(event.detail.ids);
        setCoalitionSelection(primaryCoalitionIndex as 0 | 1, nextIds, {
            allowEmpty: true,
        });
        showPrimaryAllianceModal = false;
        syncQueryParams();
        scheduleRenderTable();
    }

    function applyVsAllianceModal(event: CustomEvent<{ ids: SelectionId[] }>) {
        const vsIndex = (primaryCoalitionIndex === 0 ? 1 : 0) as 0 | 1;
        const nextIds = toNumberSelection(event.detail.ids);
        setCoalitionSelection(vsIndex, nextIds, { allowEmpty: true });
        showVsAllianceModal = false;
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
            contextPreserveParams(),
        );
        saveCurrentQueryParams(getAavaQueryStorageKey());
        scheduleRenderTable();
    }

    function retryLoad() {
        if (!resolvedContext) return;
        loadFromContext(resolvedContext);
    }

    function applyResolvedRouteContext(context: ConflictRouteContext) {
        resolvedContext = context;
        contextMode = context.mode;
        conflictId = context.conflictId;
        compositeIds =
            context.mode === "composite"
                ? [...context.compositeIds]
                : null;
        selectedAllianceId = context.selectedAllianceId;
        contextSignature = context.conflictSignature;
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

    function loadFromContext(context: ConflictRouteContext) {
        _loadError = null;
        _loaded = false;
        clearRowsCache();

        loadConflictContext(context, config.version.conflict_data)
            .then(async (resolved) => {
                if (resolved.mode === "composite" && !resolved.aavaCapable) {
                    const reasons = resolved.aavaIncompatibilities.length
                        ? resolved.aavaIncompatibilities.join(" ")
                        : "Composite conflict does not have a valid merged war-web matrix.";
                    throw new Error(reasons);
                }

                contextSignature = resolved.signature;
                compositeLoadWarnings = [...resolved.warnings];

                _rawData = resolved.conflict;
                conflictName = resolved.conflict.name;
                datasetProvenance = formatDatasetProvenance(
                    config.version.conflict_data,
                    (resolved.conflict as any).update_ms,
                );
                hydrateStateFromQuery(resolved.conflict);
                await tick();
                await yieldToMain();
                renderTable();
                _loaded = true;
                refreshSharedKpiWidgets();
                saveCurrentQueryParams(getAavaQueryStorageKey());

                if (resolved.mode === "single" && resolved.conflictId) {
                    const graphUrl = getConflictGraphDataUrl(
                        resolved.conflictId,
                        config.version.graph_data,
                    );
                    queueUrlPrefetch(graphUrl, {
                        priority: "idle",
                        crossRoute: true,
                    });
                }
            })
            .catch((error) => {
                console.error("Failed to load AAvA data", error);
                _loadError = error instanceof Error
                    ? error.message
                    : "Could not load conflict web data. Please try again later.";
                _loaded = true;
            });
    }

    onMount(() => {
        bootstrapConflictRouteLifecycle({
            restoreParams: ["header", "pc", "columns", "cols"],
            preserveParams: ["id", "ids", "aid"],
            storageKey: (query) => getAavaQueryStorageKey(query),
            onBeforeResolve: () => {
                addFormatters();
            },
            onMissingContext: () => {
                _loadError = "Missing conflict context in URL (expected id or ids+aid).";
                _loaded = true;
            },
            onResolvedContext: (context) => {
                applyResolvedRouteContext(context);
                loadFromContext(context);
            },
        });
    });
</script>

<svelte:head>
    <title>AAvA {pageTitlePrefix}: {conflictName}</title>
</svelte:head>

<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: `${base}/` },
                    { label: "Conflicts", href: `${base}/conflicts` },
                    {
                        label: conflictName || pageTitlePrefix,
                        href: conflictBackHref,
                    },
                    { label: "AAvA" },
                ]}
            />
            <span class="ux-page-title-main">{pageTitlePrefix}: {conflictName}</span>
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
    <ConflictRouteTabs
        conflictId={tabConflictId}
        active="aava"
        routeKind={tabRouteKind}
        compositeIds={tabCompositeIds}
        selectedAllianceId={tabSelectedAllianceId}
        capabilities={aavaTabCapabilities}
    />

    {#if contextMode === "composite" && compositeLoadWarnings.length > 0}
        <div class="alert alert-warning py-2 mb-2">
            Composite merge warnings: {compositeLoadWarnings.length}
        </div>
    {/if}

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
                <button class="btn ux-btn btn-sm" on:click={openKpiBuilderModal}
                    >KPI Builder</button
                >
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
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">Header: {currentHeader}</span>
                    <button
                        class="btn ux-btn btn-sm fw-bold"
                        on:click={openHeaderModal}
                    >
                        Choose metric header
                    </button>
                </div>
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
                                ({primaryCoalition?.name})
                                {selectedPrimaryIds.length}/{primaryCoalition
                                    ?.alliance_ids.length ?? 0}
                            </strong>
                        </div>
                        <div class="small ux-muted">
                            Use "Edit alliances" to search, bulk-select, or
                            clear coalition alliances.
                        </div>
                        <div class="mt-2">
                            <button
                                class="btn ux-btn btn-sm fw-bold"
                                on:click={openPrimaryAllianceModal}
                            >
                                Edit alliances
                            </button>
                        </div>
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
                                ({vsCoalition?.name})
                                {selectedVsIds.length}/{vsCoalition
                                    ?.alliance_ids.length ?? 0}
                            </strong>
                        </div>
                        <div class="small ux-muted">
                            Use "Edit alliances" to search, bulk-select, or
                            clear coalition alliances.
                        </div>
                        <div class="mt-2">
                            <button
                                class="btn ux-btn btn-sm fw-bold"
                                on:click={openVsAllianceModal}
                            >
                                Edit alliances
                            </button>
                        </div>
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

    <SelectionModal
        open={showHeaderModal}
        title="Choose Metric Header"
        description="Pick the active war web header used for AAvA calculations."
        items={headerModalItems}
        selectedIds={[currentHeader]}
        applyLabel="Use header"
        singleSelect={true}
        searchPlaceholder="Search headers..."
        on:close={closeHeaderModal}
        on:apply={applyHeaderModal}
        validateSelection={(ids) => validateSingleSelection(ids, "header")}
    />

    <KpiBuilderModal
        open={showKpiBuilderModal}
        title="AAvA KPI Builder"
        description="Create shared KPI widgets from the active AAvA snapshot and maintain widget order."
        widgets={sharedKpiWidgets}
        showMetricGlossary={true}
        showPresetSection={false}
        rankingEntityOptions={[{ value: "alliance", label: "Alliance" }]}
        metricEntityOptions={[{ value: "alliance", label: "Alliance" }]}
        scopeOptions={[{ value: "selection", label: "Selection snapshot" }]}
        rankingEntityToAdd="alliance"
        rankingScopeToAdd="selection"
        metricEntityToAdd="alliance"
        metricScopeToAdd="selection"
        metricsOptions={AAVA_METRIC_KEYS}
        selectedSnapshotLabel={makeSelectionSnapshot().label}
        canAddRanking={selectedPrimaryIds.length > 0 &&
            selectedVsIds.length > 0}
        canAddMetric={selectedPrimaryIds.length > 0 && selectedVsIds.length > 0}
        canAddRankingReason={aavaKpiSelectionReason()}
        canAddMetricReason={aavaKpiSelectionReason()}
        {widgetManagerLabel}
        metricLabel={(metric) =>
            aavaMetricLabels[metric as keyof typeof aavaMetricLabels] ?? metric}
        {metricDescription}
        on:close={closeKpiBuilderModal}
        on:removeWidget={(event) => removeSharedWidget(event.detail.id)}
        on:moveWidget={(event) =>
            moveSharedWidget(event.detail.id, event.detail.delta)}
        on:addRanking={addAavaRankingWidget}
        on:addMetric={addAavaMetricWidget}
        bind:rankingMetricToAdd
        bind:rankingLimitToAdd
        bind:metricMetricToAdd
        bind:metricAggToAdd
        bind:metricNormalizeByToAdd
    />

    <SelectionModal
        open={showPrimaryAllianceModal}
        title={`Selected coalition: ${primaryCoalition?.name ?? ""}`}
        description="Choose alliances to include in the selected coalition set."
        items={primaryAllianceModalItems}
        selectedIds={selectedPrimaryIds}
        searchPlaceholder="Search selected coalition alliances..."
        on:close={closePrimaryAllianceModal}
        on:apply={applyPrimaryAllianceModal}
    />

    <SelectionModal
        open={showVsAllianceModal}
        title={`Compared coalition: ${vsCoalition?.name ?? ""}`}
        description="Choose alliances to include in the compared coalition set."
        items={vsAllianceModalItems}
        selectedIds={selectedVsIds}
        searchPlaceholder="Search compared coalition alliances..."
        on:close={closeVsAllianceModal}
        on:apply={applyVsAllianceModal}
    />

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
