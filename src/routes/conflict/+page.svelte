<script lang="ts">
    import { base } from "$app/paths";
    import { onDestroy, onMount } from "svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import ColumnPresetManager from "../../components/ColumnPresetManager.svelte";
    import ConflictKpiSection from "../../components/ConflictKpiSection.svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import KpiBuilderModal from "../../components/KpiBuilderModal.svelte";
    import Progress from "../../components/Progress.svelte";
    import SelectionModal from "../../components/SelectionModal.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import { getAavaMetricLabel } from "$lib/aava";
    import {
        normalizeConflictLayoutColumns,
        parseConflictLayoutQuery,
        serializeConflictLayoutQuery,
    } from "$lib/conflictLayoutQueryState";
    import {
        createConflictKpiProvider,
        type ConflictKpiProvider,
    } from "$lib/conflictGrid/conflictKpiProvider";
    import { createConflictGridProvider } from "$lib/conflictGrid/conflictGridProvider";
    import type {
        ConflictGridMeta,
        ConflictGridPresetMetrics,
        ConflictKpiRankingRow,
    } from "$lib/conflictGrid/protocol";
    import {
        ConflictGridLayout,
        conflictGridLayoutLabel,
    } from "$lib/conflictGrid/rowIds";
    import {
        createConflictGridWorkerClient,
        type ConflictGridWorkerClient,
    } from "$lib/conflictGrid/workerClient";
    import {
        DEFAULT_KPI_WIDGETS,
        PRESET_CARD_DESCRIPTIONS,
        PRESET_CARD_LABELS,
        buildSelectionSnapshot as buildSelectionSnapshotFromState,
        formatKpiNumber,
        hasSelectionForScope as hasSelectionForScopeFromState,
        kpiAddReasonForScope as kpiAddReasonForScopeFromState,
        loadSharedKpiWidgets,
        parseKpiWidgetsFromUrl as parseKpiWidgetsFromUrlWithId,
        persistSharedKpiWidgets,
        sanitizeKpiWidgets,
        scopeLabel as scopeLabelFromState,
        serializeKpiWidgetsForUrl as serializeKpiWidgetsForUrlWithId,
        splitKpiWidgets,
        stripWidgetIds,
    } from "$lib/conflictKpiState";
    import type { ConflictKpiContext } from "$lib/conflictKpiTypes";
    import { createConflictKpiWidgetActions } from "$lib/conflictKpiWidgetActions";
    import {
        CONFLICT_TABLE_LAYOUT_PRESETS,
        CONFLICT_TABLE_LAYOUT_PRESET_KEYS,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY,
        createDefaultConflictTableLayoutState,
        detectConflictTableLayoutPresetKey,
        isConflictTableLayoutStateEqual,
    } from "$lib/conflictTablePresets";
    import { layoutTabFromIndex } from "$lib/conflictTabs";
    import { formatAllianceName, formatDate, formatDuration, formatNationName } from "$lib/formatting";
    import { getVisGlobal } from "$lib/globals";
    import DataGrid from "$lib/grid/DataGrid.svelte";
    import {
        parseGridPageSizeQueryState,
        serializeGridPageSizeQueryState,
    } from "$lib/grid/queryState";
    import type {
        GridDataProvider,
        GridPageResult,
        GridPageSize,
        GridQueryState,
    } from "$lib/grid/types";
    import {
        makeKpiId,
        type ConflictKPIWidget,
        type MetricCard,
        type PresetCard,
        type PresetCardKey,
        type RankingCard,
        type WidgetEntity,
        type WidgetScope,
    } from "$lib/kpi";
    import { beginJourneySpan, endJourneySpan } from "$lib/perf";
    import {
        warmBubbleDefaultArtifact,
        warmConflictGraphPayload,
        warmTieringDefaultArtifact,
    } from "$lib/prefetchArtifacts";
    import {
        bootstrapIdRouteLifecycle,
    } from "$lib/routeBootstrap";
    import {
        decodeQueryParamValue,
        getCurrentQueryParams,
        setQueryParams,
    } from "$lib/queryState";
    import { getPageStorageKey, saveCurrentQueryParams } from "$lib/queryStorage";
    import {
        buildStringSelectionItems,
        firstSelectedString,
        validateSingleSelection,
    } from "$lib/selectionModalHelpers";
    import type {
        SelectionId,
        SelectionModalItem,
    } from "$lib/selection/types";
    import type { ColumnPreset } from "$lib/columnPresets";
    import {
        formatDatasetProvenance,
    } from "$lib/runtime";
    import { openConflictCoalitionModal } from "$lib/conflictCoalitionModal";

    type KPIWidget = ConflictKPIWidget;
    const ALL_CONFLICT_GRID_LAYOUTS = [
        ConflictGridLayout.COALITION,
        ConflictGridLayout.ALLIANCE,
        ConflictGridLayout.NATION,
    ] as const;

    const layouts = CONFLICT_TABLE_LAYOUT_PRESETS;
    const layoutPresetKeys = CONFLICT_TABLE_LAYOUT_PRESET_KEYS;
    const getVis = (): any => getVisGlobal();

    let shellReady = false;
    let metaReady = false;
    let tableReady = false;
    let presetKpiReady = false;
    let secondaryReady = false;
    let secondaryKpiReady = false;
    let timelineReady = false;

    let conflictName = "";
    let conflictId: string | null = null;
    let trimmedConflictId = "";
    let isVirtualConflictId = false;
    let virtualConflictEditUrl: string | null = null;
    let datasetProvenance = "";
    let _loadError: string | null = null;

    let conflictMeta: ConflictGridMeta | null = null;
    let presetMetrics: ConflictGridPresetMetrics | null = null;

    let conflictGridClient: ConflictGridWorkerClient | null = null;
    let conflictKpiProvider: ConflictKpiProvider | null = null;
    let conflictGridProvider: GridDataProvider | null = null;
    let conflictGridPageSizePreference: GridPageSize | null = null;
    let conflictGridInitialState: Partial<GridQueryState> | null = null;
    let conflictGridResetVersion = 0;

    let _layoutData = createDefaultConflictTableLayoutState();
    let currentLayoutLabel = conflictGridLayoutLabel(_layoutData.layout);

    let kpiWidgets: KPIWidget[] = [...DEFAULT_KPI_WIDGETS];
    let presetCards: PresetCard[] = [];
    let rankingCards: RankingCard[] = [];
    let metricCards: MetricCard[] = [];
    let draggingWidgetId: string | null = null;
    let kpiCollapsed = false;
    let showLayoutPresetModal = false;
    let showKpiBuilderModal = false;
    let showPresetOverflowMenu = false;
    let selectedLayoutPresetKey: string | null = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;

    let rankingRowsByWidgetId: Record<string, ConflictKpiRankingRow[] | undefined> = {};
    let metricValuesByWidgetId: Record<string, number | null | undefined> = {};

    let layoutPresetViewportEl: HTMLDivElement | null = null;
    let layoutPresetButtonsEl: HTMLDivElement | null = null;
    let layoutPresetResizeObserver: ResizeObserver | null = null;

    let selectedAllianceIdsForKpi = new Set<number>();
    let selectedNationIdsForKpi = new Set<number>();
    let selectedSnapshotLabel = "No selection";

    let rankingEntityToAdd: WidgetEntity = "nation";
    let rankingMetricToAdd = "net:damage";
    let rankingScopeToAdd: WidgetScope = "all";
    let rankingLimitToAdd = 10;

    let metricEntityToAdd: WidgetEntity = "nation";
    let metricMetricToAdd = "net:damage";
    let metricScopeToAdd: WidgetScope = "all";
    let metricAggToAdd: "sum" | "avg" = "sum";
    let metricNormalizeByToAdd = "";
    let metricsOptions: string[] = [];
    let metricTitleByKey: Record<string, string> = {};

    let latestLoadToken = 0;
    let latestSelectionToken = 0;
    let latestSecondaryToken = 0;
    let lastSelectionKey = "";
    let lastSecondaryDependencyKey = "";

    let postsData: { [key: string]: [number, string, number] } | null = null;

    const kpiCollapseStorageKey = () => `${getPageStorageKey()}:kpi-collapsed`;

    function destroyClient(): void {
        conflictGridClient?.destroy();
        conflictGridClient = null;
        conflictKpiProvider = null;
        conflictGridProvider = null;
    }

    function clearSelectionSnapshot(): void {
        latestSelectionToken += 1;
        lastSelectionKey = "";
        selectedAllianceIdsForKpi = new Set<number>();
        selectedNationIdsForKpi = new Set<number>();
        selectedSnapshotLabel = "No selection";
    }

    function clearHydrationState(): void {
        tableReady = false;
        presetKpiReady = false;
        secondaryReady = false;
        secondaryKpiReady = false;
        timelineReady = false;
        rankingRowsByWidgetId = {};
        metricValuesByWidgetId = {};
        postsData = null;
        clearSelectionSnapshot();
        lastSecondaryDependencyKey = "";
        latestSecondaryToken += 1;
    }

    function updateSecondaryReady(): void {
        secondaryReady = tableReady && secondaryKpiReady && timelineReady;
    }

    function scheduleIdleWork(work: () => void): void {
        if (typeof window === "undefined") {
            work();
            return;
        }

        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (
                callback: IdleRequestCallback,
                options?: IdleRequestOptions,
            ) => number;
        };

        if (typeof idleWindow.requestIdleCallback === "function") {
            idleWindow.requestIdleCallback(() => work(), { timeout: 1500 });
            return;
        }

        window.setTimeout(work, 160);
    }

    function queueNonCurrentLayoutWarmup(): void {
        const client = conflictGridClient;
        const activeLayout = _layoutData.layout;
        if (!client) return;

        const nextLayouts = ALL_CONFLICT_GRID_LAYOUTS.filter(
            (layout) => layout !== activeLayout,
        );
        scheduleIdleWork(() => {
            if (client !== conflictGridClient) return;
            void client.prewarmLayouts(nextLayouts, true).catch((error) => {
                console.warn("Failed to prewarm non-current conflict layouts", error);
            });
        });
    }

    function buildConflictGridInitialState(): Partial<GridQueryState> {
        const normalizedColumns = normalizeConflictLayoutColumns(
            _layoutData.layout,
            _layoutData.columns,
        );
        return {
            sort: {
                key: _layoutData.sort,
                dir: _layoutData.order,
            },
            visibleColumnKeys: [...normalizedColumns],
            columnOrderKeys: [...normalizedColumns],
            pageIndex: 0,
            pageSize: conflictGridPageSizePreference ?? 10,
            filters: {},
            expandedRowIds: [],
            selectedRowIds: [],
        };
    }

    function resetConflictGridState(): void {
        conflictGridInitialState = buildConflictGridInitialState();
        conflictGridResetVersion += 1;
        clearSelectionSnapshot();
    }

    function saveKpiConfig(): void {
        persistSharedKpiWidgets(conflictId, kpiWidgets);
    }

    function applyKpiConfig(config: unknown): void {
        if (!config || typeof config !== "object") return;
        const parsed = sanitizeKpiWidgets(
            (config as { widgets?: unknown }).widgets,
            makeKpiId,
        );
        if (parsed.length > 0) {
            kpiWidgets = parsed;
        }
    }

    function applyAndPersistKpiConfig(config: unknown): void {
        applyKpiConfig(config);
        saveKpiConfig();
    }

    function replaceWithPresetCards(keys: PresetCardKey[]): void {
        if (keys.length === 0) return;
        kpiWidgets = keys.map((key) => ({
            id: makeKpiId("preset"),
            kind: "preset",
            key,
        }));
        saveKpiConfig();
    }

    function loadKpiWidgets(id: string, query: URLSearchParams): void {
        const stored = loadSharedKpiWidgets(id, makeKpiId);
        kpiWidgets = stored ?? [...DEFAULT_KPI_WIDGETS];

        const decodedWidgets = decodeQueryParamValue("kpiw", query.get("kpiw"));
        if (!decodedWidgets) return;

        try {
            const parsed = parseKpiWidgetsFromUrlWithId(
                decodedWidgets,
                makeKpiId,
            );
            if (parsed.length > 0) {
                kpiWidgets = parsed;
            }
        } catch (error) {
            console.warn("Failed to parse KPI widgets from URL", error);
        }
    }

    function loadLayoutFromQuery(query: URLSearchParams): void {
        const nextLayoutState = parseConflictLayoutQuery(query, {
            layout: ConflictGridLayout.COALITION,
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
        });
        _layoutData.layout = nextLayoutState.layout;
        _layoutData.sort = nextLayoutState.sort;
        _layoutData.order = nextLayoutState.order;
        _layoutData.columns = nextLayoutState.columns;
        selectedLayoutPresetKey = detectLayoutPresetKey();
    }

    function buildLayoutPresetItems(): SelectionModalItem[] {
        return buildStringSelectionItems(layoutPresetKeys);
    }

    function syncMetricOptions(columns: Array<{ key: string; title: string; summary?: string | null }>): void {
        const labels: Record<string, string> = {};
        columns.forEach((column) => {
            labels[column.key] = column.title;
        });
        metricTitleByKey = labels;

        const nextMetricOptions = columns
            .filter(
                (column) =>
                    column.key !== "name" &&
                    column.key !== "alliance" &&
                    column.summary === "sum-avg",
            )
            .map((column) => column.key);
        metricsOptions = nextMetricOptions;

        const fallbackMetric = nextMetricOptions[0] ?? "net:damage";
        if (!nextMetricOptions.includes(rankingMetricToAdd)) {
            rankingMetricToAdd = fallbackMetric;
        }
        if (!nextMetricOptions.includes(metricMetricToAdd)) {
            metricMetricToAdd = fallbackMetric;
        }
        if (metricNormalizeByToAdd && !nextMetricOptions.includes(metricNormalizeByToAdd)) {
            metricNormalizeByToAdd = "";
        }
    }

    function metricLabel(metric: string): string {
        return metricTitleByKey[metric] ?? metric;
    }

    function metricDescription(metric: string): string {
        const label = metricLabel(metric);
        const [prefix] = metric.split(":", 1);
        if (prefix === "net") {
            return `${label}: dealt value minus received value.`;
        }
        if (prefix === "dealt") {
            return `${label}: value dealt by the selected entity.`;
        }
        if (prefix === "loss") {
            return `${label}: value received or lost by the selected entity.`;
        }
        if (prefix === "off") {
            return `${label}: offensive activity count for the selected entity.`;
        }
        if (prefix === "def") {
            return `${label}: defensive activity count for the selected entity.`;
        }
        if (prefix === "both") {
            return `${label}: combined offensive and defensive activity for the selected entity.`;
        }
        return `${label}: summed or averaged over the selected scope.`;
    }

    function widgetMetricLabel(widget: RankingCard | MetricCard): string {
        if (widget.source === "aava") {
            return getAavaMetricLabel(
                widget.metric,
                widget.aavaSnapshot?.header ?? "wars",
            );
        }
        return metricLabel(widget.metric);
    }

    function widgetNormalizeLabel(widget: MetricCard): string | null {
        if (!widget.normalizeBy) return null;
        if (widget.source === "aava") {
            return getAavaMetricLabel(
                widget.normalizeBy,
                widget.aavaSnapshot?.header ?? "wars",
            );
        }
        return metricLabel(widget.normalizeBy);
    }

    function widgetScopeLabel(widget: ConflictKPIWidget): string {
        if (
            (widget.kind === "ranking" || widget.kind === "metric") &&
            widget.source === "aava"
        ) {
            const snapshotLabel = widget.aavaSnapshot?.label || "AAvA snapshot";
            const header = widget.aavaSnapshot?.header || "wars";
            return `AAvA (${snapshotLabel} · ${header})`;
        }
        if (widget.kind === "preset") return "Preset";
        return scopeLabelFromState(widget.scope, widget.snapshot);
    }

    function widgetManagerLabel(widget: ConflictKPIWidget): string {
        if (widget.kind === "preset") {
            return PRESET_CARD_LABELS[widget.key];
        }
        if (widget.kind === "ranking") {
            return `${widget.entity} · ${widgetMetricLabel(widget)} · ${widgetScopeLabel(widget)} · top ${widget.limit}`;
        }
        const normalized = widgetNormalizeLabel(widget)
            ? ` per ${widgetNormalizeLabel(widget)}`
            : "";
        return `${widget.aggregation.toUpperCase()} ${widget.entity} · ${widgetMetricLabel(widget)}${normalized} · ${widgetScopeLabel(widget)}`;
    }

    const conflictKpiContext: ConflictKpiContext = {
        data: {
            getRawData: () => null,
            getEntityTable: () => null,
            getNamesByAllianceId: () => ({}),
            formatAllianceName,
            formatNationName,
        },
        widgets: {
            getWidgets: () => kpiWidgets,
            setWidgets: (widgets) => {
                kpiWidgets = widgets;
            },
            persistWidgets: (widgets) => {
                persistSharedKpiWidgets(conflictId, widgets);
            },
            makeId: makeKpiId,
        },
        selection: {
            hasSelectionForScope: (scope) =>
                hasSelectionForScopeFromState(
                    scope,
                    selectedAllianceIdsForKpi,
                    selectedNationIdsForKpi,
                ),
            buildSelectionSnapshot: () =>
                buildSelectionSnapshotFromState(
                    selectedAllianceIdsForKpi,
                    selectedNationIdsForKpi,
                ),
            scopeLabel: (scope, snapshot) =>
                scopeLabelFromState(scope, snapshot),
        },
        presentation: {
            presetCardLabels: PRESET_CARD_LABELS,
            trimHeader: metricLabel,
            getAavaMetricLabel,
        },
    };

    const kpiWidgetActions = createConflictKpiWidgetActions({
        context: conflictKpiContext,
    });

    function startWidgetDrag(widgetId: string): void {
        draggingWidgetId = widgetId;
    }

    function endWidgetDrag(): void {
        draggingWidgetId = null;
    }

    function dropWidgetOn(targetWidgetId: string): void {
        if (!draggingWidgetId || draggingWidgetId === targetWidgetId) {
            draggingWidgetId = null;
            return;
        }
        const targetIndex = kpiWidgets.findIndex((widget) => widget.id === targetWidgetId);
        if (targetIndex === -1) {
            draggingWidgetId = null;
            return;
        }
        kpiWidgetActions.moveWidgetToIndex(draggingWidgetId, targetIndex);
        draggingWidgetId = null;
    }

    function toggleKpiCollapsed(): void {
        kpiCollapsed = !kpiCollapsed;
        localStorage.setItem(kpiCollapseStorageKey(), kpiCollapsed ? "1" : "0");
    }

    function showKpi(): void {
        if (!kpiCollapsed) return;
        kpiCollapsed = false;
        localStorage.setItem(kpiCollapseStorageKey(), "0");
    }

    function isSameLayoutState(input: {
        sort: string;
        order: string;
        columns: string[];
    }): boolean {
        return isConflictTableLayoutStateEqual(_layoutData, {
            sort: input.sort,
            order: input.order === "asc" ? "asc" : "desc",
            columns: input.columns,
        });
    }

    function detectLayoutPresetKey(): string | null {
        return detectConflictTableLayoutPresetKey(_layoutData);
    }

    function updateLayoutPresetMode(): void {
        if (!layoutPresetViewportEl || !layoutPresetButtonsEl) {
            showPresetOverflowMenu = true;
            return;
        }
        showPresetOverflowMenu =
            layoutPresetButtonsEl.scrollWidth > layoutPresetViewportEl.clientWidth;
    }

    function openLayoutPresetModal(): void {
        showLayoutPresetModal = true;
    }

    function closeLayoutPresetModal(): void {
        showLayoutPresetModal = false;
    }

    function openKpiBuilderModal(): void {
        showKpiBuilderModal = true;
    }

    function closeKpiBuilderModal(): void {
        showKpiBuilderModal = false;
    }

    function applyLayoutPresetModal(
        event: CustomEvent<{ ids: SelectionId[] }>,
    ): void {
        const key = firstSelectedString(event.detail.ids);
        if (!key || !(key in layouts)) return;
        applyLayoutPresetKey(key);
        showLayoutPresetModal = false;
    }

    function queryDefaults() {
        return {
            layout: "coalition",
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns.join("."),
            kpiw: serializeKpiWidgetsForUrlWithId(DEFAULT_KPI_WIDGETS, makeKpiId),
        };
    }

    type SyncUrlStateOptions = {
        includeKpi?: boolean;
        replace?: boolean;
        persist?: boolean;
        clearLayoutSortAndColumns?: boolean;
    };

    function syncUrlState(options: SyncUrlStateOptions = {}): void {
        const values: Record<string, string | number | boolean | null | undefined> = {
            ...serializeConflictLayoutQuery(_layoutData, {
                clearSortAndColumns: options.clearLayoutSortAndColumns,
            }),
            grid: serializeGridPageSizeQueryState(conflictGridPageSizePreference),
        };

        if (options.includeKpi) {
            values.kpiw = serializeKpiWidgetsForUrlWithId(kpiWidgets, makeKpiId);
        }

        setQueryParams(values, {
            replace: options.replace ?? false,
            defaults: queryDefaults(),
        });

        if (options.persist) {
            saveCurrentQueryParams();
        }
    }

    function syncShareStateToUrl(): void {
        syncUrlState({ includeKpi: true, replace: true, persist: true });
    }

    function applyLayoutPresetKey(key: string): void {
        const layout = layouts[key];
        if (!layout) return;
        const nextOrder: "asc" | "desc" = layout.order === "asc" ? "asc" : "desc";
        const nextColumns = normalizeConflictLayoutColumns(
            _layoutData.layout,
            layout.columns,
        );
        if (
            isSameLayoutState({
                sort: layout.sort,
                order: nextOrder,
                columns: nextColumns,
            })
        ) {
            return;
        }

        _layoutData.columns = nextColumns;
        _layoutData.sort = layout.sort;
        _layoutData.order = nextOrder;
        selectedLayoutPresetKey = key;
        resetConflictGridState();
        syncUrlState({ persist: true });
    }

    function handleColumnPresetLoad(preset: ColumnPreset): void {
        const nextSort = preset.sort || _layoutData.sort;
        const nextOrder: "asc" | "desc" =
            preset.order === "asc"
                ? "asc"
                : preset.order === "desc"
                  ? "desc"
                  : _layoutData.order;
        const nextColumns = Array.isArray(preset.columns)
            ? normalizeConflictLayoutColumns(_layoutData.layout, preset.columns)
            : normalizeConflictLayoutColumns(_layoutData.layout, _layoutData.columns);

        const noLayoutChange = isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
        });

        _layoutData.columns = nextColumns;
        _layoutData.sort = nextSort;
        _layoutData.order = nextOrder;
        selectedLayoutPresetKey = detectLayoutPresetKey();

        if (preset.kpiConfig) {
            applyAndPersistKpiConfig(preset.kpiConfig);
        } else if (Array.isArray(preset.kpis) && preset.kpis.length > 0) {
            const keys = preset.kpis
                .filter((key: string) => key in PRESET_CARD_LABELS)
                .map((key: string) => key as PresetCardKey);
            if (keys.length > 0) {
                replaceWithPresetCards(keys);
            }
        }

        syncUrlState({ persist: true });
        if (!noLayoutChange) {
            resetConflictGridState();
        }
    }

    function handleClick(layout: number): void {
        _layoutData.layout =
            layout === ConflictGridLayout.ALLIANCE
                ? ConflictGridLayout.ALLIANCE
                : layout === ConflictGridLayout.NATION
                  ? ConflictGridLayout.NATION
                  : ConflictGridLayout.COALITION;
        _layoutData.columns = normalizeConflictLayoutColumns(
            _layoutData.layout,
            _layoutData.columns,
        );
        selectedLayoutPresetKey = detectLayoutPresetKey();
        resetConflictGridState();
        syncUrlState({ clearLayoutSortAndColumns: true, persist: true });
    }

    function resetFilters(): void {
        _layoutData.layout = ConflictGridLayout.COALITION;
        _layoutData.columns = normalizeConflictLayoutColumns(
            ConflictGridLayout.COALITION,
            DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns,
        );
        _layoutData.sort = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort;
        _layoutData.order = "desc";
        selectedLayoutPresetKey = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;
        kpiWidgetActions.setWidgets([...DEFAULT_KPI_WIDGETS]);
        conflictGridPageSizePreference = null;
        resetConflictGridState();
        syncUrlState({ includeKpi: true, replace: true, persist: true });
    }

    function applySelectionSnapshot(snapshot: {
        allianceIds: number[];
        nationIds: number[];
        label: string;
    }): void {
        selectedAllianceIdsForKpi = new Set(snapshot.allianceIds);
        selectedNationIdsForKpi = new Set(snapshot.nationIds);
        selectedSnapshotLabel = snapshot.label;
    }

    function selectionDependencyKey(): string {
        return JSON.stringify({
            allianceIds: [...selectedAllianceIdsForKpi].sort((left, right) => left - right),
            nationIds: [...selectedNationIdsForKpi].sort((left, right) => left - right),
            label: selectedSnapshotLabel,
        });
    }

    async function hydrateSecondaryWidgets(): Promise<void> {
        if (!tableReady || !conflictKpiProvider) return;
        const kpiProvider = conflictKpiProvider;
        const token = ++latestSecondaryToken;
        const secondaryWidgets = kpiWidgets.filter(
            (widget) => widget.kind === "ranking" || widget.kind === "metric",
        );

        rankingRowsByWidgetId = {};
        metricValuesByWidgetId = {};

        if (secondaryWidgets.length === 0) {
            secondaryKpiReady = true;
            updateSecondaryReady();
            return;
        }

        secondaryKpiReady = false;
        updateSecondaryReady();

        try {
            const nextRankingRows: Record<string, ConflictKpiRankingRow[]> = {};
            const nextMetricValues: Record<string, number | null> = {};

            await Promise.all(
                secondaryWidgets.map(async (widget) => {
                    if (widget.kind === "ranking") {
                        nextRankingRows[widget.id] = await kpiProvider.getRankingRows(widget);
                        return;
                    }
                    nextMetricValues[widget.id] = await kpiProvider.getMetricCardValue(widget);
                }),
            );

            if (token !== latestSecondaryToken) return;
            rankingRowsByWidgetId = nextRankingRows;
            metricValuesByWidgetId = nextMetricValues;
        } catch (error) {
            if (token !== latestSecondaryToken) return;
            console.warn("Failed to hydrate secondary KPI widgets", error);
        }

        if (token !== latestSecondaryToken) return;
        secondaryKpiReady = true;
        updateSecondaryReady();
    }

    function initializeTimeline(): void {
        if (!tableReady || !postsData || timelineReady) return;

        const script = document.getElementById("visjs");
        if (
            !((script && script.getAttribute("data-loaded")) ||
                typeof getVis() !== "undefined")
        ) {
            return;
        }

        if (!conflictMeta) return;
        const container = document.getElementById("visualization");
        if (!container) return;
        if (container.hasChildNodes()) {
            container.innerHTML = "";
        }

        const vis = getVis();
        const items = new vis.DataSet();
        for (const key in postsData) {
            const post = postsData[key];
            const id = post[0];
            const url = `https://forum.politicsandwar.com/index.php?/topic/${id}-${post[1]}`;
            const timestamp = post[2];
            items.add({
                id,
                content: `<a href="${url}" target="_blank">${key}</a>`,
                start: new Date(timestamp),
            });
        }

        const start = conflictMeta.start;
        const end = conflictMeta.end === -1 ? Date.now() : conflictMeta.end;
        const timeline = new vis.Timeline(container, items, {
            start,
            end,
            height: "75vh",
            width: "100%",
            zoomKey: "ctrlKey",
            orientation: "top",
            verticalScroll: true,
        });
        timeline.addCustomTime(start, "t1");
        timeline.addCustomTime(end, "t2");

        timelineReady = true;
        updateSecondaryReady();
    }

    function onScriptLoad(event: Event): void {
        const script = event.target as HTMLScriptElement;
        script.setAttribute("data-loaded", "true");
        initializeTimeline();
    }

    async function beginConflictLoad(id: string): Promise<void> {
        const token = ++latestLoadToken;
        _loadError = null;
        metaReady = false;
        datasetProvenance = "";
        conflictName = "";
        conflictMeta = null;
        presetMetrics = null;
        clearHydrationState();
        destroyClient();

        const client = createConflictGridWorkerClient({
            conflictId: id,
            version: config.version.conflict_data,
        });
        conflictGridClient = client;
        conflictKpiProvider = createConflictKpiProvider({
            client,
            bootstrapLayout: _layoutData.layout,
        });
        resetConflictGridState();
        beginJourneySpan("journey.conflicts_to_conflict.dataFetch", {
            conflictId: id,
        });

        try {
            const payload = await client.bootstrap(_layoutData.layout);
            if (token !== latestLoadToken) return;

            conflictMeta = payload.meta;
            presetMetrics = payload.presetMetrics;
            conflictName = payload.meta.name;
            datasetProvenance = formatDatasetProvenance(
                config.version.conflict_data,
                payload.meta.updateMs ?? undefined,
            );
            postsData =
                payload.meta.posts && Object.keys(payload.meta.posts).length > 0
                    ? payload.meta.posts
                    : null;
            timelineReady = !postsData;
            syncMetricOptions(payload.grid.columns);
            metaReady = true;
            presetKpiReady = tableReady;
            updateSecondaryReady();
            endJourneySpan("journey.conflicts_to_conflict.dataFetch");
        } catch (error) {
            if (token !== latestLoadToken) return;
            destroyClient();
            _loadError =
                error instanceof Error
                    ? error.message
                    : "Could not load conflict data. Please try again later.";
            metaReady = false;
            endJourneySpan("journey.conflicts_to_conflict.dataFetch");
        }
    }

    function loadRouteForConflict(id: string, query: URLSearchParams): void {
        conflictId = id;
        loadLayoutFromQuery(query);
        conflictGridPageSizePreference = parseGridPageSizeQueryState(
            decodeQueryParamValue("grid", query.get("grid")),
        );
        loadKpiWidgets(id, query);
        beginJourneySpan("journey.conflicts_to_conflict.firstMount", {
            conflictId: id,
        });
        void beginConflictLoad(id);
    }

    function retryLoad(): void {
        const query = getCurrentQueryParams();
        const id = (query.get("id") ?? conflictId ?? "").trim();
        if (!id) return;
        loadRouteForConflict(id, query);
    }

    function openCoalitionMembersModal(coalitionIndex: number): void {
        const coalition = conflictMeta?.coalitions[coalitionIndex];
        if (!coalition) return;

        openConflictCoalitionModal({
            title: `Coalition ${coalitionIndex + 1}: ${coalition.name}`,
            alliances: coalition.alliances,
        });
    }

    function handleConflictGridError(
        event: CustomEvent<{ message: string }>,
    ): void {
        _loadError = event.detail.message;
    }

    function handleConflictGridCellAction(
        event: CustomEvent<{
            rowId: string | number;
            columnKey: string;
            actionId: string;
            args?: Record<string, string | number | boolean | null>;
        }>,
    ): void {
        if (event.detail.actionId !== "show-coalition-members") return;
        const coalitionIndex = Number(event.detail.args?.coalitionIndex);
        if (!Number.isFinite(coalitionIndex)) return;
        openCoalitionMembersModal(coalitionIndex);
    }

    function handleConflictGridQueryResult(
        _event: CustomEvent<{ result: GridPageResult }>,
    ): void {
        const isFirstUsableTable = !tableReady;
        tableReady = true;
        if (metaReady) {
            presetKpiReady = true;
        }
        if (!postsData) {
            timelineReady = true;
        } else {
            initializeTimeline();
        }
        updateSecondaryReady();

        if (isFirstUsableTable) {
            endJourneySpan("journey.conflicts_to_conflict.firstMount");
            endJourneySpan("journey.conflicts_to_conflict.routeTransition");
            saveCurrentQueryParams();
            queueNonCurrentLayoutWarmup();

            if (conflictId) {
                warmConflictGraphPayload(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-graph-payload",
                    routeTarget: "/conflict",
                    intentStrength: "idle",
                });
                warmBubbleDefaultArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-bubble-default",
                    routeTarget: "/bubble",
                    intentStrength: "idle",
                });
                warmTieringDefaultArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-tiering-default",
                    routeTarget: "/tiering",
                    intentStrength: "idle",
                });
            }
        }
    }

    function handleConflictGridSelectionChange(
        event: CustomEvent<{ selectedRowIds: Array<string | number> }>,
    ): void {
        const rowIds = event.detail.selectedRowIds;
        const nextKey = rowIds.join("|");
        if (nextKey === lastSelectionKey) return;
        lastSelectionKey = nextKey;

        if (!conflictKpiProvider || rowIds.length === 0) {
            clearSelectionSnapshot();
            return;
        }

        const token = ++latestSelectionToken;
        void conflictKpiProvider
            .getSelectionSnapshot(_layoutData.layout, rowIds)
            .then((snapshot) => {
                if (token !== latestSelectionToken) return;
                applySelectionSnapshot(snapshot);
            })
            .catch((error) => {
                if (token !== latestSelectionToken) return;
                console.warn("Failed to resolve conflict KPI selection snapshot", error);
                clearSelectionSnapshot();
            });
    }

    function handleConflictGridStateChange(
        event: CustomEvent<{ state: GridQueryState }>,
    ): void {
        const state = event.detail.state;
        const visible = new Set(state.visibleColumnKeys);
        const orderedVisible = state.columnOrderKeys.filter((key) => visible.has(key));
        const nextColumns = normalizeConflictLayoutColumns(
            _layoutData.layout,
            orderedVisible.length > 0 ? orderedVisible : [..._layoutData.columns],
        );
        const nextSort = state.sort?.key ?? DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort;
        const nextOrder: "asc" | "desc" = state.sort?.dir === "asc" ? "asc" : "desc";
        const nextPageSize = state.pageSize === 10 ? null : state.pageSize;
        const layoutChanged = !isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
        });

        if (!layoutChanged && conflictGridPageSizePreference === nextPageSize) {
            return;
        }

        if (layoutChanged) {
            _layoutData.columns = nextColumns;
            _layoutData.sort = nextSort;
            _layoutData.order = nextOrder;
            selectedLayoutPresetKey = detectLayoutPresetKey();
        }

        conflictGridPageSizePreference = nextPageSize;
        syncUrlState({ replace: true, persist: true });
    }

    $: currentLayoutLabel = conflictGridLayoutLabel(_layoutData.layout);
    $: {
        const split = splitKpiWidgets(kpiWidgets);
        presetCards = split.presetCards;
        rankingCards = split.rankingCards;
        metricCards = split.metricCards;
    }
    $: durationSoFar = conflictMeta
        ? formatDuration(
              Math.max(
                  0,
                  Math.round(
                      ((conflictMeta.end === -1 ? Date.now() : conflictMeta.end) -
                          conflictMeta.start) /
                          1000,
                  ),
              ),
          )
        : "N/A";
    $: trimmedConflictId = conflictId?.trim() ?? "";
    $: isVirtualConflictId =
        trimmedConflictId.length > 0 && !/^\d+$/.test(trimmedConflictId);
    $: virtualConflictEditUrl = trimmedConflictId
        ? `https://locutus.link/#/temporary-conflicts?conflictId=${encodeURIComponent(trimmedConflictId)}`
        : null;
    $: if (layoutPresetViewportEl && layoutPresetButtonsEl) {
        updateLayoutPresetMode();
    }
    $: {
        const detectedKey = detectLayoutPresetKey();
        if (selectedLayoutPresetKey !== detectedKey) {
            selectedLayoutPresetKey = detectedKey;
        }
    }
    $: conflictGridProvider =
        conflictGridClient == null
            ? null
            : createConflictGridProvider({
                  client: conflictGridClient,
                  layout: _layoutData.layout,
                  defaultSort: {
                      key: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                      dir: "desc",
                  },
                  defaultVisibleColumnKeys: normalizeConflictLayoutColumns(
                      _layoutData.layout,
                      DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns,
                  ),
              });
    $: isResetDirty = (() => {
        const defaultColumns = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns;
        const sameColumns =
            _layoutData.columns.length === defaultColumns.length &&
            _layoutData.columns.every((value, index) => value === defaultColumns[index]);
        const sameLayout =
            _layoutData.layout === ConflictGridLayout.COALITION &&
            _layoutData.sort === DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort &&
            _layoutData.order === "desc" &&
            sameColumns;
        const currentWidgets = JSON.stringify(stripWidgetIds(kpiWidgets));
        const defaultWidgets = JSON.stringify(stripWidgetIds(DEFAULT_KPI_WIDGETS));
        return !(sameLayout && currentWidgets === defaultWidgets) || conflictGridPageSizePreference != null;
    })();
    $: if (!tableReady || !conflictKpiProvider) {
        lastSecondaryDependencyKey = "";
    } else {
        const nextDependencyKey = JSON.stringify({
            widgets: stripWidgetIds(kpiWidgets),
            selection: selectionDependencyKey(),
            conflictId,
        });
        if (nextDependencyKey !== lastSecondaryDependencyKey) {
            lastSecondaryDependencyKey = nextDependencyKey;
            void hydrateSecondaryWidgets();
        }
    }

    onMount(() => {
        shellReady = true;
        kpiCollapsed = localStorage.getItem(kpiCollapseStorageKey()) === "1";

        bootstrapIdRouteLifecycle({
            restoreParams: ["layout", "sort", "order", "columns", "kpiw", "grid"],
            preserveParams: ["id"],
            onMissingId: () => {
                _loadError = "Missing conflict id in URL";
            },
            onResolvedId: (id, queryParams) => {
                loadRouteForConflict(id, queryParams);
            },
        });

        if (typeof ResizeObserver !== "undefined") {
            layoutPresetResizeObserver = new ResizeObserver(() => {
                updateLayoutPresetMode();
            });
            if (layoutPresetViewportEl) {
                layoutPresetResizeObserver.observe(layoutPresetViewportEl);
            }
            if (layoutPresetButtonsEl) {
                layoutPresetResizeObserver.observe(layoutPresetButtonsEl);
            }
        }

        window.setTimeout(updateLayoutPresetMode, 0);
    });

    onDestroy(() => {
        layoutPresetResizeObserver?.disconnect();
        destroyClient();
    });
</script>

<svelte:head>
    <title>Conflict {conflictName}</title>
    <script
        id="visjs"
        async
        src="https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js"
        on:load={onScriptLoad}
    ></script>
</svelte:head>

<div
    class="container-fluid p-2 ux-page-body"
    data-shell-ready={shellReady ? "1" : "0"}
    data-meta-ready={metaReady ? "1" : "0"}
    data-table-ready={tableReady ? "1" : "0"}
    data-preset-kpi-ready={presetKpiReady ? "1" : "0"}
    data-secondary-ready={secondaryReady ? "1" : "0"}
>
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: `${base}/` },
                    { label: "Conflicts", href: `${base}/conflicts` },
                    {
                        label: conflictName || "Conflict",
                        href: conflictId
                            ? `${base}/conflict?id=${conflictId}`
                            : undefined,
                    },
                    { label: currentLayoutLabel },
                ]}
            />
            <span class="ux-page-title-main">Conflict: {conflictName || "Loading..."}</span>
        </div>
        {#if (isVirtualConflictId && virtualConflictEditUrl) || conflictMeta?.wiki}
            <div class="d-flex align-items-center gap-2">
                {#if isVirtualConflictId && virtualConflictEditUrl}
                    <a
                        class="btn ux-btn ux-btn-danger fw-bold"
                        href={virtualConflictEditUrl}
                        target="_blank"
                        rel="noopener noreferrer">Edit</a
                    >
                {/if}
                {#if conflictMeta?.wiki}
                    <a
                        class="btn ux-btn fw-bold"
                        href="https://politicsandwar.fandom.com/wiki/{conflictMeta.wiki}"
                        >Wiki:{conflictMeta.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"
                        ></i></a
                    >
                {/if}
            </div>
        {/if}
    </h1>

    <ConflictRouteTabs
        {conflictId}
        mode="layout-picker"
        routeKind="single"
        currentLayout={_layoutData.layout}
        active={layoutTabFromIndex(_layoutData.layout)}
        onLayoutSelect={handleClick}
    />

    <ul
        class="layout-picker-bar ux-floating-controls nav fw-bold nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
    >
        <li class="layout-preset-slot d-flex align-items-center gap-2 me-1">
            <span>Layout Picker:</span>
            <div class="layout-preset-viewport" bind:this={layoutPresetViewportEl}>
                <div
                    class="layout-preset-buttons"
                    class:layout-preset-buttons-hidden={showPresetOverflowMenu}
                    bind:this={layoutPresetButtonsEl}
                >
                    {#each layoutPresetKeys as key}
                        <button
                            class="btn btn-sm fw-bold"
                            class:ux-btn={selectedLayoutPresetKey === key}
                            class:btn-outline-secondary={selectedLayoutPresetKey !== key}
                            on:click={() => applyLayoutPresetKey(key)}>{key}</button
                        >
                    {/each}
                </div>
                {#if showPresetOverflowMenu}
                    <button
                        class="btn ux-btn btn-sm fw-bold layout-preset-more"
                        on:click={openLayoutPresetModal}>More presets</button
                    >
                {/if}
            </div>
        </li>

        <li>
            <ColumnPresetManager
                currentColumns={_layoutData.columns}
                currentSort={_layoutData.sort}
                currentOrder={_layoutData.order}
                currentKpis={presetCards.map((card) => card.key)}
                currentKpiConfig={{
                    widgets: kpiWidgets,
                    presetCards,
                    rankingCards,
                    metricCards,
                }}
                on:load={(event) => handleColumnPresetLoad(event.detail.preset)}
            />
        </li>

        {#if kpiCollapsed}
            <li>
                <button class="btn ux-btn btn-sm" on:click={showKpi}
                    >Show KPI</button
                >
            </li>
        {/if}

        <li class="ms-auto">
            <button class="btn ux-btn btn-sm" on:click={openKpiBuilderModal}
                >KPI Builder</button
            >
        </li>

        <li class="d-flex flex-wrap gap-1 justify-content-end">
            <ShareResetBar
                onReset={resetFilters}
                onSharePrepare={syncShareStateToUrl}
                resetDirty={isResetDirty}
            />
        </li>
    </ul>

    <ConflictKpiSection
        visible={!kpiCollapsed}
        presetReady={presetKpiReady}
        {kpiWidgets}
        {draggingWidgetId}
        {durationSoFar}
        warsTracked={presetMetrics?.warsTracked ?? null}
        totalDamage={presetMetrics?.totalDamage ?? null}
        damageGap={presetMetrics?.damageGap ?? null}
        leadingCoalition={presetMetrics?.leadingCoalition ?? null}
        coalitionSummary={presetMetrics?.coalitionSummary ?? null}
        offWarsPerNationStats={presetMetrics?.offWarsPerNationStats ?? null}
        {secondaryReady}
        {rankingRowsByWidgetId}
        {metricValuesByWidgetId}
        {formatKpiNumber}
        {metricLabel}
        {widgetScopeLabel}
        {getAavaMetricLabel}
        on:toggleCollapse={toggleKpiCollapsed}
        on:startDrag={(event) => startWidgetDrag(event.detail.id)}
        on:endDrag={endWidgetDrag}
        on:dropOn={(event) => dropWidgetOn(event.detail.id)}
        on:removeWidget={(event) => kpiWidgetActions.removeWidget(event.detail.id)}
    />

    <SelectionModal
        open={showLayoutPresetModal}
        title="Choose Layout Preset"
        description="Pick a preset column layout for the current conflict table."
        items={buildLayoutPresetItems()}
        selectedIds={selectedLayoutPresetKey
            ? [selectedLayoutPresetKey as string]
            : []}
        applyLabel="Use preset"
        singleSelect={true}
        searchPlaceholder="Search presets..."
        on:close={closeLayoutPresetModal}
        on:apply={applyLayoutPresetModal}
        validateSelection={(ids) =>
            validateSingleSelection(ids, "layout preset")}
    />

    <KpiBuilderModal
        open={showKpiBuilderModal}
        title="KPI Builder"
        description="Add and arrange KPI widgets."
        widgets={kpiWidgets}
        presetCardLabels={PRESET_CARD_LABELS}
        presetCardDescriptions={PRESET_CARD_DESCRIPTIONS}
        scopeOptions={[
            { value: "all", label: "All" },
            { value: "coalition1", label: "Coalition 1" },
            { value: "coalition2", label: "Coalition 2" },
            { value: "selection", label: "Selection snapshot" },
        ]}
        {metricsOptions}
        {selectedSnapshotLabel}
        canAddRanking={hasSelectionForScopeFromState(
            rankingScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddMetric={hasSelectionForScopeFromState(
            metricScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddRankingReason={kpiAddReasonForScopeFromState(
            rankingScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddMetricReason={kpiAddReasonForScopeFromState(
            metricScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        {widgetManagerLabel}
        {metricLabel}
        {metricDescription}
        showAavaHint={!!conflictId}
        aavaHref={conflictId ? `aava?id=${conflictId}` : null}
        on:close={closeKpiBuilderModal}
        on:removeWidget={(event) => kpiWidgetActions.removeWidget(event.detail.id)}
        on:moveWidget={(event) =>
            kpiWidgetActions.moveWidget(event.detail.id, event.detail.delta)}
        on:addPreset={(event) => kpiWidgetActions.addPresetCard(event.detail.key)}
        on:addRanking={() =>
            kpiWidgetActions.addRankingCard({
                entity: rankingEntityToAdd,
                metric: rankingMetricToAdd,
                scope: rankingScopeToAdd,
                limit: rankingLimitToAdd,
            })}
        on:addMetric={() =>
            kpiWidgetActions.addMetricCard({
                entity: metricEntityToAdd,
                metric: metricMetricToAdd,
                scope: metricScopeToAdd,
                aggregation: metricAggToAdd,
                normalizeBy: metricNormalizeByToAdd,
            })}
        bind:rankingEntityToAdd
        bind:rankingMetricToAdd
        bind:rankingScopeToAdd
        bind:rankingLimitToAdd
        bind:metricEntityToAdd
        bind:metricMetricToAdd
        bind:metricScopeToAdd
        bind:metricAggToAdd
        bind:metricNormalizeByToAdd
    />

    {#if !metaReady && !_loadError}
        <div class="ux-surface rounded border p-2 mb-3">
            <Progress />
        </div>
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

    {#if conflictGridProvider}
        <DataGrid
            provider={conflictGridProvider}
            initialState={conflictGridInitialState}
            resetKey={`${conflictId ?? "conflict"}:${_layoutData.layout}:${conflictGridResetVersion}`}
            exportBaseFileName={`conflict-${conflictId ?? "conflict"}-overview`}
            exportDatasetKey="overview"
            exportDatasetLabel="Conflict overview"
            exportButtonLabel="Export"
            emptyMessage="No rows match the current view."
            loadingMessage={metaReady ? "Loading table..." : "Loading conflict dataset..."}
            caption={`Conflict ${conflictName || conflictId || "conflict"} ${currentLayoutLabel} grid`}
            on:stateChange={handleConflictGridStateChange}
            on:selectionChange={handleConflictGridSelectionChange}
            on:cellAction={handleConflictGridCellAction}
            on:queryResult={handleConflictGridQueryResult}
            on:error={handleConflictGridError}
        />
    {/if}

    {#if _layoutData.layout == ConflictGridLayout.COALITION}
        <hr />
        <div class="row m-0">
            {#if conflictMeta?.cb}
                <div class="col-md-6 col-sm-12">
                    <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
                        <h3>Casus Belli</h3>
                        <pre>{conflictMeta.cb}</pre>
                    </div>
                </div>
            {/if}
            {#if conflictMeta?.status}
                <div class="col-md-6 col-sm-12">
                    <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
                        <h3>Status</h3>
                        <pre>{conflictMeta.status}</pre>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <hr />
    <div class="ux-surface p-2">
        <h4>
            {formatDate(conflictMeta?.start ?? null)} - {formatDate(
                conflictMeta?.end ?? null,
            )}
        </h4>
        <div class="m-0" id="visualization"></div>
    </div>

    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>

<style>
    .layout-preset-slot {
        min-width: 0;
        flex: 1 1 640px;
    }

    .layout-preset-viewport {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        position: relative;
    }

    .layout-preset-buttons {
        display: inline-flex;
        flex-wrap: nowrap;
        gap: 0.25rem;
        white-space: nowrap;
    }

    .layout-preset-buttons-hidden {
        visibility: hidden;
        pointer-events: none;
    }

    .layout-preset-more {
        position: absolute;
        top: 0;
        left: 0;
    }

    @media (max-width: 991.98px) {
        .layout-preset-slot {
            flex: 1 1 100%;
        }
    }
</style>
