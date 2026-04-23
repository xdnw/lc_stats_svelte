<script lang="ts">
    import "../../styles/conflict-shell.css";
    import "../../styles/conflict-widgets.css";
    import { browser } from "$app/environment";
    import { onMount, onDestroy } from "svelte";
    import { page } from "$app/stores";
    import BubbleCanvas from "../../components/BubbleCanvas.svelte";
    import Icon from "../../components/Icon.svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import GraphSlider from "../../components/GraphSlider.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import { base } from "$app/paths";
    import {
        formatTurnsToDate,
        formatDaysToDate,
    } from "$lib/formatting";
    import type { GraphData, TierMetric } from "$lib/types";
    import { setQueryParam, resetQueryParams } from "$lib/queryState";
    import { bootstrapIdRouteLifecycle } from "$lib/routeBootstrap";
    import { arrayEquals } from "$lib/misc";
    import { saveCurrentQueryParams } from "$lib/queryStorage";
    import { formatDatasetProvenance } from "$lib/runtime";
    import { incrementPerfCounter, startPerfSpan } from "$lib/perf";
    import {
        buildSettingsRows,
        exportBundleData,
        type ExportBundle,
        type ExportDatasetOption,
    } from "$lib/dataExport";
    import type { GraphRouteInfo } from "$lib/graphRouteInfo";
    import { resolveInitialAllowedAllianceIds } from "$lib/graphRouteInfo";
    import {
        buildBubbleCanvasModel,
        clampBubbleFrameIndex,
        getBubbleCanvasTheme,
        type BubbleCanvasHoverPoint,
        type BubbleCanvasModel,
        type BubbleCanvasPointMeta,
        type BubbleCanvasRenderResult,
    } from "$lib/bubbleCanvas";
    import {
        type BubbleChartPointerEventDetail,
    } from "../../components/bubble";
    import {
        acquireBubbleArtifactHandle,
        type BubbleArtifactHandle,
    } from "$lib/conflictArtifactRegistry";
    import {
        buildBubbleTraceCacheKey,
        buildDefaultAllianceIdsByCoalition,
        buildSelectedAllianceIdsByCoalition,
    } from "$lib/graphArtifactKeys";
    import {
        DEFAULT_BUBBLE_AGGREGATION_MODE,
        parseBubbleAggregationMode,
        type BubbleAggregationMode,
    } from "$lib/bubbleAggregation";
    import type { ExportMenuAction } from "../../components/exportMenuTypes";
    import { appConfig as config } from "$lib/appConfig";
    import { generateTraces } from "$lib/bubbleTraceCompute";
    import { beginJourneySpan, endJourneySpan } from "$lib/perf";
    import {
        type TraceBuildResult,
    } from "$lib/graphDerivedCache";
    import {
        buildBubbleTimelineTicks,
        type BubbleTimelineTickDescriptor,
    } from "$lib/bubbleTimeline";
    import {
        buildCityRangeQuery,
        DEFAULT_CITY_RANGE,
        isDefaultCityRange,
        normalizeCityRange,
        parseCityRange,
        type CityRange,
    } from "$lib/cityRange";
    import { isCumulativeMetricName } from "$lib/metrics";

    type PrefetchArtifactsModule = typeof import("$lib/prefetchArtifactsClient");

    type MetricOption = {
        value: string;
        label: string;
    };

    type BubbleTooltipAnchor = {
        x: number;
        y: number;
        flipX: boolean;
        flipY: boolean;
    };

    type BubbleCanvasHandle = {
        downloadPng: (fileName?: string) => Promise<boolean>;
        resetView: () => void;
    };

    type BubbleControlsPanelComponent =
        typeof import("../../components/BubbleControlsPanel.svelte").default;

    let prefetchArtifactsPromise: Promise<PrefetchArtifactsModule> | null = null;
    let bubbleControlsPanelPromise: Promise<BubbleControlsPanelComponent> | null =
        null;

    function loadPrefetchArtifacts(): Promise<PrefetchArtifactsModule> {
        if (!prefetchArtifactsPromise) {
            prefetchArtifactsPromise = import("$lib/prefetchArtifactsClient");
        }

        return prefetchArtifactsPromise;
    }

    function ensureBubbleControlsPanel(): Promise<BubbleControlsPanelComponent> {
        if (bubbleControlsPanelPromise) {
            return bubbleControlsPanelPromise;
        }

        bubbleControlsPanelPromise = import(
            "../../components/BubbleControlsPanel.svelte"
        ).then((module) => module.default);
        return bubbleControlsPanelPromise;
    }

    function warmBubbleSecondaryArtifacts(conflictId: string): void {
        void loadPrefetchArtifacts()
            .then(({ warmConflictTableArtifact }) => {
                warmConflictTableArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-bubble-idle-conflict-grid",
                    routeTarget: "/conflict",
                    intentStrength: "idle",
                });
            })
            .catch((error) => {
                console.warn("Failed to load bubble prefetch helpers", error);
            });
    }

    function syncBubbleThemeState(): void {
        if (!browser) return;
        bubbleIsDarkMode =
            document.documentElement.getAttribute("data-bs-theme") === "dark";
    }

    function clearBubbleInteractionState(): void {
        bubbleHoverPoint = null;
        bubbleTooltipAnchor = null;
    }

    const MIN_BUBBLE_SIZE_SCALE = 0.5;
    const MAX_BUBBLE_SIZE_SCALE = 2;

    function clampBubbleSizeScale(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(MAX_BUBBLE_SIZE_SCALE, Math.max(MIN_BUBBLE_SIZE_SCALE, value));
    }

    function handleBubbleSizeScaleInput(event: Event): void {
        const nextPercent = Number((event.currentTarget as HTMLInputElement).value);
        bubbleSizeScale = clampBubbleSizeScale(nextPercent / 100);
    }

    function sanitizeFileNameSegment(value: string): string {
        const trimmed = value.trim().toLowerCase();
        if (!trimmed) return "bubble";
        return trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bubble";
    }

    async function downloadBubblePng(): Promise<void> {
        if (!bubbleCanvasRef) return;

        const fileName = [
            sanitizeFileNameSegment(conflictName || conflictId || "conflict"),
            "bubble",
            sanitizeFileNameSegment(
                bubbleActiveTimeLabel || `frame-${Math.max(1, graphSliderIndex + 1)}`,
            ),
        ].join("-");

        await bubbleCanvasRef.downloadPng(`${fileName}.png`);
    }

    function resetBubbleView(): void {
        bubbleCanvasRef?.resetView();
    }

    function beginBubbleRenderMeasurement(reason: string): void {
        bubblePendingRenderFinish?.();
        const pointCount =
            bubbleChartModel?.frames[graphSliderIndex]?.pointCount ?? 0;
        bubblePendingRenderFinish = startPerfSpan("graph.bubble.render.canvas", {
            frameIndex: graphSliderIndex,
            pointCount,
            reason,
        });
    }

    function finishBubbleRenderMeasurement(): void {
        bubblePendingRenderFinish?.();
        bubblePendingRenderFinish = null;
    }

    function resolveBubbleTooltipAnchor(
        pointer: BubbleChartPointerEventDetail["pointer"],
        renderResult: BubbleCanvasRenderResult,
    ): BubbleTooltipAnchor | null {
        if (!pointer) return null;
        const x = pointer.canvasX;
        const y = pointer.canvasY;
        return {
            x,
            y,
            flipX: x > renderResult.cssWidth - 220,
            flipY: y < 84,
        };
    }

    let _rawData: GraphRouteInfo | null = null;
    let fallbackGraphData: GraphData | null = null;
    let _allowedAllianceIds: Set<number> = new Set();
    let requestedAllianceIdsFromQuery: number[] | null = null;
    let conflictId: string | null = null;
    let conflictName: string;
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";

    let normalize_x: boolean = false;
    let normalize_y: boolean = false;
    let normalize_z: boolean = false;
    let previous_normalize: number = 0;
    let bubbleAggregationMode: BubbleAggregationMode =
        DEFAULT_BUBBLE_AGGREGATION_MODE;

    let cityValues: CityRange = [...DEFAULT_CITY_RANGE];
    let graphSliderIndex: number = 0;
    let graphUpdateQueued = false;
    let bubbleChartModel: BubbleCanvasModel | null = null;
    let bubbleHoverPoint: BubbleCanvasHoverPoint | null = null;
    let bubbleTooltipAnchor: BubbleTooltipAnchor | null = null;
    let bubbleCanvasRenderResult: BubbleCanvasRenderResult | null = null;
    let bubbleCanvasRef: BubbleCanvasHandle | null = null;
    let bubblePlaybackFrame: number | null = null;
    let bubblePlaybackLastTimestamp: number | null = null;
    let bubbleActiveTimeLabel = "";
    let isBubblePlaybackActive = false;
    let bubbleArtifacts: BubbleArtifactHandle | null = null;
    let hasCompletedFirstBubbleMount = false;
    let latestGraphRunId = 0;
    let lastBubbleModelKey: string | null = null;
    let latestTraceBuildResult: TraceBuildResult | null = null;
    let latestTraceMetrics: [TierMetric, TierMetric, TierMetric] | null = null;
    let latestTraceAggregationMode: BubbleAggregationMode | null = null;
    let selectedBubbleExportDataset = "frame";
    let bubbleTimelineTicks: BubbleTimelineTickDescriptor[] = [];
    let bubbleTimelineSliderValues: number[] = [0];
    let bubbleTimelineSliderTickDescriptors: {
        value: number;
        label: string;
        percent: number;
        anchor: "start" | "center" | "end";
    }[] = [];
    let bubbleIsDarkMode = false;
    let bubbleThemeObserver: MutationObserver | null = null;
    let bubblePendingRenderFinish: (() => void) | null = null;
    let bubbleSizeScale = 1;
    let hasBootstrappedUrlState = false;
    let lastParsedUrlSearch = "";
    const BUBBLE_PLAYBACK_STEP_MS = 240;
    let bubbleCanvasConfig:
        | BubbleCanvasModel["chartConfig"]
        | null = null;

    const bubbleExportDatasets: ExportDatasetOption[] = [
        {
            key: "frame",
            label: "Current time frame points",
        },
        {
            key: "timeline",
            label: "Full timeline points",
        },
        {
            key: "settings",
            label: "Current filter settings",
        },
    ];
    const bubblePointExportColumns = [
        "coalition",
        "alliance",
        "alliance_id",
        "time",
        "time_label",
        "x",
        "y",
        "size",
    ];

    const defaultMetricSelection = [
        "dealt:loss_value",
        "loss:loss_value",
        "off:wars",
    ];
    let selected_metrics: MetricOption[] =
        defaultMetricSelection.map((name) => {
            return { value: name, label: name };
        });

    function selectedMetricValues(): string[] {
        return selected_metrics.map((metric) => metric.value);
    }

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
        const normalizeBits =
            (normalize_x ? 1 : 0) +
            (normalize_y ? 2 : 0) +
            (normalize_z ? 4 : 0);
        return (
            graphSliderIndex !== 0 ||
            !isDefaultCityRange(cityValues) ||
            normalizeBits !== 0 ||
            !sameSelected ||
            !allSelected ||
            bubbleSizeScale !== 1 ||
            bubbleAggregationMode !== DEFAULT_BUBBLE_AGGREGATION_MODE
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

    let previous_selected: string[] = [];

    function commitNormalizeChange(nextNormalize: {
        x: boolean;
        y: boolean;
        z: boolean;
    }): void {
        normalize_x = nextNormalize.x;
        normalize_y = nextNormalize.y;
        normalize_z = nextNormalize.z;
        let normalizeBits =
            (normalize_x ? 1 : 0) +
            (normalize_y ? 2 : 0) +
            (normalize_z ? 4 : 0);
        if (previous_normalize == normalizeBits) return;
        previous_normalize = normalizeBits | 0;
        setQueryParam("normalize", normalizeBits == 0 ? null : normalizeBits, {
            replace: true,
        });
        saveCurrentQueryParams();
        scheduleGraphUpdate();
    }

    function handleBubbleMetricsCommit(nextSelectedMetrics: MetricOption[]): void {
        const nextMetrics = Array.isArray(nextSelectedMetrics)
            ? nextSelectedMetrics.map((metric) => ({ ...metric }))
            : [];
        const nextSelected = nextMetrics.map((metric) => metric.value);
        if (nextMetrics.length !== 3 || arrayEquals(previous_selected, nextSelected)) {
            return;
        }
        selected_metrics = nextMetrics;
        previous_selected = nextSelected;
        setQueryParam("selected", nextSelected.join("."));
        saveCurrentQueryParams();
        scheduleGraphUpdate();
    }

    function handleBubbleCityRangeCommit(nextCityRange: CityRange): void {
        cityValues = normalizeCityRange(nextCityRange);
        const query = buildCityRangeQuery(cityValues);
        setQueryParam("city_min", query.min, { replace: true });
        setQueryParam("city_max", query.max, { replace: true });
        saveCurrentQueryParams();
        scheduleGraphUpdate();
    }

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

    function buildBubbleAllianceQueryValue(
        graphInfo: GraphRouteInfo | null,
        allianceIds: Iterable<number>,
    ): string | null {
        const normalizedIds = normalizeAllianceIdList(allianceIds);
        if (normalizedIds.length === 0) return null;
        if (!graphInfo) {
            return normalizedIds.join(".");
        }
        const defaultAllianceIds = normalizeAllianceIdList(
            buildDefaultAllianceIdsByCoalition(graphInfo).flat(),
        );
        return arrayEquals(normalizedIds, defaultAllianceIds)
            ? null
            : normalizedIds.join(".");
    }

    function handleBubbleAllianceIdsCommit(nextAllowedAllianceIds: number[]): void {
        const normalizedAllianceIds = normalizeAllianceIdList(nextAllowedAllianceIds);
        const queryValue = buildBubbleAllianceQueryValue(
            _rawData,
            normalizedAllianceIds,
        );
        _allowedAllianceIds = new Set(normalizedAllianceIds);
        requestedAllianceIdsFromQuery = queryValue ? normalizedAllianceIds : null;
        setQueryParam(
            "ids",
            queryValue,
            {
                replace: true,
            },
        );
        saveCurrentQueryParams();
        scheduleGraphUpdate();
    }

    function handleBubbleExportDatasetKeyChange(datasetKey: string): void {
        selectedBubbleExportDataset = datasetKey;
    }

    function handleBubbleAggregationByCoalitionCommit(
        enabled: boolean,
    ): void {
        const nextMode: BubbleAggregationMode = enabled
            ? "coalition"
            : DEFAULT_BUBBLE_AGGREGATION_MODE;
        if (nextMode === bubbleAggregationMode) return;

        bubbleAggregationMode = nextMode;
        setQueryParam(
            "aggregation",
            bubbleAggregationMode === DEFAULT_BUBBLE_AGGREGATION_MODE
                ? null
                : bubbleAggregationMode,
            { replace: true },
        );
        saveCurrentQueryParams();
        scheduleGraphUpdate();
    }

    type BubbleQueryState = {
        conflictId: string | null;
        selected: string[];
        requestedAllianceIds: number[];
        time: number;
        cityRange: CityRange;
        normalizeBits: number;
        aggregationMode: BubbleAggregationMode;
    };

    function buildBubbleQueryState(): BubbleQueryState {
        return {
            conflictId,
            selected: selectedMetricValues(),
            requestedAllianceIds: normalizeAllianceIdList(
                requestedAllianceIdsFromQuery ?? Array.from(_allowedAllianceIds),
            ),
            time: graphSliderIndex,
            cityRange: [cityValues[0], cityValues[1]],
            normalizeBits:
                (normalize_x ? 1 : 0) +
                (normalize_y ? 2 : 0) +
                (normalize_z ? 4 : 0),
            aggregationMode: bubbleAggregationMode,
        };
    }

    function syncBubbleStateFromUrl(): void {
        const nextConflictId = ($page.url.searchParams.get("id") ?? "").trim();
        const previousState = buildBubbleQueryState();

        loadQueryParams($page.url.searchParams);

        if (
            nextConflictId.length > 0 &&
            nextConflictId !== previousState.conflictId
        ) {
            conflictId = nextConflictId;
            _loaded = false;
            _loadError = null;
            fetchConflictGraphData(nextConflictId);
            return;
        }

        if (!_rawData) return;

        const nextState = buildBubbleQueryState();
        const metricsChanged = !arrayEquals(
            previousState.selected,
            nextState.selected,
        );
        const idsChanged = !arrayEquals(
            previousState.requestedAllianceIds,
            nextState.requestedAllianceIds,
        );
        const cityChanged =
            previousState.cityRange[0] !== nextState.cityRange[0] ||
            previousState.cityRange[1] !== nextState.cityRange[1];
        const normalizeChanged =
            previousState.normalizeBits !== nextState.normalizeBits;
        const aggregationChanged =
            previousState.aggregationMode !== nextState.aggregationMode;

        if (idsChanged) {
            _allowedAllianceIds = new Set();
        }

        if (
            idsChanged ||
            metricsChanged ||
            cityChanged ||
            normalizeChanged ||
            aggregationChanged
        ) {
            scheduleGraphUpdate();
            return;
        }

        if (previousState.time !== nextState.time) {
            stopBubblePlayback();
            clearBubbleInteractionState();
            setActiveBubbleFrameIndex(nextState.time, {
                persist: false,
                reason: "url-sync",
            });
        }
    }

    function resetFilters() {
        cityValues = [...DEFAULT_CITY_RANGE];
        graphSliderIndex = 0;
        normalize_x = false;
        normalize_y = false;
        normalize_z = false;
        _allowedAllianceIds = new Set();
        requestedAllianceIdsFromQuery = null;
        previous_normalize = 0;
        bubbleAggregationMode = DEFAULT_BUBBLE_AGGREGATION_MODE;
        selected_metrics = [
            "dealt:loss_value",
            "loss:loss_value",
            "off:wars",
        ].map((name) => ({ value: name, label: name }));
        previous_selected = selectedMetricValues();
        bubbleSizeScale = 1;
        resetBubbleView();

        resetQueryParams(
            [
                "city_min",
                "city_max",
                "time",
                "normalize",
                "selected",
                "ids",
                "aggregation",
            ],
            ["id"],
        );
        setQueryParam(
            "selected",
            selected_metrics.map((metric) => metric.value).join("."),
            { replace: true },
        );
        saveCurrentQueryParams();

        if (_rawData) {
            scheduleGraphUpdate();
        }
    }

    function loadQueryParams(params: URLSearchParams) {
        graphSliderIndex = 0;
        cityValues = [...DEFAULT_CITY_RANGE];
        selected_metrics = defaultMetricSelection.map((name) => {
            return { value: name, label: name };
        });
        normalize_x = false;
        normalize_y = false;
        normalize_z = false;
        requestedAllianceIdsFromQuery = null;
        previous_normalize = 0;
        bubbleAggregationMode = DEFAULT_BUBBLE_AGGREGATION_MODE;

        let time = params.get("time");
        if (time && !isNaN(+time) && Number.isInteger(+time)) {
            graphSliderIndex = +time;
        }
        cityValues = parseCityRange(params);
        let selected = params.get("selected");
        if (selected) {
            selected_metrics = selected.split(".").map((name) => {
                return { value: name, label: name };
            });
        }
        previous_selected = selectedMetricValues();
        let normalizeBits = params.get("normalize");
        if (
            normalizeBits &&
            !isNaN(+normalizeBits) &&
            Number.isInteger(+normalizeBits)
        ) {
            let bits = +normalizeBits;
            normalize_x = (bits & 1) != 0;
            normalize_y = (bits & 2) != 0;
            normalize_z = (bits & 4) != 0;
            previous_normalize = bits;
        }

        let idStr = params.get("ids");
        if (idStr) {
            const parsedIds = idStr
                .split(".")
                .map((id) => Math.trunc(Number(id)))
                .filter((id) => Number.isFinite(id) && id > 0);
            requestedAllianceIdsFromQuery =
                parsedIds.length > 0 ? parsedIds : null;
        }

        bubbleAggregationMode = parseBubbleAggregationMode(
            params.get("aggregation"),
        );
    }

    $: bubbleTimelineSliderValues = [graphSliderIndex];
    $: bubbleTimelineSliderTickDescriptors = bubbleTimelineTicks.map((tick) => ({
        value: tick.index,
        label: tick.label,
        percent: tick.percent,
        anchor: tick.anchor,
    }));
    $: bubbleCanvasConfig = bubbleChartModel
        ? {
              ...bubbleChartModel.chartConfig,
              theme: getBubbleCanvasTheme(bubbleIsDarkMode),
          }
        : null;

    $: {
        if (browser && hasBootstrappedUrlState) {
            const nextSearch = $page.url.search;
            if (nextSearch !== lastParsedUrlSearch) {
                lastParsedUrlSearch = nextSearch;
                syncBubbleStateFromUrl();
            }
        }
    }

    onMount(async () => {
        syncBubbleThemeState();
        if (typeof MutationObserver !== "undefined") {
            bubbleThemeObserver = new MutationObserver(() => {
                syncBubbleThemeState();
            });
            bubbleThemeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["data-bs-theme"],
            });
        }

        bootstrapIdRouteLifecycle({
            restoreParams: [
                "city_min",
                "city_max",
                "time",
                "normalize",
                "selected",
                "ids",
                "aggregation",
            ],
            preserveParams: ["id"],
            onBeforeResolve: loadQueryParams,
            onMissingId: () => {
                _loadError = "Missing conflict id in URL";
                _loaded = true;
            },
            onResolvedId: (id) => {
                conflictId = id;
                beginJourneySpan("journey.conflict_to_bubble.routeTransition", {
                    mode: "route-entry",
                    conflictId: id,
                });
                beginJourneySpan("journey.conflict_to_bubble.firstMount", {
                    conflictId: id,
                });
                fetchConflictGraphData(id);
            },
        });
        lastParsedUrlSearch = window.location.search;
        hasBootstrappedUrlState = true;
    });

    onDestroy(() => {
        latestGraphRunId++;
        lastBubbleModelKey = null;
        bubbleThemeObserver?.disconnect();
        bubbleThemeObserver = null;
        clearBubbleChartState();
        bubbleArtifacts?.destroy();
        bubbleArtifacts = null;
    });

    function ensureBubbleArtifacts(nextConflictId: string): BubbleArtifactHandle {
        if (
            bubbleArtifacts &&
            bubbleArtifacts.conflictId === nextConflictId &&
            bubbleArtifacts.version === config.version.graph_data
        ) {
            return bubbleArtifacts;
        }

        bubbleArtifacts?.destroy();
        bubbleArtifacts = acquireBubbleArtifactHandle({
            conflictId: nextConflictId,
            version: config.version.graph_data,
        });
        return bubbleArtifacts;
    }

    function fetchConflictGraphData(conflictId: string) {
        hasCompletedFirstBubbleMount = false;
        stopBubblePlayback();
        clearBubbleChartState();
        _rawData = null;
        fallbackGraphData = null;
        _allowedAllianceIds = new Set();
        lastBubbleModelKey = null;
        beginJourneySpan("journey.conflict_to_bubble.dataFetch", {
            conflictId,
        });
        const artifacts = ensureBubbleArtifacts(conflictId);
        const metrics = buildSelectedBubbleMetrics();
        const activeAggregationMode = bubbleAggregationMode;
        if (!metrics) {
            _loadError = "Select exactly three metrics to render the bubble chart.";
            _loaded = true;
            endJourneySpan("journey.conflict_to_bubble.dataFetch");
            return;
        }
        const runId = ++latestGraphRunId;
        artifacts.bootstrapVisibleTrace({
            cacheKey: getTraceCacheKey(
                metrics,
                cityValues,
                null,
                requestedAllianceIdsFromQuery,
                activeAggregationMode,
            ),
            metrics,
            aggregationMode: activeAggregationMode,
            requestedAllianceIds: requestedAllianceIdsFromQuery,
            cityRange: cityValues,
            contextKey: `bubble:${conflictId}`,
            requestId: runId,
        })
            .then((data) => {
                if (runId !== latestGraphRunId) return;
                if (!data) {
                    clearBubbleChartState();
                    _loadError =
                        "Could not initialize the bubble view. Please retry.";
                    _loaded = true;
                    return;
                }
                conflictName = data.info.name;
                const resolvedAllianceIds = normalizeAllianceIdList(
                    data.selectedAllianceIds,
                );
                const allianceQueryValue = buildBubbleAllianceQueryValue(
                    data.info,
                    resolvedAllianceIds,
                );
                _rawData = data.info;
                _allowedAllianceIds = new Set(resolvedAllianceIds);
                requestedAllianceIdsFromQuery = allianceQueryValue
                    ? resolvedAllianceIds
                    : null;
                fallbackGraphData = data.graphData ?? null;
                datasetProvenance = formatDatasetProvenance(
                    config.version.graph_data,
                    data.info.update_ms,
                );
                _loadError = null;
                setQueryParam("ids", allianceQueryValue, {
                    replace: true,
                });
                applyBubbleTraceResult(
                    data.trace,
                    data.info,
                    metrics,
                    getTraceCacheKey(
                        metrics,
                        cityValues,
                        data.info,
                        resolvedAllianceIds,
                        activeAggregationMode,
                    ),
                    activeAggregationMode,
                );
                _loaded = true;
                endJourneySpan("journey.conflict_to_bubble.routeTransition");
                saveCurrentQueryParams();
                warmBubbleSecondaryArtifacts(conflictId);
            })
            .catch((error) => {
                console.error("Failed to load bubble graph data", error);
                _loadError =
                    "Could not load conflict graph data. Please try again later.";
                clearBubbleChartState();
                _loaded = true;
            })
            .finally(() => {
                endJourneySpan("journey.conflict_to_bubble.dataFetch");
            });
    }

    function retryLoad() {
        if (!conflictId) return;
        _loaded = false;
        _loadError = null;
        fetchConflictGraphData(conflictId);
    }

    function getTraceCacheKey(
        metrics: [TierMetric, TierMetric, TierMetric],
        cityRange: CityRange,
        graphInfo: GraphRouteInfo | null = _rawData,
        selectedAllianceIds: Iterable<number> | null = _allowedAllianceIds,
        aggregationMode: BubbleAggregationMode = bubbleAggregationMode,
    ): string {
        const normalizedSelectedAllianceIds = normalizeAllianceIdList(selectedAllianceIds);
        const allianceIds = graphInfo
            ? buildSelectedAllianceIdsByCoalition(
                graphInfo,
                normalizedSelectedAllianceIds,
            )
            : undefined;
        const defaultAllianceIds = graphInfo
            ? buildDefaultAllianceIdsByCoalition(graphInfo)
            : undefined;
        const allianceKey =
            !graphInfo && normalizedSelectedAllianceIds.length > 0
                ? normalizedSelectedAllianceIds.join(".")
                : !graphInfo
                  ? "all"
                  : undefined;
        return buildBubbleTraceCacheKey({
            conflictId: conflictId ?? "-",
            graphVersion: config.version.graph_data,
            metrics,
            allianceIds,
            defaultAllianceIds,
            allianceKey,
            aggregationMode,
            cityRange,
        });
    }

    function buildSelectedBubbleMetrics(): [TierMetric, TierMetric, TierMetric] | null {
        let metrics_copy = selected_metrics.map((metric) => metric.value);
        if (metrics_copy.length != 3) return null;
        let metric_x: TierMetric = {
            name: metrics_copy[0],
            cumulative: isCumulativeMetricName(metrics_copy[0]),
            normalize: normalize_x,
        };
        let metric_y: TierMetric = {
            name: metrics_copy[1],
            cumulative: isCumulativeMetricName(metrics_copy[1]),
            normalize: normalize_y,
        };
        let metric_size: TierMetric = {
            name: metrics_copy[2],
            cumulative: isCumulativeMetricName(metrics_copy[2]),
            normalize: normalize_z,
        };
        return [metric_x, metric_y, metric_size];
    }

    function applyBubbleTraceResult(
        tracesTime: TraceBuildResult | null,
        graphInfo: GraphRouteInfo,
        metrics: [TierMetric, TierMetric, TierMetric],
        cacheKey: string,
        aggregationMode: BubbleAggregationMode,
    ): void {
        if (!tracesTime) {
            void ensureBubbleControlsPanel();
            return;
        }
        latestTraceBuildResult = tracesTime;
        latestTraceMetrics = metrics;
        latestTraceAggregationMode = aggregationMode;
        let coalition_names = graphInfo.coalitions.map(
            (coalition) => coalition.name,
        );
        const model = buildBubbleCanvasModel({
            traceBuildResult: tracesTime,
            coalitionNames: coalition_names,
            metrics,
        });
        if (!model) {
            void ensureBubbleControlsPanel();
            return;
        }
        updateBubbleChartModel(model, {
            measurePerf: true,
            reason: hasCompletedFirstBubbleMount
                ? "update-model"
                : "initial-model",
        });
        lastBubbleModelKey = cacheKey;
    }

    function scheduleGraphUpdate() {
        stopBubblePlayback();
        clearBubbleInteractionState();
        if (graphUpdateQueued) return;
        graphUpdateQueued = true;
        requestAnimationFrame(() => {
            graphUpdateQueued = false;
            if (_rawData) {
                void setupGraphData();
            }
        });
    }

    function stopBubblePlayback(): void {
        if (bubblePlaybackFrame != null) {
            cancelAnimationFrame(bubblePlaybackFrame);
            bubblePlaybackFrame = null;
        }
        bubblePlaybackLastTimestamp = null;
        isBubblePlaybackActive = false;
    }

    function clearBubbleChartState(): void {
        stopBubblePlayback();
        finishBubbleRenderMeasurement();
        bubbleSizeScale = 1;
        bubbleChartModel = null;
        latestTraceBuildResult = null;
        latestTraceMetrics = null;
        latestTraceAggregationMode = null;
        clearBubbleInteractionState();
        bubbleCanvasRenderResult = null;
        bubbleActiveTimeLabel = "";
        bubbleTimelineTicks = [];
    }

    function formatBubbleNumber(value: number): string {
        if (!Number.isFinite(value)) return "0";
        const abs = Math.abs(value);
        const maximumFractionDigits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
        return value.toLocaleString(undefined, {
            maximumFractionDigits,
        });
    }

    function syncBubbleFrameState(): void {
        if (!bubbleChartModel) {
            bubbleActiveTimeLabel = "";
            bubbleTimelineTicks = [];
            return;
        }

        graphSliderIndex = clampBubbleFrameIndex(
            bubbleChartModel.frames.length,
            graphSliderIndex,
        );
        bubbleActiveTimeLabel =
            bubbleChartModel.frames[graphSliderIndex]?.label ?? "";
        bubbleTimelineTicks = buildBubbleTimelineTicks(
            bubbleChartModel.frames.map((frame) => frame.label ?? ""),
            5,
        );
    }

    function updateBubbleChartModel(
        model: BubbleCanvasModel,
        options?: {
            measurePerf?: boolean;
            reason?: string;
        },
    ): void {
        bubbleChartModel = model;
        clearBubbleInteractionState();
        syncBubbleFrameState();
        bubbleCanvasRenderResult = null;
        if (options?.measurePerf) {
            beginBubbleRenderMeasurement(options.reason ?? "render");
        }
    }

    function persistGraphSliderIndex(replace = true): void {
        setQueryParam("time", graphSliderIndex, { replace });
        saveCurrentQueryParams();
    }

    function setActiveBubbleFrameIndex(
        nextIndex: number,
        options?: {
            persist?: boolean;
            replace?: boolean;
            reason?: string;
        },
    ): void {
        if (!bubbleChartModel) {
            graphSliderIndex = Math.max(0, Math.round(nextIndex));
            if (options?.persist) {
                persistGraphSliderIndex(options.replace ?? true);
            }
            return;
        }

        const clamped = clampBubbleFrameIndex(
            bubbleChartModel.frames.length,
            nextIndex,
        );
        if (clamped === graphSliderIndex) {
            if (options?.persist) {
                persistGraphSliderIndex(options.replace ?? true);
            }
            return;
        }

        graphSliderIndex = clamped;
        clearBubbleInteractionState();
        syncBubbleFrameState();
        if (options?.persist) {
            persistGraphSliderIndex(options.replace ?? true);
        }
        beginBubbleRenderMeasurement(options?.reason ?? "frame-change");
    }

    function runBubblePlaybackFrame(timestamp: number): void {
        if (!bubbleChartModel || bubbleChartModel.frames.length <= 1) {
            stopBubblePlayback();
            return;
        }
        if (bubblePlaybackLastTimestamp == null) {
            bubblePlaybackLastTimestamp = timestamp;
        }

        if (timestamp - bubblePlaybackLastTimestamp >= BUBBLE_PLAYBACK_STEP_MS) {
            bubblePlaybackLastTimestamp = timestamp;
            const nextIndex = graphSliderIndex + 1;
            if (nextIndex >= bubbleChartModel.frames.length) {
                stopBubblePlayback();
                return;
            }
            setActiveBubbleFrameIndex(nextIndex, {
                persist: true,
                replace: true,
                reason: "playback",
            });
        }

        bubblePlaybackFrame = requestAnimationFrame(runBubblePlaybackFrame);
    }

    function toggleBubblePlayback(): void {
        if (!bubbleChartModel || bubbleChartModel.frames.length <= 1) return;
        if (isBubblePlaybackActive) {
            stopBubblePlayback();
            return;
        }

        if (graphSliderIndex >= bubbleChartModel.frames.length - 1) {
            setActiveBubbleFrameIndex(0, {
                persist: true,
                replace: true,
                reason: "playback-reset",
            });
        }

        isBubblePlaybackActive = true;
        bubblePlaybackLastTimestamp = null;
        bubblePlaybackFrame = requestAnimationFrame(runBubblePlaybackFrame);
    }

    function previewBubbleTimelineValues(nextValues: number[]): void {
        stopBubblePlayback();
        const nextIndex = Number(nextValues[0] ?? graphSliderIndex);
        setActiveBubbleFrameIndex(nextIndex, {
            persist: false,
            reason: "time-slider-preview",
        });
    }

    function commitBubbleTimelineValues(nextValues: number[]): void {
        stopBubblePlayback();
        const nextIndex = Number(nextValues[0] ?? graphSliderIndex);
        setActiveBubbleFrameIndex(nextIndex, {
            persist: true,
            replace: true,
            reason: "time-slider",
        });
    }

    function handleBubbleCanvasHover(
        event: CustomEvent<BubbleChartPointerEventDetail>,
    ): void {
        const { point, pointer } =
            event.detail as BubbleChartPointerEventDetail<BubbleCanvasPointMeta>;
        bubbleHoverPoint = point;
        bubbleTooltipAnchor =
            point && bubbleCanvasRenderResult
                ? resolveBubbleTooltipAnchor(pointer, bubbleCanvasRenderResult)
                : null;
    }

    function handleBubbleCanvasFrameRendered(
        event: CustomEvent,
    ): void {
        bubbleCanvasRenderResult =
            event.detail as BubbleCanvasRenderResult;
        finishBubbleRenderMeasurement();
        void ensureBubbleControlsPanel();
        if (!hasCompletedFirstBubbleMount) {
            hasCompletedFirstBubbleMount = true;
            endJourneySpan("journey.conflict_to_bubble.firstMount");
        }
    }

    async function setupGraphData() {
        if (!_rawData) return;
        const runId = ++latestGraphRunId;
        const metrics = buildSelectedBubbleMetrics();
        const activeAggregationMode = bubbleAggregationMode;
        if (!metrics) return;
        if (_allowedAllianceIds.size === 0) {
            _allowedAllianceIds = resolveInitialAllowedAllianceIds(
                _rawData,
                requestedAllianceIdsFromQuery,
            );
        }
        const selectedAllianceIds = normalizeAllianceIdList(
            Array.from(_allowedAllianceIds),
        );
        const cacheKey = getTraceCacheKey(
            metrics,
            cityValues,
            _rawData,
            selectedAllianceIds,
        );
        if (cacheKey === lastBubbleModelKey && bubbleChartModel) {
            incrementPerfCounter("graph.bubble.renderSkipped", 1, {
                reason: "unchanged-trace-key",
            });
            syncBubbleFrameState();
            return;
        }
        const artifacts = bubbleArtifacts;
        const finishComputeSpan = startPerfSpan(
            "journey.conflict_to_bubble.graphCompute",
            { workerAvailable: !!artifacts?.hasWorker() },
        );
        const tracesTime = await (artifacts
            ? artifacts.getTrace({
                cacheKey,
                metrics,
                aggregationMode: activeAggregationMode,
                selectedAllianceIds,
                cityRange: cityValues,
                graphData: fallbackGraphData ?? undefined,
                contextKey: `bubble:${conflictId ?? "unknown"}`,
                requestId: runId,
            })
            : fallbackGraphData
              ? Promise.resolve(
                generateTraces(
                    fallbackGraphData,
                    metrics[0],
                    metrics[1],
                    metrics[2],
                    cityValues,
                    selectedAllianceIds,
                    activeAggregationMode,
                ),
            )
              : Promise.resolve(null)).finally(() => {
                finishComputeSpan();
            });
        if (runId !== latestGraphRunId) return;
        applyBubbleTraceResult(
            tracesTime,
            _rawData,
            metrics,
            cacheKey,
            activeAggregationMode,
        );
    }

    function buildBubbleExportBundle(): ExportBundle | null {
        if (!_rawData || !latestTraceBuildResult || !latestTraceMetrics) {
            return null;
        }

        const { traces, times } = latestTraceBuildResult;
        const exportAggregationMode =
            latestTraceAggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE;
        const coalitionNames = _rawData.coalitions.map((c) => c.name);
        const keys = Object.keys(traces)
            .map(Number)
            .sort((a, b) => a - b);
        if (keys.length === 0) return null;

        const frameIndex = Math.max(
            0,
            Math.min(graphSliderIndex, Math.max(keys.length - 1, 0)),
        );
        const activeTime = keys[frameIndex];
        const frameByCoalition = traces[activeTime] ?? {};
        const timeFormat = times.is_turn ? formatTurnsToDate : formatDaysToDate;

        const frameRows: (string | number)[][] = [];
        for (const [coalitionIdStr, trace] of Object.entries(
            frameByCoalition,
        )) {
            const coalitionId = Number(coalitionIdStr);
            for (let i = 0; i < trace.id.length; i++) {
                const seriesLabel = trace.text[i] ?? `AA:${trace.id[i]}`;
                frameRows.push([
                    coalitionNames[coalitionId] ??
                        `Coalition ${coalitionId + 1}`,
                    exportAggregationMode === "coalition"
                        ? `${seriesLabel} (aggregated)`
                        : seriesLabel,
                    trace.id[i],
                    activeTime,
                    timeFormat(activeTime),
                    trace.x[i] ?? 0,
                    trace.y[i] ?? 0,
                    trace.customdata[i] ?? 0,
                ]);
            }
        }

        const timelineRows: (string | number)[][] = [];
        for (const time of keys) {
            const rowByCoalition = traces[time] ?? {};
            for (const [coalitionIdStr, trace] of Object.entries(
                rowByCoalition,
            )) {
                const coalitionId = Number(coalitionIdStr);
                for (let i = 0; i < trace.id.length; i++) {
                    const seriesLabel = trace.text[i] ?? `AA:${trace.id[i]}`;
                    timelineRows.push([
                        coalitionNames[coalitionId] ??
                            `Coalition ${coalitionId + 1}`,
                        exportAggregationMode === "coalition"
                            ? `${seriesLabel} (aggregated)`
                            : seriesLabel,
                        trace.id[i],
                        time,
                        timeFormat(time),
                        trace.x[i] ?? 0,
                        trace.y[i] ?? 0,
                        trace.customdata[i] ?? 0,
                    ]);
                }
            }
        }

        const settingsRows = buildSettingsRows([
            ["conflict_id", conflictId ?? ""],
            ["conflict_name", conflictName ?? ""],
            ["selected_metrics", selected_metrics.map((m) => m.value)],
            ["selected_alliance_count", _allowedAllianceIds.size],
            ["selected_alliance_ids", Array.from(_allowedAllianceIds)],
            ["aggregation_mode", exportAggregationMode],
            ["city_min", cityValues[0]],
            ["city_max", cityValues[1]],
            ["normalize_x", normalize_x ? 1 : 0],
            ["normalize_y", normalize_y ? 1 : 0],
            ["normalize_z", normalize_z ? 1 : 0],
            ["time_index", frameIndex],
            ["time_value", activeTime],
            ["time_label", timeFormat(activeTime)],
        ]);

        return {
            baseFileName: `conflict-${conflictId ?? "conflict"}-bubble`,
            meta: {
                conflictId,
                conflictName,
                selectedMetrics: latestTraceMetrics,
                selectedAllianceIds: Array.from(_allowedAllianceIds),
                cityRange: cityValues,
                normalize: {
                    x: normalize_x,
                    y: normalize_y,
                    z: normalize_z,
                },
                aggregationMode: exportAggregationMode,
                activeTime,
                activeTimeLabel: timeFormat(activeTime),
                isTurn: times.is_turn,
            },
            tables: [
                {
                    key: "frame",
                    label: "Current time frame points",
                    columns: bubblePointExportColumns,
                    rows: frameRows,
                },
                {
                    key: "timeline",
                    label: "Full timeline points",
                    columns: bubblePointExportColumns,
                    rows: timelineRows,
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

    function handleBubbleExport(action: ExportMenuAction): void {
        const bundle = buildBubbleExportBundle();
        if (!bundle) return;
        exportBundleData({
            bundle,
            datasetKey: action.datasetKey,
            format: action.format,
            target: action.target,
        });
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
                    { label: "Bubble" },
                ]}
            />
            <span class="ux-page-title-main">Conflict: {conflictName}</span>
        </div>
        {#if _rawData?.wiki}
            <a
                class="btn ux-btn fw-bold"
                href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
                >Wiki:{_rawData.wiki}<Icon
                    name="externalLink"
                    className="ux-icon-inline"
                /></a
            >
        {/if}
    </h1>
    <ConflictRouteTabs {conflictId} active="bubble" routeKind="single" />
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
        <div class="col-12 ux-compact-controls px-2 pt-2 pb-2">
            <div class="ux-graph-control-launcher" class:bubble-city-slider={_rawData !== null}>
                {#if _rawData && bubbleControlsPanelPromise}
                    {#await bubbleControlsPanelPromise}
                        <div
                            class="ux-graph-controls-loading small ux-muted"
                            role="status"
                            aria-live="polite"
                        >
                            <strong>Loading controls…</strong>
                        </div>
                    {:then BubbleControlsPanel}
                        <svelte:component
                            this={BubbleControlsPanel}
                            rawData={_rawData}
                            {items}
                            selectedMetrics={selected_metrics}
                            cityRange={cityValues}
                            normalizeX={normalize_x}
                            normalizeY={normalize_y}
                            normalizeZ={normalize_z}
                            aggregationByCoalition={
                                bubbleAggregationMode === "coalition"
                            }
                            allowedAllianceIds={Array.from(_allowedAllianceIds)}
                            selectedExportDatasetKey={selectedBubbleExportDataset}
                            exportDatasets={bubbleExportDatasets}
                            {isResetDirty}
                            onSelectedMetricsCommit={handleBubbleMetricsCommit}
                            onCityRangeCommit={handleBubbleCityRangeCommit}
                            onNormalizeCommit={commitNormalizeChange}
                            onAggregationByCoalitionCommit={
                                handleBubbleAggregationByCoalitionCommit
                            }
                            onAllowedAllianceIdsCommit={handleBubbleAllianceIdsCommit}
                            onSelectedExportDatasetKeyChange={handleBubbleExportDatasetKeyChange}
                            onExport={handleBubbleExport}
                            onReset={resetFilters}
                        />
                    {:catch}
                        <div
                            class="ux-graph-controls-loading small ux-muted"
                            role="status"
                            aria-live="polite"
                        >
                            <strong>Controls unavailable.</strong>
                        </div>
                    {/await}
                {:else if _rawData}
                    <div
                        class="ux-graph-controls-loading small ux-muted"
                        role="status"
                        aria-live="polite"
                    >
                        <strong>Loading controls…</strong>
                    </div>
                {:else}
                    <div
                        class="ux-graph-controls-loading small ux-muted"
                        role="status"
                        aria-live="polite"
                    >
                        <strong>Loading controls…</strong>
                    </div>
                {/if}
            </div>
        </div>
    </div>
    <div
        class="row m-0 p-0 mt-2 ux-surface"
        style="overflow-x: hidden; position: relative; z-index: 1;"
    >
        <div class="col-12 m-0 p-0">
            <div class="bubble-timeline-controls bubble-timeline-shell ux-control-strip mx-2 mt-2">
                {#if bubbleChartModel}
                    <div class="bubble-timeline-buttons">
                        <button
                            type="button"
                            class="btn btn-sm ux-btn bubble-timeline-button"
                            on:click={toggleBubblePlayback}
                            disabled={bubbleChartModel.frames.length <= 1}
                        >
                            {isBubblePlaybackActive ? "Pause" : "Play"}
                        </button>
                    </div>
                    <div class="bubble-timeline-meta">
                        <div class="bubble-timeline-status" aria-live="polite">
                            <strong class="bubble-timeline-status-date">
                                {bubbleActiveTimeLabel}
                            </strong>
                            {#if bubbleChartModel.frames.length > 1}
                                <span
                                    class="bubble-timeline-status-count"
                                    aria-label={`Frame ${graphSliderIndex + 1} of ${bubbleChartModel.frames.length}`}
                                >
                                    {graphSliderIndex + 1}/{bubbleChartModel.frames.length}
                                </span>
                            {/if}
                        </div>
                        <div class="bubble-timeline-slider-wrap">
                            <GraphSlider
                                min={0}
                                max={Math.max(bubbleChartModel.frames.length - 1, 0)}
                                step={1}
                                values={bubbleTimelineSliderValues}
                                ticks={bubbleTimelineSliderTickDescriptors}
                                formatValue={(value) =>
                                    bubbleChartModel?.frames[Math.round(value)]?.label ??
                                    bubbleActiveTimeLabel}
                                showSelectionSummary={false}
                                ariaLabel="Bubble chart time frame"
                                onValuesInput={previewBubbleTimelineValues}
                                onValuesCommit={commitBubbleTimelineValues}
                                disabled={bubbleChartModel.frames.length <= 1}
                            />
                        </div>
                    </div>
                {:else}
                    <div class="bubble-timeline-buttons">
                        <button
                            type="button"
                            class="btn btn-sm ux-btn bubble-timeline-button"
                            disabled
                        >
                            Play
                        </button>
                    </div>
                    <div class="bubble-timeline-meta">
                        <div class="bubble-timeline-status" aria-live="polite">
                            <strong class="bubble-timeline-status-date">
                                {_loadError ? "Timeline unavailable" : "Loading timeline…"}
                            </strong>
                            <span class="bubble-timeline-status-count">
                                {_loaded ? "Awaiting data" : "Preparing"}
                            </span>
                        </div>
                        <div
                            class="bubble-timeline-loading-bar"
                            aria-hidden="true"
                        ></div>
                    </div>
                {/if}
            </div>
            <div class="bubble-chart-container">
                {#if bubbleChartModel && bubbleCanvasConfig}
                    <div class="bubble-chart-toolbar ux-control-strip">
                        <div class="bubble-chart-toolbar-scale">
                            <label for="bubbleSizeScale" class="bubble-chart-toolbar-label">
                                Bubble size
                            </label>
                            <input
                                id="bubbleSizeScale"
                                class="bubble-chart-toolbar-range"
                                type="range"
                                min="50"
                                max="200"
                                step="5"
                                value={Math.round(bubbleSizeScale * 100)}
                                on:input={handleBubbleSizeScaleInput}
                                disabled={!bubbleChartModel}
                                aria-label="Bubble size scale"
                            />
                            <output class="bubble-chart-toolbar-value" for="bubbleSizeScale">
                                {Math.round(bubbleSizeScale * 100)}%
                            </output>
                        </div>

                        <div class="bubble-chart-toolbar-actions">
                            <span class="bubble-chart-toolbar-hint">
                                Wheel to zoom • drag to pan • double-click to reset
                            </span>

                            <button
                                type="button"
                                class="btn btn-sm ux-btn"
                                on:click={resetBubbleView}
                                disabled={!bubbleChartModel}
                            >
                                Reset view
                            </button>

                            <button
                                type="button"
                                class="btn btn-sm ux-btn"
                                on:click={downloadBubblePng}
                                disabled={!bubbleChartModel}
                            >
                                Download PNG
                            </button>
                        </div>
                    </div>
                {/if}
                <div class="bubble-chart-stage">
                    {#if bubbleChartModel && bubbleCanvasConfig}
                        <BubbleCanvas
                            bind:this={bubbleCanvasRef}
                            model={bubbleChartModel.chartModel}
                            frameIndex={graphSliderIndex}
                            config={bubbleCanvasConfig}
                            sizeMultiplier={bubbleSizeScale}
                            ariaLabel="Conflict bubble chart"
                            height="clamp(360px, 66vh, 720px)"
                            on:hover={handleBubbleCanvasHover}
                            on:frameRendered={handleBubbleCanvasFrameRendered}
                        />
                    {:else}
                        <div
                            class="bubble-chart-loading"
                            role="status"
                            aria-live="polite"
                        >
                            <strong>
                                {_loadError
                                    ? "Bubble chart unavailable. Try refreshing the page."
                                    : "Loading alliance data…"}
                            </strong>
                        </div>
                    {/if}
                    {#if bubbleHoverPoint && bubbleTooltipAnchor}
                        <div
                            class="bubble-chart-tooltip"
                            class:is-flip-x={bubbleTooltipAnchor.flipX}
                            class:is-flip-y={bubbleTooltipAnchor.flipY}
                            style={`left:${bubbleTooltipAnchor.x}px;top:${bubbleTooltipAnchor.y}px;--bubble-tooltip-accent:${bubbleHoverPoint.color};`}
                        >
                            <div class="bubble-chart-tooltip-title">
                                {bubbleHoverPoint.label}
                            </div>
                            <div class="bubble-chart-tooltip-subtitle">
                                {bubbleHoverPoint.meta?.coalitionName ?? "Coalition"} • {bubbleHoverPoint.frameLabel}
                            </div>
                            <div class="bubble-chart-tooltip-row">
                                <span>{bubbleChartModel?.xLabel ?? "X"}</span>
                                <strong>{formatBubbleNumber(bubbleHoverPoint.xValue)}</strong>
                            </div>
                            <div class="bubble-chart-tooltip-row">
                                <span>{bubbleChartModel?.yLabel ?? "Y"}</span>
                                <strong>{formatBubbleNumber(bubbleHoverPoint.yValue)}</strong>
                            </div>
                            <div class="bubble-chart-tooltip-row">
                                <span>{bubbleChartModel?.sizeLabel ?? "Size"}</span>
                                <strong>{formatBubbleNumber(bubbleHoverPoint.sizeValue)}</strong>
                            </div>
                        </div>
                    {/if}
                </div>
                {#if bubbleChartModel?.legendItems.length}
                    <div class="bubble-chart-legend" aria-label="Coalition colors">
                        {#each bubbleChartModel.legendItems as item (item.label)}
                            <span class="bubble-chart-legend-item">
                                <span
                                    class="bubble-chart-legend-swatch"
                                    style={`background:${item.color};`}
                                ></span>
                                <span>{item.label}</span>
                            </span>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>

<style>
    .ux-graph-control-launcher {
        min-height: 2.5rem;
    }

    .ux-graph-controls-loading {
        min-height: 5.2rem;
        display: grid;
        align-content: center;
        gap: 0.22rem;
        padding: 0.35rem 0.1rem;
    }

    .bubble-timeline-controls {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: 0.5rem;
    }

    .bubble-timeline-shell {
        min-height: 4.25rem;
    }

    .bubble-timeline-buttons {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.18rem;
        padding-top: 0.14rem;
    }

    .bubble-timeline-button {
        min-width: 3.15rem;
        min-height: 1.42rem;
        padding: 0.06rem 0.48rem !important;
        font-size: 0.74rem !important;
        font-weight: 600 !important;
    }

    .bubble-timeline-meta {
        min-width: 0;
        display: grid;
        gap: 0.34rem;
    }

    .bubble-timeline-status {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .bubble-timeline-status-date {
        color: rgba(15, 23, 42, 0.96);
        font-size: 0.84rem;
        font-weight: 700;
        line-height: 1.1;
    }

    .bubble-timeline-status-count {
        color: rgba(71, 85, 105, 0.88);
        font-size: 0.67rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        white-space: nowrap;
    }

    .bubble-timeline-slider-wrap {
        min-width: 0;
        position: relative;
    }

    .bubble-timeline-loading-bar {
        position: relative;
        height: 0.68rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--ux-border) 86%, transparent);
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--ux-surface-alt) 92%, transparent),
            color-mix(in srgb, rgba(148, 163, 184, 0.22) 72%, var(--ux-surface))
        );
        overflow: hidden;
    }

    .bubble-timeline-loading-bar::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.58),
            transparent
        );
        transform: translateX(-100%);
        animation: bubble-sheen 1.55s ease-in-out infinite;
    }

    .bubble-chart-container {
        min-height: min(68vh, 760px);
        padding: 0.25rem 0.5rem 0.6rem;
        display: grid;
        gap: 0.8rem;
    }

    .bubble-chart-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .bubble-chart-toolbar-scale {
        min-width: min(100%, 22rem);
        display: flex;
        align-items: center;
        gap: 0.55rem;
        flex: 1 1 18rem;
    }

    .bubble-chart-toolbar-label {
        font-size: 0.72rem;
        font-weight: 700;
        white-space: nowrap;
    }

    .bubble-chart-toolbar-range {
        flex: 1 1 14rem;
        min-width: 8rem;
    }

    .bubble-chart-toolbar-value {
        min-width: 3.25rem;
        text-align: right;
        font-size: 0.72rem;
        font-weight: 700;
    }

    .bubble-chart-toolbar-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .bubble-chart-toolbar-hint {
        font-size: 0.68rem;
        color: rgba(71, 85, 105, 0.88);
    }

    .bubble-chart-stage {
        position: relative;
        overflow: visible;
        min-height: clamp(360px, 66vh, 720px);
        border: 1px solid color-mix(in srgb, var(--ux-border) 88%, transparent);
        border-radius: 12px;
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--ux-surface) 98%, transparent),
            color-mix(in srgb, rgba(148, 163, 184, 0.06) 76%, var(--ux-surface))
        );
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
    }

    .bubble-chart-loading {
        min-height: clamp(360px, 66vh, 720px);
        display: grid;
        align-content: center;
        justify-items: start;
        gap: 0.34rem;
        padding: 1rem 1.1rem;
    }

    :global(.bubble-chart-stage > [role="img"]) {
        width: 100%;
    }

    :global(.bubble-chart-stage canvas) {
        display: block;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        touch-action: none;
    }

    .bubble-chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.38rem;
    }

    .bubble-chart-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.24rem 0.48rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 88%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--ux-surface-alt) 78%, transparent);
        color: var(--ux-text);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1;
    }

    .bubble-chart-legend-swatch {
        width: 0.62rem;
        height: 0.62rem;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.14);
    }

    :global(html[data-bs-theme="dark"]) .bubble-timeline-status-date {
        color: rgba(241, 245, 249, 0.96);
    }

    :global(html[data-bs-theme="dark"]) .bubble-timeline-status-count {
        color: rgba(203, 213, 225, 0.84);
    }

    :global(html[data-bs-theme="dark"]) .bubble-timeline-loading-bar {
        border-color: rgba(148, 163, 184, 0.28);
        background: linear-gradient(
            90deg,
            rgba(30, 41, 59, 0.96),
            rgba(51, 65, 85, 0.84)
        );
    }

    :global(html[data-bs-theme="dark"]) .bubble-chart-stage,
    :global(html[data-bs-theme="dark"]) .bubble-chart-legend-item {
        border-color: rgba(148, 163, 184, 0.26);
        background: linear-gradient(
            180deg,
            rgba(15, 23, 42, 0.98),
            rgba(30, 41, 59, 0.9)
        );
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }

    :global(html[data-bs-theme="dark"]) .bubble-chart-toolbar-hint {
        color: rgba(203, 213, 225, 0.84);
    }

    :global(html[data-bs-theme="dark"]) .bubble-chart-legend-swatch {
        border-color: rgba(226, 232, 240, 0.18);
    }

    .bubble-chart-tooltip {
        position: absolute;
        transform: translate(12px, calc(-100% - 12px));
        max-width: min(16rem, calc(100vw - 1.5rem));
        padding: 0.42rem 0.52rem;
        border-radius: 6px;
        border: 1px solid var(--bubble-tooltip-accent, rgba(148, 163, 184, 0.5));
        background: rgba(15, 23, 42, 0.96);
        color: rgb(248, 250, 252);
        pointer-events: none;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
        z-index: 2;
    }

    .bubble-chart-tooltip.is-flip-x {
        transform: translate(calc(-100% - 12px), calc(-100% - 12px));
    }

    .bubble-chart-tooltip.is-flip-y {
        transform: translate(12px, 12px);
    }

    .bubble-chart-tooltip.is-flip-x.is-flip-y {
        transform: translate(calc(-100% - 12px), 12px);
    }

    .bubble-chart-tooltip-title {
        font-weight: 600;
        font-size: 0.76rem;
        line-height: 1.2;
    }

    .bubble-chart-tooltip-subtitle {
        color: rgba(226, 232, 240, 0.84);
        font-size: 0.67rem;
        margin-top: 0.08rem;
        margin-bottom: 0.35rem;
    }

    .bubble-chart-tooltip-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.7rem;
        font-size: 0.71rem;
    }

    .bubble-chart-tooltip-row + .bubble-chart-tooltip-row {
        margin-top: 0.14rem;
    }

    @keyframes bubble-sheen {
        0% {
            transform: translateX(-100%);
        }

        100% {
            transform: translateX(100%);
        }
    }

    @media (max-width: 768px) {
        .bubble-chart-toolbar-actions {
            justify-content: flex-start;
        }

        .bubble-timeline-controls {
            grid-template-columns: 1fr;
            gap: 0.4rem;
        }

        .bubble-timeline-slider-wrap {
            min-width: 0;
        }

        .bubble-chart-container {
            min-height: 420px;
            padding-inline: 0.5rem;
        }

        .bubble-chart-toolbar-hint {
            flex-basis: 100%;
        }

        .bubble-chart-tooltip {
            max-width: min(14rem, calc(100vw - 1rem));
        }
    }
</style>
