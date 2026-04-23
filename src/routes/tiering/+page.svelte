<script lang="ts">
    import "../../styles/conflict-shell.css";
    /**
     * This page is for viewing tiering charts for a conflict
     */
    import { browser } from "$app/environment";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import TieringControlsPanel from "../../components/TieringControlsPanel.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import type { ExportMenuAction } from "../../components/exportMenuTypes";
    import { base } from "$app/paths";
    import { page } from "$app/stores";
    import { onMount, onDestroy } from "svelte";
    import {
        formatTurnsToDate,
        formatDaysToDate,
    } from "$lib/formatting";
    import type { GraphData, TierMetric } from "$lib/types";
    import {
        getCurrentQueryParams,
        resetQueryParams,
        setQueryParam,
        setQueryParams,
    } from "$lib/queryState";
    import { bootstrapIdRouteLifecycle } from "$lib/routeBootstrap";
    import { arrayEquals } from "$lib/misc";
    import { saveCurrentQueryParams } from "$lib/queryStorage";
    import { formatDatasetProvenance } from "$lib/runtime";
    import { incrementPerfCounter, startPerfSpan } from "$lib/perf";
    import {
        exportBundleData,
        buildSettingsRows,
        type ExportBundle,
        type ExportDatasetOption,
    } from "$lib/dataExport";
    import {
        resolveInitialAllowedAllianceIds,
        type GraphRouteInfo,
    } from "$lib/graphRouteInfo";
    import {
        acquireTieringArtifactHandle,
        type TieringArtifactHandle,
    } from "$lib/conflictArtifactRegistry";
    import { appConfig as config } from "$lib/appConfig";
    import {
        getDataSetsByTime as getDataSetsByTimeShared,
    } from "$lib/tieringDatasetCompute";
    import {
        buildTieringLegendItems,
        clearTieringCanvas,
        findTieringCanvasHoverBar,
        renderTieringCanvas,
        type TieringCanvasDataset,
        type TieringCanvasHoverBar,
        type TieringCanvasModel,
        type TieringCanvasRenderResult,
        type TieringLegendItem,
    } from "$lib/tieringCanvas";
    import {
        buildDefaultTieringAllianceIds,
        buildTieringDatasetCacheKey,
    } from "$lib/graphArtifactKeys";
    import { isCumulativeMetricName } from "$lib/metrics";
    import { beginJourneySpan, endJourneySpan } from "$lib/perf";
    import { normalizeTieringSliderValues } from "$lib/tieringSelection";

    type PrefetchArtifactsModule = typeof import("$lib/prefetchArtifactsClient");

    type MetricOption = {
        value: string;
        label: string;
    };

    type TieringQuickLayout = {
        name: string;
        metrics: MetricOption[];
        normalize: boolean;
        href: string | null;
    };

    type TieringTooltipAnchor = {
        x: number;
        y: number;
        flipX: boolean;
        flipY: boolean;
    };

    let prefetchArtifactsPromise: Promise<PrefetchArtifactsModule> | null = null;

    function loadPrefetchArtifacts(): Promise<PrefetchArtifactsModule> {
        if (!prefetchArtifactsPromise) {
            prefetchArtifactsPromise = import("$lib/prefetchArtifactsClient");
        }

        return prefetchArtifactsPromise;
    }

    function warmTieringSecondaryArtifacts(conflictId: string): void {
        void loadPrefetchArtifacts()
            .then(({ warmConflictTableArtifact }) => {
                warmConflictTableArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-tiering-idle-conflict-grid",
                    routeTarget: "/conflict",
                    intentStrength: "idle",
                });
            })
            .catch((error) => {
                console.warn("Failed to load tiering prefetch helpers", error);
            });
    }

    let _loaded = false;
    let _loadError: string | null = null;
    let conflictName = "";
    let conflictId: string | null = null;
    let datasetProvenance = "";

    let normalize: boolean = false;
    let previous_normalize: boolean = false;

    let useSingleColor: boolean = false;
    let previous_useSingleColor: boolean = false;

    // 0/1 means no grouping; values >1 group cities into fixed-width bands.
    let cityBandSize: number = 0;
    let previous_cityBandSize: number = 0;

    function selectedMetricValues(): string[] {
        return selected_metrics.map((metric) => metric.value);
    }

    function formatTieringNumber(value: number): string {
        if (!Number.isFinite(value)) return "0";
        const abs = Math.abs(value);
        const maximumFractionDigits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
        return value.toLocaleString(undefined, {
            maximumFractionDigits,
        });
    }

    function tieringSliderValuesToIndices(
        values: number[],
        timeRange: [number, number],
        maxIndex: number,
        usesRangeSelection: boolean,
    ): number[] {
        return normalizeTieringSliderValues(
            values,
            timeRange,
            usesRangeSelection,
        ).map((value) =>
            Math.max(0, Math.min(maxIndex, Math.round(value - timeRange[0]))),
        );
    }

    let _allowedAllianceIds: Set<number> = new Set();

    let dataSets: DataSet[] = [];
    let tieringCanvasElement: HTMLCanvasElement | null = null;
    let tieringCanvasContainer: HTMLDivElement | null = null;
    let tieringChartModel: TieringCanvasModel | null = null;
    let tieringCanvasRenderResult: TieringCanvasRenderResult | null = null;
    let tieringChartLabels: (string | number)[] = [];
    let tieringLegendItems: TieringLegendItem[] = [];
    let tieringChartTitle = "";
    let tieringHoverBar: TieringCanvasHoverBar | null = null;
    let tieringTooltipAnchor: TieringTooltipAnchor | null = null;
    let tieringResizeObserver: ResizeObserver | null = null;
    let pendingTieringCanvasFrame: number | null = null;
    let pendingTieringRefreshFrame: number | null = null;
    let tieringArtifacts: TieringArtifactHandle | null = null;
    let hasCompletedFirstTieringMount = false;
    let latestSetupRunId = 0;
    let lastTieringRenderKey: string | null = null;
    let requestedAllianceIdsFromQuery: number[] | null = null;
    let tieringTimeRange: [number, number] | null = null;
    let tieringUsesRangeSelection = false;
    let tieringSliderValues: number[] = [];
    let tieringCurrentSliderValues: number[] = [0];
    let tieringCurrentSelectionLabel = "";
    let formatTieringTimeValue: (value: number) => string = formatDaysToDate;
    let selectedTieringExportDataset = "snapshot";
    let hasBootstrappedUrlState = false;
    let lastParsedUrlSearch = "";

    const tieringExportDatasets: ExportDatasetOption[] = [
        {
            key: "snapshot",
            label: "Current slider snapshot",
        },
        {
            key: "timeseries",
            label: "Full timeline by city",
        },
        {
            key: "settings",
            label: "Current filter settings",
        },
    ];

    function cancelPendingTieringCanvasRender(): void {
        if (pendingTieringCanvasFrame == null) return;
        cancelAnimationFrame(pendingTieringCanvasFrame);
        pendingTieringCanvasFrame = null;
    }

    function cancelPendingTieringRefresh(): void {
        if (pendingTieringRefreshFrame == null) return;
        cancelAnimationFrame(pendingTieringRefreshFrame);
        pendingTieringRefreshFrame = null;
    }

    function clearTieringInspector(): void {
        tieringHoverBar = null;
        tieringTooltipAnchor = null;
    }

    function resolveTieringTooltipAnchor(
        rect: DOMRect,
        clientX: number,
        clientY: number,
    ): TieringTooltipAnchor {
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        return {
            x,
            y,
            flipX: x > rect.width - 220,
            flipY: y < 84,
        };
    }

    function isTieringPointSelection(indices: number[]): boolean {
        return indices.length === 1;
    }

    function buildTieringSelectionLabel(
        sliderValues: number[],
        timeRange: [number, number] | null,
        usesRangeSelection: boolean,
        maxIndex: number,
        labelFormatter: (value: number) => string,
    ): string {
        if (!timeRange) return "";
        const sliderIndices = tieringSliderValuesToIndices(
            sliderValues,
            timeRange,
            maxIndex,
            usesRangeSelection,
        );
        if (isTieringPointSelection(sliderIndices)) {
            return labelFormatter(
                sliderValues[sliderValues.length - 1] ?? sliderValues[0] ?? timeRange[0],
            );
        }
        if (sliderValues.length >= 2) {
            return `${labelFormatter(sliderValues[0])} - ${labelFormatter(sliderValues[1])}`;
        }
        return labelFormatter(sliderValues[0] ?? timeRange[0]);
    }

    function clearTieringChartState(): void {
        cancelPendingTieringRefresh();
        cancelPendingTieringCanvasRender();
        tieringChartModel = null;
        tieringCanvasRenderResult = null;
        tieringChartLabels = [];
        tieringLegendItems = [];
        tieringChartTitle = "";
        dataSets = [];
        tieringTimeRange = null;
        tieringUsesRangeSelection = false;
        tieringSliderValues = [];
        clearTieringInspector();
        clearTieringCanvas(tieringCanvasElement);
    }

    function scheduleTieringRefresh(): void {
        cancelPendingTieringRefresh();
        clearTieringInspector();
        pendingTieringRefreshFrame = requestAnimationFrame(() => {
            pendingTieringRefreshFrame = null;
            if (_rawData) {
                void setupCharts();
            }
        });
    }

    function renderTieringChart(options?: {
        measurePerf?: boolean;
        reason?: string;
    }): void {
        if (!tieringChartModel || !tieringCanvasElement) {
            tieringCanvasRenderResult = null;
            return;
        }
        const finishSpan = options?.measurePerf
            ? startPerfSpan("graph.tiering.setupCharts.canvas", {
                  datasetCount: tieringChartModel.datasets.length,
                  labelCount: tieringChartModel.labels.length,
                  reason: options.reason ?? "render",
              })
            : null;
        tieringCanvasRenderResult = renderTieringCanvas({
            canvas: tieringCanvasElement,
            model: tieringChartModel,
        });
        finishSpan?.();
    }

    function updateTieringChartModel(
        model: TieringCanvasModel,
        options?: {
            measurePerf?: boolean;
            reason?: string;
        },
    ): void {
        tieringChartModel = model;
        tieringChartLabels = model.labels;
        tieringChartTitle = model.title;
        tieringLegendItems =
            model.datasets.length <= 24
                ? buildTieringLegendItems(model.datasets)
                : [];
        renderTieringChart(options);
    }

    function scheduleTieringChartRender(reason = "resize"): void {
        cancelPendingTieringCanvasRender();
        clearTieringInspector();
        pendingTieringCanvasFrame = requestAnimationFrame(() => {
            pendingTieringCanvasFrame = null;
            renderTieringChart({ reason });
        });
    }

    /**
     * Compact route metadata for the conflict, uninitialized until setupChartData is called
     */
    let _rawData: GraphRouteInfo | null = null;
    let fallbackGraphData: GraphData | null = null;

    const defaultMetricSelection = ["nation"];
    let selected_metrics: MetricOption[] = defaultMetricSelection.map((name) => {
        return { value: name, label: name };
    });
    let tieringQuickLayouts: TieringQuickLayout[] = [];

    $: isResetDirty = (() => {
        const selectedValues = selected_metrics.map((metric) => metric.value);
        const sameSelected =
            selectedValues.length === defaultMetricSelection.length &&
            selectedValues.every(
                (value, idx) => value === defaultMetricSelection[idx],
            );
        const allAllianceCount = _rawData
            ? _rawData.coalitions[0].alliance_ids.length +
              _rawData.coalitions[1].alliance_ids.length
            : 0;
        const allSelected =
            !_rawData || _allowedAllianceIds.size === allAllianceCount;
        return (
            normalize ||
            useSingleColor ||
            cityBandSize > 1 ||
            !sameSelected ||
            !allSelected
        );
    })();

    $: items =
        !_rawData
            ? []
            : [
                  ...(_rawData.metric_names ?? []).map((name) => {
                      return { value: name, label: name };
                  }),
              ];
    $: tieringQuickLayouts = Object.entries(_chartLayouts).map(
        ([name, layout]) => ({
            name,
            metrics: layout.metrics.map((metricName) => ({
                value: metricName,
                label: metricName,
            })),
            normalize: layout.normalize,
            href: conflictId
                ? `${base}/tiering?id=${conflictId}&selected=${layout.metrics.join(".")}${layout.normalize ? "&normalize=1" : ""}`
                : null,
        }),
    );

    let previous_selected: string[] = [];

    function commitNormalizeChange(nextNormalize: boolean): void {
        normalize = nextNormalize;
        if (previous_normalize === normalize) return;
        previous_normalize = normalize;
        if (_rawData) {
            setQueryParam("normalize", normalize ? 1 : null, { replace: true });
            saveCurrentQueryParams();
            scheduleTieringRefresh();
        }
    }

    function commitUseSingleColorChange(nextUseSingleColor: boolean): void {
        useSingleColor = nextUseSingleColor;
        if (previous_useSingleColor === useSingleColor) return;
        previous_useSingleColor = useSingleColor;
        if (_rawData) {
            setQueryParam("unicolor", useSingleColor ? 1 : null, {
                replace: true,
            });
            saveCurrentQueryParams();
            scheduleTieringRefresh();
        }
    }

    function commitCityBandSizeChange(nextCityBandSize: number): void {
        cityBandSize = Math.max(0, Math.floor(Number(nextCityBandSize) || 0));
        if (previous_cityBandSize === cityBandSize) return;
        previous_cityBandSize = cityBandSize;
        if (_rawData) {
            setQueryParam("cityband", cityBandSize > 1 ? cityBandSize : null, {
                replace: true,
            });
            saveCurrentQueryParams();
            scheduleTieringRefresh();
        }
    }

    function commitAllowedAllianceIdsChange(nextAllowedAllianceIds: number[]): void {
        _allowedAllianceIds = new Set(nextAllowedAllianceIds);
        requestedAllianceIdsFromQuery =
            nextAllowedAllianceIds.length > 0 ? [...nextAllowedAllianceIds] : null;
        setQueryParam(
            "ids",
            nextAllowedAllianceIds.length > 0
                ? nextAllowedAllianceIds.join(".")
                : null,
            {
                replace: true,
            },
        );
        saveCurrentQueryParams();
        scheduleTieringRefresh();
    }

    function commitTieringSliderValuesChange(nextSliderValues: number[]): void {
        if (!tieringTimeRange) return;
        const nextValues = normalizeTieringSliderValues(
            nextSliderValues,
            tieringTimeRange,
            tieringUsesRangeSelection,
        );
        if (arrayEquals(tieringSliderValues, nextValues)) {
            return;
        }
        tieringSliderValues = nextValues;
        const maxIndex = Math.max(0, (dataSets[0]?.data.length ?? 1) - 1);
        const trace = getGraphDataAtTime(
            dataSets,
            tieringSliderValuesToIndices(
                nextValues,
                tieringTimeRange,
                maxIndex,
                tieringUsesRangeSelection,
            ),
        );
        if (!tieringChartModel) return;
        clearTieringInspector();
        updateTieringChartModel(
            {
                ...tieringChartModel,
                datasets: trace,
            },
            {
                reason: "slider",
            },
        );
    }

    function handleTieringMetricsCommit(nextSelectedMetrics: MetricOption[]): void {
        const nextMetrics = Array.isArray(nextSelectedMetrics)
            ? nextSelectedMetrics.map((metric) => ({ ...metric }))
            : [];
        const nextSelected = nextMetrics.map((metric) => metric.value);
        if (nextSelected.length === 0 || arrayEquals(previous_selected, nextSelected)) {
            return;
        }
        selected_metrics = nextMetrics;
        previous_selected = nextSelected;
        if (_rawData) {
            setQueryParam("selected", nextSelected.join("."));
            saveCurrentQueryParams();
            scheduleTieringRefresh();
        }
    }

    function handleTieringExportDatasetKeyChange(datasetKey: string): void {
        selectedTieringExportDataset = datasetKey;
    }

    function handleTieringQuickLayoutCommit(layout: TieringQuickLayout): void {
        selected_metrics = layout.metrics.map((metric) => ({ ...metric }));
        previous_selected = selectedMetricValues();
        normalize = layout.normalize;
        previous_normalize = normalize;
        setQueryParams(
            {
                selected: previous_selected.join("."),
                normalize: normalize ? 1 : null,
            },
            {
                replace: false,
            },
        );
        saveCurrentQueryParams();
        scheduleTieringRefresh();
    }

    type TieringQueryState = {
        conflictId: string | null;
        selected: string[];
        normalize: boolean;
        useSingleColor: boolean;
        cityBandSize: number;
        requestedAllianceIds: number[];
    };

    function normalizeAllianceIdList(
        ids: Iterable<number> | null | undefined,
    ): number[] {
        if (!ids) return [];

        return Array.from(
            new Set(
                Array.from(ids)
                    .map((id) => Math.trunc(Number(id)))
                    .filter((id) => id > 0),
            ),
        ).sort((left, right) => left - right);
    }

    function buildTieringQueryState(): TieringQueryState {
        return {
            conflictId,
            selected: selectedMetricValues(),
            normalize,
            useSingleColor,
            cityBandSize,
            requestedAllianceIds: normalizeAllianceIdList(
                requestedAllianceIdsFromQuery ?? Array.from(_allowedAllianceIds),
            ),
        };
    }

    function syncTieringStateFromUrl(): void {
        const nextConflictId = ($page.url.searchParams.get("id") ?? "").trim();
        const previousState = buildTieringQueryState();

        loadQueryParams($page.url.searchParams);

        if (
            nextConflictId.length > 0 &&
            nextConflictId !== previousState.conflictId
        ) {
            conflictId = nextConflictId;
            _loaded = false;
            _loadError = null;
            setupChartData(nextConflictId);
            return;
        }

        if (!_rawData) return;

        const nextState = buildTieringQueryState();
        const idsChanged = !arrayEquals(
            previousState.requestedAllianceIds,
            nextState.requestedAllianceIds,
        );

        if (idsChanged) {
            _allowedAllianceIds = new Set();
        }

        if (
            idsChanged ||
            !arrayEquals(previousState.selected, nextState.selected) ||
            previousState.normalize !== nextState.normalize ||
            previousState.useSingleColor !== nextState.useSingleColor ||
            previousState.cityBandSize !== nextState.cityBandSize
        ) {
            scheduleTieringRefresh();
        }
    }

    function loadQueryParams(params: URLSearchParams) {
        selected_metrics = defaultMetricSelection.map((name) => {
            return { value: name, label: name };
        });
        normalize = false;
        useSingleColor = false;
        cityBandSize = 0;
        requestedAllianceIdsFromQuery = null;

        const selected = params.get("selected");
        if (selected) {
            selected_metrics = selected.split(".").map((name) => {
                return { value: name, label: name };
            });
        }
        previous_selected = selectedMetricValues();

        const normalizeStr = params.get("normalize");
        if (normalizeStr && !isNaN(+normalizeStr)) {
            normalize = +normalizeStr === 1;
        }
        previous_normalize = normalize;

        const unicolorStr = params.get("unicolor");
        if (unicolorStr && !isNaN(+unicolorStr)) {
            useSingleColor = +unicolorStr === 1;
        }
        previous_useSingleColor = useSingleColor;

        const cityBandStr = params.get("cityband");
        if (cityBandStr && !isNaN(+cityBandStr)) {
            const parsed = Math.max(0, Math.floor(+cityBandStr));
            cityBandSize = parsed > 1 ? parsed : 0;
        }
        previous_cityBandSize = cityBandSize;

        const idStr = params.get("ids");
        if (idStr) {
            const parsedIds = idStr
                .split(".")
                .map((id) => Math.trunc(Number(id)))
                .filter((id) => Number.isFinite(id) && id > 0);
            requestedAllianceIdsFromQuery =
                parsedIds.length > 0 ? parsedIds : null;
        }
    }

    $: {
        if (browser && hasBootstrappedUrlState) {
            const nextSearch = $page.url.search;
            if (nextSearch !== lastParsedUrlSearch) {
                lastParsedUrlSearch = nextSearch;
                syncTieringStateFromUrl();
            }
        }
    }

    onMount(() => {
        if (typeof ResizeObserver !== "undefined" && tieringCanvasContainer) {
            tieringResizeObserver = new ResizeObserver(() => {
                scheduleTieringChartRender("resize");
            });
            tieringResizeObserver.observe(tieringCanvasContainer);
        }

        bootstrapIdRouteLifecycle({
            restoreParams: ["selected", "normalize", "unicolor", "cityband", "ids"],
            preserveParams: ["id"],
            onBeforeResolve: loadQueryParams,
            onMissingId: () => {
                _loadError = "Missing conflict id in URL";
                _loaded = true;
            },
            onResolvedId: (id) => {
                conflictId = id;
                beginJourneySpan("journey.conflict_to_tiering.routeTransition", {
                    mode: "route-entry",
                    conflictId: id,
                });
                beginJourneySpan("journey.conflict_to_tiering.firstMount", {
                    conflictId: id,
                });
                setupChartData(id);
            },
        });
        lastParsedUrlSearch = window.location.search;
        hasBootstrappedUrlState = true;
    });

    onDestroy(() => {
        latestSetupRunId++;
        lastTieringRenderKey = null;
        cancelPendingTieringRefresh();
        cancelPendingTieringCanvasRender();
        tieringResizeObserver?.disconnect();
        tieringResizeObserver = null;
        clearTieringChartState();
        tieringArtifacts?.destroy();
        tieringArtifacts = null;
    });

    function ensureTieringArtifacts(nextConflictId: string): TieringArtifactHandle {
        if (
            tieringArtifacts &&
            tieringArtifacts.conflictId === nextConflictId &&
            tieringArtifacts.version === config.version.graph_data
        ) {
            return tieringArtifacts;
        }

        tieringArtifacts?.destroy();
        tieringArtifacts = acquireTieringArtifactHandle({
            conflictId: nextConflictId,
            version: config.version.graph_data,
        });
        return tieringArtifacts;
    }

    function setupChartData(conflictId: string) {
        hasCompletedFirstTieringMount = false;
        _allowedAllianceIds = new Set();
        clearTieringChartState();
        beginJourneySpan("journey.conflict_to_tiering.dataFetch", {
            conflictId,
        });
        _loadError = null;
        _loaded = false;

        const artifacts = ensureTieringArtifacts(conflictId);
        const metricSetup = buildSelectedTieringMetrics();
        if (!metricSetup) {
            _loadError = "Select at least one metric to render tiering.";
            _loaded = true;
            endJourneySpan("journey.conflict_to_tiering.dataFetch");
            return;
        }

        const { metrics, isAnyCumulative } = metricSetup;
        _rawData = null;
        fallbackGraphData = null;
        const runId = ++latestSetupRunId;

        artifacts
            .bootstrapVisibleDataset({
                metrics,
                requestedAllianceIds: requestedAllianceIdsFromQuery,
                useSingleColor,
                cityBandSize,
                contextKey: `tiering:${conflictId}`,
                requestId: runId,
            })
            .then((data) => {
                if (runId !== latestSetupRunId) return;
                if (!data) {
                    clearTieringChartState();
                    _loadError =
                        "Could not initialize the tiering view. Please retry.";
                    _loaded = true;
                    return;
                }

                _rawData = data.info;
                fallbackGraphData = data.graphData ?? null;
                conflictName = data.info.name;
                _allowedAllianceIds = new Set(data.selectedAllianceIds);
                datasetProvenance = formatDatasetProvenance(
                    config.version.graph_data,
                    data.info.update_ms,
                );

                if (data.dataset) {
                    lastTieringRenderKey = `${data.cacheKey}|metricLabels:${selected_metrics
                        .map((metric) => metric.label)
                        .join("|")}`;
                    renderTieringDataResponse(data.dataset, isAnyCumulative);
                }

                _loaded = true;
                endJourneySpan("journey.conflict_to_tiering.routeTransition");
                saveCurrentQueryParams();
                warmTieringSecondaryArtifacts(conflictId);
            })
            .catch((error) => {
                console.error("Failed to load tiering graph data", error);
                clearTieringChartState();
                _loadError =
                    "Could not load conflict graph data. Please try again later.";
                _loaded = true;
            })
            .finally(() => {
                endJourneySpan("journey.conflict_to_tiering.dataFetch");
            });
    }

    function retryLoad() {
        if (!conflictId) return;
        loadQueryParams(getCurrentQueryParams());
        setupChartData(conflictId);
    }

    function buildSelectedTieringMetrics(): {
        metrics: TierMetric[];
        isAnyCumulative: boolean;
    } | null {
        if (selected_metrics.length === 0) {
            return null;
        }

        const metrics: TierMetric[] = selected_metrics.map((metric) => {
            return {
                name: metric.value,
                normalize,
                cumulative: isCumulativeMetricName(metric.value),
            };
        });

        return {
            metrics,
            isAnyCumulative: metrics.reduce((hasCumulative, metric) => {
                return hasCumulative || metric.cumulative;
            }, false),
        };
    }

    // The layout of the charts (the key is id of the html element that'll be created)
    // Multiple metrics will display as a stacked bar chart (between two coalitions)
    // Its assumed the metrics are in the same units, otherwise the normalization will be incorrect
    // Normalization = Average it per city (i.e. for soldier %)
    let _chartLayouts: {
        [key: string]: {
            metrics: string[];
            normalize: boolean;
        };
    } = {
        tiering: {
            metrics: ["nation"],
            normalize: false,
        },
        mmr: {
            metrics: ["soldier", "tank", "aircraft", "ship"],
            normalize: true,
        },
        "air %": {
            metrics: ["aircraft"],
            normalize: true,
        },
        "avg infra": {
            metrics: ["infra"],
            normalize: true,
        },
        damage: {
            metrics: ["loss:loss_value", "dealt:loss_value"],
            normalize: true,
        },
        "wars won": {
            metrics: ["off:wars_won", "def:wars_won"],
            normalize: false,
        },
    };

    function resetFilters() {
        normalize = false;
        previous_normalize = false;
        useSingleColor = false;
        previous_useSingleColor = false;
        cityBandSize = 0;
        previous_cityBandSize = 0;
        selected_metrics = ["nation"].map((name) => ({
            value: name,
            label: name,
        }));
        previous_selected = selectedMetricValues();
        _allowedAllianceIds = new Set();
        requestedAllianceIdsFromQuery = null;
        resetQueryParams(
            ["selected", "normalize", "unicolor", "cityband", "ids"],
            ["id"],
        );
        saveCurrentQueryParams();
        if (_rawData) {
            scheduleTieringRefresh();
        }
    }


    function getGraphDataAtTime(
        data: DataSet[],
        slider: number[],
    ): TieringCanvasDataset[] {
        const isPointSelection = slider.length === 1;
        const pointIndex = slider.length > 1 ? slider[1] : slider[0];
        const startIndex = slider[0] ?? 0;
        const endIndex = slider[1] ?? slider[0] ?? 0;

        return data.map((dataSet) => {
            if (isPointSelection) {
                return {
                    label: dataSet.label,
                    data: dataSet.data[pointIndex] ?? [],
                    backgroundColor: dataSet.color,
                    stack: "" + dataSet.group,
                };
            }

            const endRow = dataSet.data[endIndex] ?? [];
            const startRow = dataSet.data[startIndex] ?? [];
            const len = Math.max(endRow.length, startRow.length);
            const values = new Array<number>(len);
            for (let j = 0; j < len; j++) {
                values[j] = (endRow[j] ?? 0) - (startRow[j] ?? 0);
            }
            return {
                label: dataSet.label,
                data: values,
                backgroundColor: dataSet.color,
                stack: "" + dataSet.group,
            };
        });
    }

    function getTieringSliderIndices(): number[] {
        if (!tieringTimeRange || dataSets.length === 0) {
            return [0];
        }
        const maxIndex = Math.max(0, (dataSets[0]?.data.length ?? 1) - 1);
        return tieringSliderValuesToIndices(
            tieringCurrentSliderValues,
            tieringTimeRange,
            maxIndex,
            tieringUsesRangeSelection,
        );
    }

    function buildTieringExportBundle(): ExportBundle | null {
        if (!_rawData || !tieringTimeRange || dataSets.length === 0) {
            return null;
        }

        const cityLabels = tieringChartLabels;
        const sliderIndices = getTieringSliderIndices();
        const sliderTimeValues = tieringCurrentSliderValues;
        const sliderSnapshot = getGraphDataAtTime(dataSets, sliderIndices);

        const snapshotRows = sliderSnapshot.flatMap((trace) =>
            (trace.data ?? []).map((value, cityIndex) => [
                trace.label,
                trace.stack,
                cityLabels[cityIndex] ?? cityIndex,
                value,
            ]),
        );

        const timeRows: (string | number)[][] = [];
        for (const dataSet of dataSets) {
            for (
                let timeIndex = 0;
                timeIndex < dataSet.data.length;
                timeIndex++
            ) {
                const timeValue = tieringTimeRange[0] + timeIndex;
                const cityRow = dataSet.data[timeIndex] ?? [];
                for (
                    let cityIndex = 0;
                    cityIndex < cityRow.length;
                    cityIndex++
                ) {
                    timeRows.push([
                        dataSet.label,
                        dataSet.group,
                        timeValue,
                        cityLabels[cityIndex] ?? cityIndex,
                        cityRow[cityIndex] ?? 0,
                    ]);
                }
            }
        }

        const settingsRows = buildSettingsRows([
            ["conflict_id", conflictId ?? ""],
            ["conflict_name", conflictName],
            ["selected_metrics", selected_metrics.map((m) => m.value)],
            ["normalize", normalize ? 1 : 0],
            ["single_color", useSingleColor ? 1 : 0],
            ["city_band_size", cityBandSize],
            ["selected_alliance_count", _allowedAllianceIds.size],
            ["slider_selection", sliderTimeValues],
        ]);

        return {
            baseFileName: `conflict-${conflictId ?? "conflict"}-tiering`,
            meta: {
                conflictId,
                conflictName,
                selectedMetrics: selected_metrics.map((m) => m.value),
                normalize,
                useSingleColor,
                cityBandSize,
                selectedAllianceIds: Array.from(_allowedAllianceIds),
                sliderIndices,
                sliderTimeValues,
            },
            tables: [
                {
                    key: "snapshot",
                    label: "Current slider snapshot",
                    columns: ["dataset", "coalition_stack", "city", "value"],
                    rows: snapshotRows,
                },
                {
                    key: "timeseries",
                    label: "Full timeline by city",
                    columns: [
                        "dataset",
                        "coalition_stack",
                        "time",
                        "city",
                        "value",
                    ],
                    rows: timeRows,
                },
                {
                    key: "settings",
                    label: "Current filter settings",
                    columns: ["key", "value"],
                    rows: settingsRows,
                },
            ],
        };
    }

    function handleTieringExport(action: ExportMenuAction): void {
        const bundle = buildTieringExportBundle();
        if (!bundle) return;
        exportBundleData({
            bundle,
            datasetKey: action.datasetKey,
            format: action.format,
            target: action.target,
        });
    }

    async function setupCharts() {
        if (!_rawData) return;
        const runId = ++latestSetupRunId;
        // if selected_metrics is empty, set to default
        if (selected_metrics.length == 0) {
            selected_metrics = defaultMetricSelection.map((name) => {
                return { value: name, label: name };
            });
            previous_selected = selectedMetricValues();
        }
        const metricSetup = buildSelectedTieringMetrics();
        if (!metricSetup) return;
        const metrics = metricSetup.metrics;
        let isAnyCumulative = metricSetup.isAnyCumulative;
        if (_allowedAllianceIds.size == 0) {
            _allowedAllianceIds = resolveInitialAllowedAllianceIds(
                _rawData,
                requestedAllianceIdsFromQuery,
            );
        }
        let alliance_ids = _rawData.coalitions.map((coalition) =>
            coalition.alliance_ids.filter((id) => _allowedAllianceIds.has(id)),
        );

        const cacheKey = getDataSetCacheKey(_rawData, metrics, alliance_ids);
        const renderKey = `${cacheKey}|metricLabels:${selected_metrics
            .map((m) => m.label)
            .join("|")}`;
        if (renderKey === lastTieringRenderKey && tieringChartModel) {
            incrementPerfCounter("graph.tiering.renderSkipped", 1, {
                reason: "unchanged-render-key",
            });
            return;
        }
        const artifacts = tieringArtifacts;
        const finishComputeSpan = startPerfSpan(
            "journey.conflict_to_tiering.graphCompute",
            { workerAvailable: !!artifacts?.hasWorker() },
        );
        const response = await (artifacts
            ? artifacts.getDataset({
                cacheKey,
                metrics,
                allianceIds: alliance_ids,
                useSingleColor,
                cityBandSize,
                graphData: fallbackGraphData ?? undefined,
                contextKey: `tiering:${conflictId ?? "unknown"}`,
                requestId: runId,
            })
            : fallbackGraphData
              ? Promise.resolve(
                getDataSetsByTime(
                    fallbackGraphData,
                    metrics,
                    alliance_ids,
                    cityBandSize,
                ),
            )
              : Promise.resolve(null)).finally(() => {
                finishComputeSpan();
            });
        if (runId !== latestSetupRunId) return;
        if (!response) return;

        renderTieringDataResponse(response, isAnyCumulative);
        lastTieringRenderKey = renderKey;
    }

    function renderTieringDataResponse(
        response: DataSetResponse,
        isAnyCumulative: boolean,
    ): void {
        const finishSpan = startPerfSpan("graph.tiering.setupCharts", {
            datasetCount: response.data.length,
            metricCount: selected_metrics.length,
        });

        tieringTimeRange = response.time;
        tieringUsesRangeSelection = isAnyCumulative;
        dataSets = response.data;
        tieringSliderValues = normalizeTieringSliderValues(
            [],
            response.time,
            isAnyCumulative,
        );

        const maxIndex = Math.max(0, (dataSets[0]?.data.length ?? 1) - 1);
        let trace = getGraphDataAtTime(
            dataSets,
            tieringSliderValuesToIndices(
                tieringSliderValues,
                response.time,
                maxIndex,
                isAnyCumulative,
            ),
        );

        let labels = response.city_labels;
        if (!labels) {
            let minCity = response.city_range[0];
            let maxCity = response.city_range[1];
            labels = Array.from(
                { length: maxCity - minCity + 1 },
                (_, i) => i + minCity,
            );
        }
        const title =
            selected_metrics.map((metric) => metric.label).join(" / ") +
            " by City";
        updateTieringChartModel(
            {
                labels,
                datasets: trace,
                title,
            },
            {
                measurePerf: true,
                reason: "setup",
            },
        );

        formatTieringTimeValue = response.is_turn
            ? formatTurnsToDate
            : formatDaysToDate;
        finishSpan();
        if (!hasCompletedFirstTieringMount) {
            hasCompletedFirstTieringMount = true;
            endJourneySpan("journey.conflict_to_tiering.firstMount");
        }
    }

    $: tieringCurrentSliderValues = normalizeTieringSliderValues(
        tieringSliderValues,
        tieringTimeRange,
        tieringUsesRangeSelection,
    );
    $: tieringCurrentSelectionLabel = buildTieringSelectionLabel(
        tieringCurrentSliderValues,
        tieringTimeRange,
        tieringUsesRangeSelection,
        Math.max(0, (dataSets[0]?.data.length ?? 1) - 1),
        formatTieringTimeValue,
    );

    function handleTieringCanvasPointerMove(event: PointerEvent): void {
        const target = event.currentTarget as HTMLCanvasElement | null;
        if (!target) {
            tieringHoverBar = null;
            tieringTooltipAnchor = null;
            return;
        }

        const rect = target.getBoundingClientRect();
        const nextHoverBar = findTieringCanvasHoverBar(
            tieringCanvasRenderResult,
            event.clientX - rect.left,
            event.clientY - rect.top,
        );
        tieringHoverBar = nextHoverBar;
        tieringTooltipAnchor = nextHoverBar
            ? resolveTieringTooltipAnchor(rect, event.clientX, event.clientY)
            : null;
    }

    function handleTieringCanvasPointerLeave(): void {
        tieringHoverBar = null;
        tieringTooltipAnchor = null;
    }

    interface DataSet {
        group: number;
        label: string;
        color: string;
        data: number[][];
    }

    interface DataSetResponse {
        data: DataSet[];
        city_range: [number, number];
        city_labels?: (string | number)[];
        time: [number, number];
        is_turn: boolean;
    }

    function getDataSetCacheKey(
        data: { coalitions: Array<{ alliance_ids: number[] }> },
        metrics: TierMetric[],
        alliance_ids: number[][],
    ): string {
        return buildTieringDatasetCacheKey({
            conflictId: conflictId ?? "-",
            graphVersion: config.version.graph_data,
            metrics,
            allianceIds: alliance_ids,
            defaultAllianceIds: buildDefaultTieringAllianceIds(data),
            useSingleColor,
            cityBandSize,
        });
    }

    // Convert the raw json data from S3 to tiering datasets (for the specific metrics and turn/day range)
    // Normalization uses backend capacity series when available and falls back
    // to the legacy per-city caps for older payloads.
    function getDataSetsByTime(
        data: GraphData,
        metrics: TierMetric[],
        alliance_ids: number[][],
        cityBandSize: number,
    ): DataSetResponse | null {
        return getDataSetsByTimeShared(
            data,
            metrics,
            alliance_ids,
            useSingleColor,
            cityBandSize,
        );
    }
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin="anonymous" />
    <meta name="lc-data-origin" content={config.data_origin} />
    <meta
        name="lc-graph-data-version"
        content={String(config.version.graph_data)}
    />
    <title>Graphs</title>
</svelte:head>
<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: `${base}/` },
                    { label: "Conflicts", href: `${base}/conflicts` },
                    {
                        label: conflictName || "Conflict",
                        href: conflictId
                            ? `${base}/conflict?id=` + conflictId
                            : undefined,
                    },
                    { label: "Tiering" },
                ]}
            />
            <span class="ux-page-title-main"
                >Conflict Tiering: {conflictName}</span
            >
        </div>
    </h1>
    <ConflictRouteTabs {conflictId} active="tiering" routeKind="single" />
    <div
        class="row m-0 p-0 ux-surface ux-tab-panel"
        style="min-height: 116px; position: relative; overflow: visible;"
    >
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
        <div class="col-12 ux-compact-controls p-2 border-bottom border-3">
            <div class="ux-graph-control-launcher">
                {#if _rawData}
                    <TieringControlsPanel
                        rawData={_rawData}
                        {items}
                        selectedMetrics={selected_metrics}
                        {normalize}
                        {useSingleColor}
                        {cityBandSize}
                        allowedAllianceIds={Array.from(_allowedAllianceIds)}
                        timeRange={tieringTimeRange}
                        usesRangeSelection={tieringUsesRangeSelection}
                        sliderValues={tieringCurrentSliderValues}
                        isTurn={formatTieringTimeValue === formatTurnsToDate}
                        selectedExportDatasetKey={selectedTieringExportDataset}
                        exportDatasets={tieringExportDatasets}
                        quickLayouts={tieringQuickLayouts}
                        {isResetDirty}
                        onSelectedMetricsCommit={handleTieringMetricsCommit}
                        onNormalizeCommit={commitNormalizeChange}
                        onUseSingleColorCommit={commitUseSingleColorChange}
                        onCityBandSizeCommit={commitCityBandSizeChange}
                        onAllowedAllianceIdsCommit={commitAllowedAllianceIdsChange}
                        onSliderValuesCommit={commitTieringSliderValuesChange}
                        onQuickLayoutCommit={handleTieringQuickLayoutCommit}
                        onSelectedExportDatasetKeyChange={handleTieringExportDatasetKeyChange}
                        onExport={handleTieringExport}
                        onReset={resetFilters}
                    />
                {:else}
                    <div class="ux-graph-controls-loading small ux-muted">Loading chart controls...</div>
                {/if}
            </div>
        </div>
    </div>
    <div class="container-fluid m-0 p-0 mt-2 ux-surface p-2">
        {#if tieringChartTitle}
            <div class="fw-semibold mb-2">{tieringChartTitle}</div>
        {/if}
        {#if tieringLegendItems.length > 0}
            <div class="d-flex flex-wrap gap-2 mb-3 small">
                {#each tieringLegendItems as item}
                    <span class="ux-tiering-legend-item">
                        <span
                            class="ux-tiering-legend-swatch"
                            style={`background:${item.color};`}
                        ></span>
                        <span>{item.label}</span>
                    </span>
                {/each}
            </div>
        {/if}
        <div
            class="chart-container"
            bind:this={tieringCanvasContainer}
            style="position: relative; height:80vh; width:100%;"
        >
            <canvas
                id="myChart"
                bind:this={tieringCanvasElement}
                class="ux-tiering-chart-canvas"
                on:pointermove={handleTieringCanvasPointerMove}
                on:pointerleave={handleTieringCanvasPointerLeave}
            ></canvas>
            {#if tieringHoverBar && tieringTooltipAnchor}
                <div
                    class="ux-tiering-tooltip"
                    class:is-flip-x={tieringTooltipAnchor.flipX}
                    class:is-flip-y={tieringTooltipAnchor.flipY}
                    style={`left:${tieringTooltipAnchor.x}px;top:${tieringTooltipAnchor.y}px;--tiering-tooltip-accent:${tieringHoverBar.color};`}
                >
                    <div class="ux-tiering-tooltip__title">
                        <span
                            class="ux-tiering-tooltip__swatch"
                            style={`background:${tieringHoverBar.color};`}
                        ></span>
                        <span>{tieringHoverBar.datasetLabel}</span>
                    </div>
                    <div class="ux-tiering-tooltip__subtitle">
                        City {tieringHoverBar.label} • {tieringCurrentSelectionLabel}
                    </div>
                    <div class="ux-tiering-tooltip__row">
                        <span>Segment</span>
                        <strong>{formatTieringNumber(tieringHoverBar.segmentValue)}</strong>
                    </div>
                    <div class="ux-tiering-tooltip__row">
                        <span>Total</span>
                        <strong>{formatTieringNumber(tieringHoverBar.stackTotal)}</strong>
                    </div>
                </div>
            {/if}
        </div>
        <!-- <canvas id="myChart" width="400" height="400"></canvas> -->
    </div>
    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}

</div>

<style>
    .ux-graph-control-launcher {
        min-height: 3rem;
    }

    .ux-graph-controls-loading {
        min-height: 5rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ux-tiering-chart-canvas {
        display: block;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        color: var(--bs-body-color);
        --tiering-axis-color: rgba(100, 116, 139, 0.9);
        --tiering-grid-color: rgba(148, 163, 184, 0.22);
        --tiering-text-color: var(--bs-body-color);
    }

    .ux-tiering-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 0.32rem;
        padding: 0.12rem 0.4rem;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 4px;
        background: rgba(148, 163, 184, 0.08);
    }

    .ux-tiering-legend-swatch {
        display: inline-block;
        width: 0.8rem;
        height: 0.8rem;
        border-radius: 999px;
        flex: 0 0 auto;
    }

    .ux-tiering-tooltip {
        position: absolute;
        transform: translate(12px, calc(-100% - 12px));
        max-width: min(16rem, calc(100vw - 1.5rem));
        padding: 0.42rem 0.52rem;
        border-radius: 6px;
        border: 1px solid var(--tiering-tooltip-accent, rgba(148, 163, 184, 0.5));
        background: rgba(15, 23, 42, 0.96);
        color: rgb(248, 250, 252);
        pointer-events: none;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
        z-index: 2;
    }

    .ux-tiering-tooltip.is-flip-x {
        transform: translate(calc(-100% - 12px), calc(-100% - 12px));
    }

    .ux-tiering-tooltip.is-flip-y {
        transform: translate(12px, 12px);
    }

    .ux-tiering-tooltip.is-flip-x.is-flip-y {
        transform: translate(calc(-100% - 12px), 12px);
    }

    .ux-tiering-tooltip__title {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
        font-size: 0.76rem;
    }

    .ux-tiering-tooltip__swatch {
        width: 0.72rem;
        height: 0.72rem;
        border-radius: 999px;
        flex: 0 0 auto;
    }

    .ux-tiering-tooltip__subtitle {
        color: rgba(226, 232, 240, 0.84);
        font-size: 0.67rem;
        margin-top: 0.08rem;
        margin-bottom: 0.35rem;
    }

    .ux-tiering-tooltip__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.7rem;
        font-size: 0.71rem;
    }

    .ux-tiering-tooltip__row + .ux-tiering-tooltip__row {
        margin-top: 0.14rem;
    }

    :global([data-bs-theme="dark"]) .ux-tiering-chart-canvas {
        --tiering-axis-color: rgba(203, 213, 225, 0.9);
        --tiering-grid-color: rgba(148, 163, 184, 0.18);
    }

    :global([data-bs-theme="dark"]) .ux-tiering-legend-item {
        border-color: rgba(148, 163, 184, 0.2);
        background: rgba(30, 41, 59, 0.45);
    }

</style>
