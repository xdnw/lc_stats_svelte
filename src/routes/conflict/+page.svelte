<script lang="ts">
    import "../../styles/conflict-shell.css";
    import { base } from "$app/paths";
    import { onDestroy, onMount } from "svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import ConflictKpiSection from "../../components/ConflictKpiSection.svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import Icon from "../../components/Icon.svelte";
    import Progress from "../../components/Progress.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import { getAavaMetricLabel } from "$lib/aava";
    import {
        normalizeConflictLayoutColumns,
        parseConflictLayoutQuery,
        serializeConflictLayoutQuery,
    } from "$lib/conflictLayoutQueryState";
    import {
        filterConflictCustomColumnsForLayout,
        getConflictCustomColumnIdsForLayout,
        type ConflictCustomColumnConfig,
        type ConflictCustomMetricOption,
    } from "$lib/conflictCustomColumns";
    import type { ConflictKpiProvider } from "$lib/conflictGrid/conflictKpiProvider";
    import { createConflictGridProvider } from "$lib/conflictGrid/conflictGridProvider";
    import type {
        ConflictGridMeta,
        ConflictGridPresetMetrics,
        ConflictKpiRankingRow,
    } from "$lib/conflictGrid/protocol";
    import {
        ALL_CONFLICT_GRID_LAYOUTS,
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
        isConflictTableDefaultPresetState,
        isConflictTableLayoutStateEqual,
    } from "$lib/conflictTablePresets";
    import { layoutTabFromIndex } from "$lib/conflictTabs";
    import { formatAllianceName, formatDate, formatDuration, formatNationName } from "$lib/formatting";
    import { getVisGlobal } from "$lib/globals";
    import GridLoadingShell from "$lib/grid/GridLoadingShell.svelte";
    import {
        parseGridPageSizeQueryState,
        serializeGridPageSizeQueryState,
    } from "$lib/grid/queryState";
    import type {
        GridDataProvider,
        GridBootstrapResult,
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
    import { beginJourneySpan, endJourneySpan, ensureJourneySpan } from "$lib/perf";
    import { recordPerfSpan } from "$lib/perf";
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

    type ColumnPresetManagerComponent =
        typeof import("../../components/ColumnPresetManager.svelte").default;
    type KpiBuilderModalComponent =
        typeof import("../../components/KpiBuilderModal.svelte").default;
    type SelectionModalComponent =
        typeof import("../../components/SelectionModal.svelte").default;
    type DataGridComponent = typeof import("$lib/grid/DataGrid.svelte").default;
    type ConflictCustomColumnModalComponent =
        typeof import("../../components/ConflictCustomColumnModal.svelte").default;
    type ConflictCustomColumnAuthoringModule =
        typeof import("$lib/conflictCustomColumnAuthoring");

    type KPIWidget = ConflictKPIWidget;
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
    let customMetricSourceColumns: Array<{ key: string; title: string }> = [];
    let customMetricOptions: ConflictCustomMetricOption[] = [];
    let customMetricKeys: string[] = [];
    let customColumnsForGrid: ConflictCustomColumnConfig[] = [];
    let customColumnIdsForGrid: string[] = [];

    let columnPresetManagerComponent: ColumnPresetManagerComponent | null = null;
    let kpiBuilderModalComponent: KpiBuilderModalComponent | null = null;
    let selectionModalComponent: SelectionModalComponent | null = null;
    let dataGridComponent: DataGridComponent | null = null;
    let conflictCustomColumnModalComponent: ConflictCustomColumnModalComponent | null = null;
    let buildConflictCustomMetricOptions:
        | ConflictCustomColumnAuthoringModule["buildConflictCustomMetricOptions"]
        | null = null;
    let upsertConflictCustomColumnState:
        | ConflictCustomColumnAuthoringModule["upsertConflictCustomColumnState"]
        | null = null;
    let deleteConflictCustomColumnState:
        | ConflictCustomColumnAuthoringModule["deleteConflictCustomColumnState"]
        | null = null;
    let showConflictCustomColumnModal = false;

    let latestLoadToken = 0;
    let latestSelectionToken = 0;
    let latestSecondaryToken = 0;
    let lastSelectionKey = "";
    let lastSecondaryDependencyKey = "";
    let selectedConflictGridRowIds: Array<string | number> = [];
    let layoutChromeLoadPromise: Promise<void> | null = null;
    let kpiChromeLoadPromise: Promise<void> | null = null;
    let layoutPresetModalLoadPromise: Promise<void> | null = null;
    let kpiBuilderModalLoadPromise: Promise<void> | null = null;
    let dataGridLoadPromise: Promise<void> | null = null;
    let conflictCustomColumnModalLoadPromise: Promise<void> | null = null;
    let conflictCustomColumnAuthoringLoadPromise: Promise<void> | null = null;
    let conflictCoalitionModalPromise:
        | Promise<typeof import("$lib/conflictCoalitionModal")>
        | null = null;
    let timelineAssetsPromise: Promise<void> | null = null;
    let timelineChromeLoadPromise: Promise<void> | null = null;
    let timelineObserver: IntersectionObserver | null = null;
    let timelineHostElement: HTMLDivElement | null = null;
    let layoutChromeScheduled = false;
    let secondaryChromeScheduled = false;

    let postsData: { [key: string]: [number, string, number] } | null = null;

    const kpiCollapseStorageKey = () => `${getPageStorageKey()}:kpi-collapsed`;
    const VIS_TIMELINE_SCRIPT_ID = "visjs";
    const VIS_TIMELINE_SCRIPT_SRC =
        "https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js";
    const VIS_TIMELINE_STYLESHEET_ID = "visjs-css";
    const VIS_TIMELINE_STYLESHEET_HREF =
        "https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.css";

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
        selectedConflictGridRowIds = [];
        layoutChromeScheduled = false;
        secondaryChromeScheduled = false;
        disconnectTimelineObserver();
        if (timelineHostElement) {
            timelineHostElement.innerHTML = "";
        }
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

    function disconnectTimelineObserver(): void {
        timelineObserver?.disconnect();
        timelineObserver = null;
    }

    function ensureTimelineStylesheet(): void {
        if (typeof document === "undefined") return;
        if (document.getElementById(VIS_TIMELINE_STYLESHEET_ID)) return;

        const link = document.createElement("link");
        link.id = VIS_TIMELINE_STYLESHEET_ID;
        link.rel = "stylesheet";
        link.href = VIS_TIMELINE_STYLESHEET_HREF;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
    }

    function ensureTimelineChromeLoaded(): Promise<void> {
        if (!timelineChromeLoadPromise) {
            timelineChromeLoadPromise = import("$lib/conflictTimelineStyles")
                .then(() => undefined)
                .catch((error) => {
                    timelineChromeLoadPromise = null;
                    throw error;
                });
        }

        return timelineChromeLoadPromise;
    }

    function ensureTimelineScript(): Promise<void> {
        if (typeof document === "undefined") {
            return Promise.resolve();
        }

        const existing = document.getElementById(VIS_TIMELINE_SCRIPT_ID);
        if (existing instanceof HTMLScriptElement) {
            if (existing.dataset.loaded === "true" || typeof getVis() !== "undefined") {
                return Promise.resolve();
            }

            return new Promise<void>((resolve, reject) => {
                existing.addEventListener(
                    "load",
                    () => {
                        existing.dataset.loaded = "true";
                        resolve();
                    },
                    { once: true },
                );
                existing.addEventListener(
                    "error",
                    () => reject(new Error("Failed to load vis-timeline")),
                    { once: true },
                );
            });
        }

        return new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.id = VIS_TIMELINE_SCRIPT_ID;
            script.async = true;
            script.src = VIS_TIMELINE_SCRIPT_SRC;
            script.crossOrigin = "anonymous";
            script.addEventListener(
                "load",
                () => {
                    script.dataset.loaded = "true";
                    resolve();
                },
                { once: true },
            );
            script.addEventListener(
                "error",
                () => reject(new Error("Failed to load vis-timeline")),
                { once: true },
            );
            document.head.appendChild(script);
        });
    }

    async function ensureTimelineAssetsLoaded(): Promise<void> {
        ensureTimelineStylesheet();
        const timelineChromePromise = ensureTimelineChromeLoaded();
        if (typeof getVis() !== "undefined") {
            await timelineChromePromise;
            return;
        }

        if (!timelineAssetsPromise) {
            timelineAssetsPromise = ensureTimelineScript().finally(() => {
                timelineAssetsPromise = null;
            });
        }

        await Promise.all([timelineChromePromise, timelineAssetsPromise]);
    }

    function requestTimelineHydration(): void {
        if (!tableReady || !postsData || timelineReady) return;

        void ensureTimelineAssetsLoaded()
            .then(() => {
                initializeTimeline();
            })
            .catch((error) => {
                console.warn("Failed to load conflict timeline assets", error);
            });
    }

    function observeTimelineVisibility(): void {
        if (!tableReady || !postsData || timelineReady || !timelineHostElement) {
            return;
        }

        if (typeof IntersectionObserver === "undefined") {
            requestTimelineHydration();
            return;
        }

        disconnectTimelineObserver();
        timelineObserver = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) {
                    return;
                }

                disconnectTimelineObserver();
                requestTimelineHydration();
            },
            {
                rootMargin: "240px 0px",
            },
        );
        timelineObserver.observe(timelineHostElement);
    }

    async function ensureLayoutChromeLoaded(): Promise<void> {
        if (columnPresetManagerComponent) {
            return;
        }

        if (!layoutChromeLoadPromise) {
            layoutChromeLoadPromise = import("../../components/ColumnPresetManager.svelte")
                .then((columnPresetManagerModule) => {
                    columnPresetManagerComponent ??= columnPresetManagerModule.default;
                })
                .catch((error) => {
                    console.warn("Failed to load conflict layout chrome", error);
                })
                .finally(() => {
                    layoutChromeLoadPromise = null;
                });
        }

        await layoutChromeLoadPromise;
    }

    async function ensureKpiProviderLoaded(): Promise<void> {
        if (conflictKpiProvider) {
            return;
        }

        if (!kpiChromeLoadPromise) {
            const client = conflictGridClient;
            kpiChromeLoadPromise = import("$lib/conflictGrid/conflictKpiProvider")
                .then((conflictKpiProviderModule) => {
                    if (
                        conflictKpiProvider == null &&
                        client != null &&
                        client === conflictGridClient
                    ) {
                        conflictKpiProvider =
                            conflictKpiProviderModule.createConflictKpiProvider({
                                client,
                                bootstrapLayout: _layoutData.layout,
                            });

                        if (selectedConflictGridRowIds.length > 0) {
                            void resolveSelectionSnapshot(selectedConflictGridRowIds);
                        }
                    }
                })
                .catch((error) => {
                    console.warn("Failed to load conflict KPI provider", error);
                })
                .finally(() => {
                    kpiChromeLoadPromise = null;
                });
        }

        await kpiChromeLoadPromise;
    }

    async function ensureLayoutPresetModalLoaded(): Promise<void> {
        if (selectionModalComponent) {
            return;
        }

        if (!layoutPresetModalLoadPromise) {
            layoutPresetModalLoadPromise = import("../../components/SelectionModal.svelte")
                .then((module) => {
                    selectionModalComponent = module.default;
                })
                .catch((error) => {
                    console.warn("Failed to load layout preset modal", error);
                })
                .finally(() => {
                    layoutPresetModalLoadPromise = null;
                });
        }

        await layoutPresetModalLoadPromise;
    }

    async function ensureKpiBuilderModalLoaded(): Promise<void> {
        if (kpiBuilderModalComponent) {
            return;
        }

        if (!kpiBuilderModalLoadPromise) {
            kpiBuilderModalLoadPromise = import("../../components/KpiBuilderModal.svelte")
                .then((module) => {
                    kpiBuilderModalComponent = module.default;
                })
                .catch((error) => {
                    console.warn("Failed to load KPI builder modal", error);
                })
                .finally(() => {
                    kpiBuilderModalLoadPromise = null;
                });
        }

        await kpiBuilderModalLoadPromise;
    }

    async function ensureConflictCustomColumnModalLoaded(): Promise<void> {
        if (conflictCustomColumnModalComponent) {
            return;
        }

        if (!conflictCustomColumnModalLoadPromise) {
            conflictCustomColumnModalLoadPromise = import(
                "../../components/ConflictCustomColumnModal.svelte"
            )
                .then((module) => {
                    conflictCustomColumnModalComponent = module.default;
                })
                .catch((error) => {
                    console.warn("Failed to load conflict custom-column modal", error);
                })
                .finally(() => {
                    conflictCustomColumnModalLoadPromise = null;
                });
        }

        await conflictCustomColumnModalLoadPromise;
    }

    async function ensureConflictCustomColumnAuthoringLoaded(): Promise<void> {
        if (
            buildConflictCustomMetricOptions &&
            upsertConflictCustomColumnState &&
            deleteConflictCustomColumnState
        ) {
            return;
        }

        if (!conflictCustomColumnAuthoringLoadPromise) {
            conflictCustomColumnAuthoringLoadPromise = import(
                "$lib/conflictCustomColumnAuthoring"
            )
                .then((module) => {
                    buildConflictCustomMetricOptions = module.buildConflictCustomMetricOptions;
                    upsertConflictCustomColumnState = module.upsertConflictCustomColumnState;
                    deleteConflictCustomColumnState = module.deleteConflictCustomColumnState;
                    syncConflictCustomMetricOptions();
                })
                .catch((error) => {
                    console.warn("Failed to load conflict custom-column authoring helpers", error);
                })
                .finally(() => {
                    conflictCustomColumnAuthoringLoadPromise = null;
                });
        }

        await conflictCustomColumnAuthoringLoadPromise;
    }

    async function ensureConflictCustomColumnEditingLoaded(): Promise<void> {
        await Promise.all([
            ensureConflictCustomColumnModalLoaded(),
            ensureConflictCustomColumnAuthoringLoaded(),
        ]);
    }

    async function ensureDataGridLoaded(): Promise<void> {
        if (dataGridComponent) {
            return;
        }

        if (!dataGridLoadPromise) {
            dataGridLoadPromise = import("$lib/grid/DataGrid.svelte")
                .then((module) => {
                    dataGridComponent = module.default;
                })
                .catch((error) => {
                    console.warn("Failed to load conflict data grid", error);
                    if (!_loadError) {
                        _loadError = "Could not load the conflict table. Please retry.";
                    }
                })
                .finally(() => {
                    dataGridLoadPromise = null;
                });
        }

        await dataGridLoadPromise;
    }

    function loadConflictCoalitionModal(): Promise<
        typeof import("$lib/conflictCoalitionModal")
    > {
        if (!conflictCoalitionModalPromise) {
            conflictCoalitionModalPromise = import("$lib/conflictCoalitionModal");
        }

        return conflictCoalitionModalPromise;
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
            {
                customColumnIds: activeCustomColumnIds(),
            },
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
            customColumns: [],
        });
        _layoutData.layout = nextLayoutState.layout;
        _layoutData.sort = nextLayoutState.sort;
        _layoutData.order = nextLayoutState.order;
        _layoutData.columns = nextLayoutState.columns;
        _layoutData.customColumns = nextLayoutState.customColumns;
        selectedLayoutPresetKey = detectLayoutPresetKey();
    }

    function activeCustomColumnIds(): string[] {
        return getConflictCustomColumnIdsForLayout(
            _layoutData.layout,
            _layoutData.customColumns,
        );
    }

    function getConflictGridViewConfig() {
        return {
            customColumns: customColumnsForGrid,
        };
    }

    function buildLayoutPresetItems(): SelectionModalItem[] {
        return buildStringSelectionItems(layoutPresetKeys);
    }

    function syncMetricOptions(columns: Array<{
        key: string;
        title: string;
        summary?: string | null;
        metricEligible?: boolean;
    }>): void {
        const labels: Record<string, string> = {};
        columns.forEach((column) => {
            labels[column.key] = column.title;
        });
        metricTitleByKey = labels;
        customMetricSourceColumns = columns.map(({ key, title }) => ({ key, title }));
        syncConflictCustomMetricOptions();

        const nextMetricOptions = columns
            .filter(
                (column) =>
                    column.metricEligible === true,
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

    function syncConflictCustomMetricOptions(): void {
        if (!buildConflictCustomMetricOptions) {
            return;
        }

        customMetricOptions = buildConflictCustomMetricOptions(customMetricSourceColumns);
        customMetricKeys = customMetricOptions.map((option) => option.value);
    }

    function openConflictCustomColumnModal(): void {
        void ensureConflictCustomColumnEditingLoaded().then(() => {
            if (
                !conflictCustomColumnModalComponent ||
                !buildConflictCustomMetricOptions ||
                !upsertConflictCustomColumnState ||
                !deleteConflictCustomColumnState
            ) {
                return;
            }
            showConflictCustomColumnModal = true;
        });
    }

    function closeConflictCustomColumnModal(): void {
        showConflictCustomColumnModal = false;
    }

    async function handleConflictCustomColumnSave(
        event: CustomEvent<{
            previousId: string | null;
            config: ConflictCustomColumnConfig;
        }>,
    ): Promise<void> {
        if (!upsertConflictCustomColumnState) {
            return;
        }

        const nextState = upsertConflictCustomColumnState(
                {
                    layout: _layoutData.layout,
                    columns: _layoutData.columns,
                    customColumns: _layoutData.customColumns,
                },
                {
                    previousId: event.detail.previousId,
                    config: event.detail.config,
                    validMetricKeys: customMetricKeys,
                },
            );
        if (!nextState) {
            return;
        }

        _layoutData.columns = nextState.columns;
        _layoutData.customColumns = nextState.customColumns;
        selectedLayoutPresetKey = detectLayoutPresetKey();
        resetConflictGridState();
        syncUrlState({ replace: true, persist: true });
    }

    async function handleConflictCustomColumnDelete(
        event: CustomEvent<{ id: string }>,
    ): Promise<void> {
        if (!deleteConflictCustomColumnState) {
            return;
        }

        const nextState = deleteConflictCustomColumnState(
            {
                layout: _layoutData.layout,
                columns: _layoutData.columns,
                customColumns: _layoutData.customColumns,
            },
            event.detail.id,
        );

        if (!nextState) {
            return;
        }

        _layoutData.columns = nextState.columns;
    _layoutData.customColumns = nextState.customColumns;
        selectedLayoutPresetKey = detectLayoutPresetKey();
        resetConflictGridState();
        syncUrlState({ replace: true, persist: true });
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
        const nextCollapsed = !kpiCollapsed;
        kpiCollapsed = nextCollapsed;
        localStorage.setItem(kpiCollapseStorageKey(), nextCollapsed ? "1" : "0");
        if (!nextCollapsed) {
            void ensureKpiProviderLoaded();
        }
    }

    function showKpi(): void {
        if (!kpiCollapsed) return;
        kpiCollapsed = false;
        localStorage.setItem(kpiCollapseStorageKey(), "0");
        void ensureKpiProviderLoaded();
    }

    function isSameLayoutState(input: {
        sort: string;
        order: string;
        columns: string[];
        customColumns?: ConflictCustomColumnConfig[];
    }): boolean {
        return isConflictTableLayoutStateEqual(_layoutData, {
            sort: input.sort,
            order: input.order === "asc" ? "asc" : "desc",
            columns: input.columns,
            customColumns: input.customColumns ?? [],
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

    function requestLayoutPresetModalHydration(): void {
        if (
            !showPresetOverflowMenu ||
            !tableReady ||
            selectionModalComponent ||
            layoutPresetModalLoadPromise
        ) {
            return;
        }

        scheduleIdleWork(() => {
            if (
                !showPresetOverflowMenu ||
                !tableReady ||
                selectionModalComponent ||
                layoutPresetModalLoadPromise
            ) {
                return;
            }

            void ensureLayoutPresetModalLoaded();
        });
    }

    function openKpiBuilderModal(): void {
        void Promise.all([
            ensureKpiProviderLoaded(),
            ensureKpiBuilderModalLoaded(),
        ]).then(() => {
            showKpiBuilderModal = true;
        });
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
            {
                customColumnIds: [],
            },
        );
        if (
            isSameLayoutState({
                sort: layout.sort,
                order: nextOrder,
                columns: nextColumns,
                customColumns: [],
            })
        ) {
            return;
        }

        _layoutData.columns = nextColumns;
        _layoutData.sort = layout.sort;
        _layoutData.order = nextOrder;
        _layoutData.customColumns = [];
        selectedLayoutPresetKey = key;
        resetConflictGridState();
        syncUrlState({ persist: true });
    }

    function handleColumnPresetLoad(preset: ColumnPreset): void {
        const nextCustomColumns = Array.isArray(preset.customColumns)
            ? [...preset.customColumns]
            : [];
        const nextSort = preset.sort || _layoutData.sort;
        const nextOrder: "asc" | "desc" =
            preset.order === "asc"
                ? "asc"
                : preset.order === "desc"
                  ? "desc"
                  : _layoutData.order;
        const nextColumns = Array.isArray(preset.columns)
            ? normalizeConflictLayoutColumns(_layoutData.layout, preset.columns, {
                customColumnIds: getConflictCustomColumnIdsForLayout(
                    _layoutData.layout,
                    nextCustomColumns,
                ),
            })
            : normalizeConflictLayoutColumns(_layoutData.layout, _layoutData.columns, {
                customColumnIds: getConflictCustomColumnIdsForLayout(
                    _layoutData.layout,
                    nextCustomColumns,
                ),
            });

        const noLayoutChange = isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
            customColumns: nextCustomColumns,
        });

        _layoutData.columns = nextColumns;
        _layoutData.sort = nextSort;
        _layoutData.order = nextOrder;
        _layoutData.customColumns = nextCustomColumns;
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
        showConflictCustomColumnModal = false;
        _layoutData.layout =
            layout === ConflictGridLayout.ALLIANCE
                ? ConflictGridLayout.ALLIANCE
                : layout === ConflictGridLayout.NATION
                  ? ConflictGridLayout.NATION
                  : ConflictGridLayout.COALITION;
        _layoutData.columns = normalizeConflictLayoutColumns(
            _layoutData.layout,
            _layoutData.columns,
            {
                customColumnIds: activeCustomColumnIds(),
            },
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
        _layoutData.customColumns = [];
        showConflictCustomColumnModal = false;
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
        if (typeof getVis() === "undefined") {
            return;
        }

        if (!conflictMeta || !timelineHostElement) return;
        disconnectTimelineObserver();

        const container = timelineHostElement;
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

        requestAnimationFrame(() => timeline.redraw());
        window.setTimeout(() => timeline.redraw(), 120);

        timelineReady = true;
        updateSecondaryReady();
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
            basePath: base,
            getViewConfig: getConflictGridViewConfig,
        });
        conflictGridClient = client;
        resetConflictGridState();
        beginJourneySpan("journey.conflicts_to_conflict.dataFetch", {
            conflictId: id,
        });

        try {
            const payload = await client.bootstrap(_layoutData.layout);
            if (token !== latestLoadToken) return;

            if (payload.timings.datasetCreateMs > 0) {
                recordPerfSpan("conflictGrid.dataset.create", payload.timings.datasetCreateMs, {
                    routeTarget: "/conflict",
                    source: "worker",
                    conflictId: id,
                });
            }
            if (payload.timings.layoutBootstrapMs > 0) {
                recordPerfSpan("conflictGrid.bootstrap.layout", payload.timings.layoutBootstrapMs, {
                    routeTarget: "/conflict",
                    source: "worker",
                    conflictId: id,
                    layout: _layoutData.layout,
                    datasetCreated: payload.timings.datasetCreateMs > 0,
                });
            }

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
            endJourneySpan("journey.conflicts_to_conflict.routeTransition");
        }
    }

    function loadRouteForConflict(id: string, query: URLSearchParams): void {
        conflictId = id;
        loadLayoutFromQuery(query);
        conflictGridPageSizePreference = parseGridPageSizeQueryState(
            decodeQueryParamValue("grid", query.get("grid")),
        );
        loadKpiWidgets(id, query);
        ensureJourneySpan("journey.conflicts_to_conflict.routeTransition", {
            mode: "direct",
            conflictId: id,
        });
        beginJourneySpan("journey.conflicts_to_conflict.firstMount", {
            conflictId: id,
        });
        void ensureDataGridLoaded();
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

        void loadConflictCoalitionModal()
            .then(({ openConflictCoalitionModal }) => {
                openConflictCoalitionModal({
                    title: `Coalition ${coalitionIndex + 1}: ${coalition.name}`,
                    alliances: coalition.alliances,
                });
            })
            .catch((error) => {
                console.warn("Failed to load coalition modal", error);
            });
    }

    function handleConflictGridError(
        event: CustomEvent<{ message: string }>,
    ): void {
        _loadError = event.detail.message;
    }

    function handleConflictGridReady(
        event: CustomEvent<{ bootstrap: GridBootstrapResult }>,
    ): void {
        syncMetricOptions(event.detail.bootstrap.columns);
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
            observeTimelineVisibility();
        }
        updateSecondaryReady();

        if (isFirstUsableTable) {
            endJourneySpan("journey.conflicts_to_conflict.firstMount");
            endJourneySpan("journey.conflicts_to_conflict.routeTransition");
            saveCurrentQueryParams();
            queueNonCurrentLayoutWarmup();

            if (!layoutChromeScheduled) {
                layoutChromeScheduled = true;
                scheduleIdleWork(() => {
                    void ensureLayoutChromeLoaded();
                });
            }

            if (!secondaryChromeScheduled) {
                secondaryChromeScheduled = true;
                if (!kpiCollapsed) {
                    scheduleIdleWork(() => {
                        void ensureKpiProviderLoaded();
                    });
                }
            }
        }
    }

    async function resolveSelectionSnapshot(
        rowIds: Array<string | number>,
    ): Promise<void> {
        if (!conflictKpiProvider || rowIds.length === 0) {
            clearSelectionSnapshot();
            return;
        }

        const token = ++latestSelectionToken;
        try {
            const snapshot = await conflictKpiProvider.getSelectionSnapshot(
                _layoutData.layout,
                rowIds,
            );
            if (token !== latestSelectionToken) return;
            applySelectionSnapshot(snapshot);
        } catch (error) {
            if (token !== latestSelectionToken) return;
            console.warn("Failed to resolve conflict KPI selection snapshot", error);
            clearSelectionSnapshot();
        }
    }

    function handleConflictGridSelectionChange(
        event: CustomEvent<{ selectedRowIds: Array<string | number> }>,
    ): void {
        const rowIds = event.detail.selectedRowIds;
        selectedConflictGridRowIds = [...rowIds];
        const nextKey = rowIds.join("|");
        if (nextKey === lastSelectionKey) return;
        lastSelectionKey = nextKey;

        if (rowIds.length === 0) {
            clearSelectionSnapshot();
            return;
        }

        if (!conflictKpiProvider) {
            return;
        }

        void resolveSelectionSnapshot(rowIds);
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
            {
                customColumnIds: activeCustomColumnIds(),
            },
        );
        const nextSort = state.sort?.key ?? DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort;
        const nextOrder: "asc" | "desc" = state.sort?.dir === "asc" ? "asc" : "desc";
        const nextPageSize = state.pageSize === 10 ? null : state.pageSize;
        const layoutChanged = !isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
            customColumns: _layoutData.customColumns,
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
    $: customColumnsForGrid = filterConflictCustomColumnsForLayout(
        _layoutData.layout,
        _layoutData.customColumns,
    );
    $: customColumnIdsForGrid = customColumnsForGrid.map((column) => column.id);
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
    $: if (showPresetOverflowMenu && tableReady && !selectionModalComponent) {
        requestLayoutPresetModalHydration();
    }
    $: if (tableReady && postsData && timelineHostElement && !timelineReady) {
        observeTimelineVisibility();
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
                  getViewConfig: getConflictGridViewConfig,
                  defaultSort: {
                      key: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                      dir: "desc",
                  },
                  defaultVisibleColumnKeys: normalizeConflictLayoutColumns(
                      _layoutData.layout,
                      DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns,
                      {
                          customColumnIds: customColumnIdsForGrid,
                      },
                  ),
              });
    $: isResetDirty = (() => {
        const currentWidgets = JSON.stringify(stripWidgetIds(kpiWidgets));
        const defaultWidgets = JSON.stringify(stripWidgetIds(DEFAULT_KPI_WIDGETS));
        return !(isConflictTableDefaultPresetState(_layoutData) && currentWidgets === defaultWidgets) || conflictGridPageSizePreference != null;
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
            restoreParams: ["layout", "sort", "order", "columns", "cc", "kpiw", "grid"],
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
        disconnectTimelineObserver();
        destroyClient();
    });
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <title>Conflict {conflictName}</title>
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
                        >Wiki:{conflictMeta.wiki}<Icon
                            name="externalLink"
                            className="ux-icon-inline"
                        /></a
                    >
                {/if}
            </div>
        {/if}
    </h1>

                            <ConflictRouteTabs
                                conflictId={conflictId}
                                active={layoutTabFromIndex(_layoutData.layout)}
                                mode="layout-picker"
                                routeKind="single"
                                currentLayout={_layoutData.layout}
                                onLayoutSelect={handleClick}
                            />

    <ul
        class="layout-picker-bar ux-floating-controls ux-compact-controls nav nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
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
                            class="btn btn-sm ux-layout-preset-button"
                            class:is-active={selectedLayoutPresetKey === key}
                            on:click={() => applyLayoutPresetKey(key)}>{key}</button
                        >
                    {/each}
                </div>
                {#if showPresetOverflowMenu}
                    {#if selectionModalComponent}
                        <svelte:component
                            this={selectionModalComponent}
                            title="Choose Layout Preset"
                            description="Pick a preset column layout for the current conflict table."
                            items={buildLayoutPresetItems()}
                            selectedIds={selectedLayoutPresetKey
                                ? [selectedLayoutPresetKey as string]
                                : []}
                            applyLabel="Use preset"
                            singleSelect={true}
                            searchPlaceholder="Search presets..."
                            buttonClass="btn btn-sm ux-layout-preset-button layout-preset-more"
                            buttonLabel="More presets"
                            size="sm"
                            on:apply={applyLayoutPresetModal}
                            validateSelection={(ids) =>
                                validateSingleSelection(ids, "layout preset")}
                        />
                    {:else}
                        <button
                            class="btn btn-sm ux-layout-preset-button layout-preset-more"
                            type="button"
                            disabled
                        >
                            Loading presets...
                        </button>
                    {/if}
                {/if}
            </div>
        </li>

        <li>
            {#if columnPresetManagerComponent}
                <svelte:component
                    this={columnPresetManagerComponent}
                    currentColumns={_layoutData.columns}
                    currentCustomColumns={_layoutData.customColumns}
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
            {:else}
                <button class="btn ux-btn btn-sm" type="button" disabled>
                    Loading layouts...
                </button>
            {/if}
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

    {#if kpiBuilderModalComponent}
        <svelte:component
            this={kpiBuilderModalComponent}
            open={showKpiBuilderModal}
            title="KPI Builder"
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
    {/if}

    {#if conflictCustomColumnModalComponent}
        <svelte:component
            this={conflictCustomColumnModalComponent}
            open={showConflictCustomColumnModal}
            layout={_layoutData.layout}
            existingColumns={_layoutData.customColumns}
            metricOptions={customMetricOptions}
            validMetricKeys={customMetricKeys}
            on:close={closeConflictCustomColumnModal}
            on:save={handleConflictCustomColumnSave}
            on:delete={handleConflictCustomColumnDelete}
        />
    {/if}

    {#if !metaReady && !_loadError && !kpiCollapsed}
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

    {#if conflictGridProvider}
        {#if dataGridComponent}
            <svelte:component
                this={dataGridComponent}
                provider={conflictGridProvider}
                initialState={conflictGridInitialState}
                resetKey={`${conflictId ?? "conflict"}:${_layoutData.layout}:${conflictGridResetVersion}`}
                exportBaseFileName={`conflict-${conflictId ?? "conflict"}-overview`}
                exportDatasetKey="overview"
                exportDatasetLabel="Conflict overview"
                exportButtonLabel="Export"
                columnFooterActionLabel="Custom columns"
                columnFooterActionButtonClass="btn ux-btn ux-btn-danger btn-sm fw-bold"
                emptyMessage="No rows match the current view."
                loadingMessage={metaReady ? "Loading table..." : "Loading conflict dataset..."}
                caption={`Conflict ${conflictName || conflictId || "conflict"} ${currentLayoutLabel} grid`}
                on:ready={handleConflictGridReady}
                on:stateChange={handleConflictGridStateChange}
                on:columnAction={openConflictCustomColumnModal}
                on:selectionChange={handleConflictGridSelectionChange}
                on:cellAction={handleConflictGridCellAction}
                on:queryResult={handleConflictGridQueryResult}
                on:error={handleConflictGridError}
            />
        {:else}
            <GridLoadingShell
                loadingMessage={metaReady ? "Loading table..." : "Loading conflict dataset..."}
                caption={`Conflict ${conflictName || conflictId || "conflict"} ${currentLayoutLabel} grid`}
                pageSize={conflictGridPageSizePreference}
            />
        {/if}
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
        <div class="m-0" id="visualization" bind:this={timelineHostElement}></div>
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

    :global(.layout-preset-more) {
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
