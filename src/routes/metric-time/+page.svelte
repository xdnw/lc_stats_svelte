<script lang="ts">
    import "../../styles/conflict-shell.css";
    import "../../styles/conflict-widgets.css";
    import { browser } from "$app/environment";
    import { base } from "$app/paths";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import Icon from "../../components/Icon.svelte";
    import MetricTimeCanvas from "../../components/MetricTimeCanvas.svelte";
    import Progress from "../../components/Progress.svelte";
    import { appConfig as config } from "$lib/appConfig";
    import {
        acquireMetricTimeArtifactHandle,
        type MetricTimeArtifactHandle,
    } from "$lib/metricTimeArtifactRegistry";
    import {
        buildCityRangeQuery,
        DEFAULT_CITY_RANGE,
        isDefaultCityRange,
        normalizeCityRange,
        parseCityRange,
        type CityRange,
    } from "$lib/cityRange";
    import { arrayEquals } from "$lib/misc";
    import {
        buildMetricTimeCanvasModel,
        formatMetricTimeMetricLabel,
        type MetricTimeCanvasModel,
        type MetricTimeHoverDatum,
    } from "$lib/metricTimeCanvas";
    import type { MetricTimeSeriesResult } from "$lib/metricTimeCompute";
    import { buildMetricTimeSeriesCacheKey, buildDefaultTieringAllianceIds, buildSelectedAllianceIdsByCoalition } from "$lib/graphArtifactKeys";
    import {
        resolveMetricTimeAllowedAllianceIds,
        type GraphRouteInfo,
    } from "$lib/graphRouteInfo";
    import { formatDaysToDate, formatTurnsToDate } from "$lib/formatting";
    import {
        buildRequestedMetricTimeMetric,
        resolveDefaultMetricTimeName,
        resolveRequestedMetricTimeMetric,
    } from "$lib/metricTimeDefaults";
    import { isCumulativeMetricName } from "$lib/metrics";
    import { beginJourneySpan, endJourneySpan, startPerfSpan } from "$lib/perf";
    import { bootstrapIdRouteLifecycle } from "$lib/routeBootstrap";
    import { formatDatasetProvenance } from "$lib/runtime";
    import { saveCurrentQueryParams } from "$lib/queryStorage";
    import { setQueryParam } from "$lib/queryState";
    import {
        type BubbleAggregationMode,
    } from "$lib/bubbleAggregation";
    import type { GraphData, TierMetric } from "$lib/types";
    import {
        DEFAULT_METRIC_TIME_AGGREGATION_MODE,
        parseMetricTimeAggregationMode,
    } from "$lib/metricTimeDefaults";

    type MetricOption = {
        value: string;
        label: string;
    };

    type MetricTimeTooltipAnchor = {
        x: number;
        y: number;
        flipX: boolean;
        flipY: boolean;
    };

    type MetricTimeQueryState = {
        conflictId: string | null;
        metricName: string | null;
        cityRange: CityRange;
        cumulative: boolean;
        aggregationMode: BubbleAggregationMode;
        requestedAllianceIds: number[];
    };

    type MetricTimeControlsPanelComponent =
        typeof import("../../components/MetricTimeControlsPanel.svelte").default;

    let conflictId: string | null = null;
    let conflictName = "";
    let graphInfo: GraphRouteInfo | null = null;
    let fallbackGraphData: GraphData | null = null;
    let metricTimeArtifacts: MetricTimeArtifactHandle | null = null;
    let requestedAllianceIdsFromQuery: number[] | null = null;
    let allowedAllianceIds = new Set<number>();
    let selectedMetric: MetricOption | null = null;
    let cityRange: CityRange = [...DEFAULT_CITY_RANGE];
    let cumulative = false;
    let aggregationMode: BubbleAggregationMode =
        DEFAULT_METRIC_TIME_AGGREGATION_MODE;
    let datasetProvenance = "";
    let loaded = false;
    let loadError: string | null = null;
    let latestRequestId = 0;
    let metricTimeCanvasModel: MetricTimeCanvasModel | null = null;
    let metricTimeControlsPanelPromise: Promise<MetricTimeControlsPanelComponent> | null = null;
    let metricTimeHoverDatum: MetricTimeHoverDatum | null = null;
    let metricTimeTooltipAnchor: MetricTimeTooltipAnchor | null = null;
    let hasBootstrappedUrlState = false;
    let lastParsedUrlSearch = "";
    let hasCompletedFirstMetricTimeMount = false;

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

    function parseRequestedAllianceIds(
        value: string | null,
    ): number[] | null {
        const normalized = normalizeAllianceIdList(
            `${value ?? ""}`
                .split(".")
                .map((entry) => Number.parseInt(entry, 10))
                .filter((entry) => Number.isFinite(entry)),
        );
        return normalized.length > 0 ? normalized : null;
    }

    function buildMetricOption(metricName: string): MetricOption {
        return {
            value: metricName,
            label: metricName,
        };
    }

    function buildMetricTimeTooltipAnchor(
        datum: MetricTimeHoverDatum | null,
        width: number,
        height: number,
    ): MetricTimeTooltipAnchor | null {
        if (!datum) return null;
        return {
            x: datum.canvasX,
            y: datum.canvasY,
            flipX: datum.canvasX > width - 220,
            flipY: datum.canvasY < Math.min(84, Math.max(48, height * 0.22)),
        };
    }

    function buildMetricTimeQueryState(): MetricTimeQueryState {
        return {
            conflictId,
            metricName: selectedMetric?.value ?? null,
            cityRange: [cityRange[0], cityRange[1]],
            cumulative,
            aggregationMode,
            requestedAllianceIds: normalizeAllianceIdList(
                requestedAllianceIdsFromQuery ?? Array.from(allowedAllianceIds),
            ),
        };
    }

    function ensureMetricTimeControlsPanel(): Promise<MetricTimeControlsPanelComponent> {
        if (metricTimeControlsPanelPromise) {
            return metricTimeControlsPanelPromise;
        }

        metricTimeControlsPanelPromise = import(
            "../../components/MetricTimeControlsPanel.svelte"
        ).then((module) => module.default);
        return metricTimeControlsPanelPromise;
    }

    function buildCumulativeQueryValue(
        metricName: string,
        enabled: boolean,
    ): string | null {
        const defaultEnabled = isCumulativeMetricName(metricName);
        return enabled === defaultEnabled ? null : enabled ? "1" : "0";
    }

    function buildAllianceQueryValue(
        info: GraphRouteInfo | null,
        ids: Iterable<number>,
    ): string | null {
        const normalizedIds = normalizeAllianceIdList(ids);
        if (normalizedIds.length === 0) return null;
        if (!info) {
            return normalizedIds.join(".");
        }

        const defaultIds = normalizeAllianceIdList(
            buildDefaultTieringAllianceIds(info).flat(),
        );
        return arrayEquals(normalizedIds, defaultIds)
            ? null
            : normalizedIds.join(".");
    }

    function formatMetricTimeNumber(value: number): string {
        if (!Number.isFinite(value)) return "0";
        const abs = Math.abs(value);
        const maximumFractionDigits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
        return value.toLocaleString(undefined, {
            maximumFractionDigits,
        });
    }

    function formatMetricTimeLabel(time: number, isTurn: boolean): string {
        return isTurn ? formatTurnsToDate(time) : formatDaysToDate(time);
    }

    function clearMetricTimeInteractionState(): void {
        metricTimeHoverDatum = null;
        metricTimeTooltipAnchor = null;
    }

    function currentMetric(): TierMetric | null {
        if (!selectedMetric) return null;
        return {
            name: selectedMetric.value,
            cumulative,
            normalize: false,
        };
    }

    function currentAllianceIds(): number[] {
        return normalizeAllianceIdList(Array.from(allowedAllianceIds));
    }

    function currentSeriesCacheKey(): string | null {
        const metric = currentMetric();
        if (!graphInfo || !conflictId || !metric) return null;

        return buildMetricTimeSeriesCacheKey({
            conflictId,
            graphVersion: config.version.graph_data,
            metric,
            allianceIds: buildSelectedAllianceIdsByCoalition(
                graphInfo,
                currentAllianceIds(),
            ),
            defaultAllianceIds: buildDefaultTieringAllianceIds(graphInfo),
            aggregationMode,
            cityRange,
        });
    }

    function applyUrlStateFromInfo(
        query: URLSearchParams,
        info: GraphRouteInfo,
    ): void {
        const resolvedMetric = resolveRequestedMetricTimeMetric(
            info,
            buildRequestedMetricTimeMetric({
                metricName: query.get("metric"),
                cumulativeValue: query.get("cumulative"),
            }),
        );
        const nextRequestedAllianceIds = parseRequestedAllianceIds(query.get("ids"));
        selectedMetric = buildMetricOption(resolvedMetric.name);
        cityRange = parseCityRange(query);
        cumulative = resolvedMetric.cumulative;
        aggregationMode = parseMetricTimeAggregationMode(query.get("aggregation"));
        allowedAllianceIds = resolveMetricTimeAllowedAllianceIds(
            info,
            nextRequestedAllianceIds,
        );
        requestedAllianceIdsFromQuery = buildAllianceQueryValue(
            info,
            allowedAllianceIds,
        )
            ? normalizeAllianceIdList(Array.from(allowedAllianceIds))
            : null;
    }

    function applyMetricTimeSeries(
        series: MetricTimeSeriesResult | null,
    ): void {
        metricTimeCanvasModel = buildMetricTimeCanvasModel(series);
        clearMetricTimeInteractionState();
        loaded = true;
        loadError = series
            ? null
            : "Metric timeline unavailable for the current selection.";
        if (!series && graphInfo) {
            void ensureMetricTimeControlsPanel();
        }
    }

    async function refreshMetricTimeSeries(options?: {
        graphData?: GraphData | null;
        requestId?: number;
    }): Promise<void> {
        if (!graphInfo || !metricTimeArtifacts || !selectedMetric || !conflictId) {
            return;
        }

        const requestId = options?.requestId ?? ++latestRequestId;
        const metric = currentMetric();
        const cacheKey = currentSeriesCacheKey();
        if (!metric || !cacheKey) return;

        const finishComputeSpan = startPerfSpan("journey.conflict_to_metric_time.graphCompute", {
            workerAvailable: !!metricTimeArtifacts?.hasWorker(),
        });
        const series = await metricTimeArtifacts
            .getSeries({
                cacheKey,
                metric,
                aggregationMode,
                selectedAllianceIds: currentAllianceIds(),
                cityRange,
                graphData: options?.graphData ?? fallbackGraphData ?? undefined,
                contextKey: `metric-time:${conflictId}`,
                requestId,
            })
            .finally(() => {
                finishComputeSpan();
            });
        if (requestId !== latestRequestId) return;

        applyMetricTimeSeries(series);
    }

    async function fetchMetricTimeData(nextConflictId: string): Promise<void> {
        latestRequestId += 1;
        const requestId = latestRequestId;
        hasCompletedFirstMetricTimeMount = false;
        loaded = false;
        loadError = null;
        conflictId = nextConflictId;
        conflictName = "";
        graphInfo = null;
        fallbackGraphData = null;
        metricTimeCanvasModel = null;
        clearMetricTimeInteractionState();
        metricTimeArtifacts?.destroy();
        metricTimeArtifacts = acquireMetricTimeArtifactHandle({
            conflictId: nextConflictId,
            version: config.version.graph_data,
        });

        const query = new URLSearchParams($page.url.search);
        const requestedMetric = buildRequestedMetricTimeMetric({
            metricName: query.get("metric"),
            cumulativeValue: query.get("cumulative"),
        });

        try {
            const bootstrap = await metricTimeArtifacts.bootstrapVisibleSeries({
                metric: requestedMetric,
                aggregationMode: parseMetricTimeAggregationMode(
                    query.get("aggregation"),
                ),
                requestedAllianceIds: parseRequestedAllianceIds(query.get("ids")),
                cityRange: parseCityRange(query),
                contextKey: `metric-time:${nextConflictId}`,
                requestId,
            });
            if (requestId !== latestRequestId) return;
            if (!bootstrap) {
                throw new Error("Metric timeline bootstrap returned no data.");
            }

            graphInfo = bootstrap.info;
            fallbackGraphData = bootstrap.graphData ?? null;
            conflictName = bootstrap.info.name;
            datasetProvenance = formatDatasetProvenance(
                config.version.graph_data,
                bootstrap.info.update_ms,
            );
            applyUrlStateFromInfo(query, bootstrap.info);
            if (bootstrap.cacheKey === currentSeriesCacheKey()) {
                applyMetricTimeSeries(bootstrap.series);
            } else {
                await refreshMetricTimeSeries({
                    graphData: bootstrap.graphData,
                    requestId,
                });
            }
            endJourneySpan("journey.conflict_to_metric_time.routeTransition");
        } catch (error) {
            if (requestId !== latestRequestId) return;
            loadError = error instanceof Error
                ? error.message
                : "Failed to load metric timeline.";
            loaded = true;
            endJourneySpan("journey.conflict_to_metric_time.routeTransition");
        }
    }

    function syncMetricTimeStateFromUrl(): void {
        const nextConflictId = ($page.url.searchParams.get("id") ?? "").trim();
        if (nextConflictId && nextConflictId !== conflictId) {
            void fetchMetricTimeData(nextConflictId);
            return;
        }

        if (!graphInfo) return;

        const previousState = buildMetricTimeQueryState();
        applyUrlStateFromInfo($page.url.searchParams, graphInfo);
        const nextState = buildMetricTimeQueryState();
        const idsChanged = !arrayEquals(
            previousState.requestedAllianceIds,
            nextState.requestedAllianceIds,
        );

        if (
            previousState.metricName !== nextState.metricName ||
            previousState.cityRange[0] !== nextState.cityRange[0] ||
            previousState.cityRange[1] !== nextState.cityRange[1] ||
            previousState.cumulative !== nextState.cumulative ||
            previousState.aggregationMode !== nextState.aggregationMode ||
            idsChanged
        ) {
            void refreshMetricTimeSeries();
        }
    }

    function retryLoad(): void {
        const nextConflictId = ($page.url.searchParams.get("id") ?? "").trim();
        if (!nextConflictId) {
            loadError = "Missing conflict id.";
            return;
        }
        void fetchMetricTimeData(nextConflictId);
    }

    function resetFilters(): void {
        if (!graphInfo) return;
        const metricName = resolveDefaultMetricTimeName(graphInfo);
        selectedMetric = buildMetricOption(metricName);
        cityRange = [...DEFAULT_CITY_RANGE];
        cumulative = isCumulativeMetricName(metricName);
        aggregationMode = DEFAULT_METRIC_TIME_AGGREGATION_MODE;
        allowedAllianceIds = resolveMetricTimeAllowedAllianceIds(graphInfo, null);
        requestedAllianceIdsFromQuery = null;
        setQueryParam("metric", metricName, { replace: true });
        setQueryParam("city_min", null, { replace: true });
        setQueryParam("city_max", null, { replace: true });
        setQueryParam("cumulative", null, { replace: true });
        setQueryParam("aggregation", null, { replace: true });
        setQueryParam("ids", null, { replace: true });
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleCityRangeCommit(nextCityRange: CityRange): void {
        cityRange = normalizeCityRange(nextCityRange);
        const query = buildCityRangeQuery(cityRange);
        setQueryParam("city_min", query.min, { replace: true });
        setQueryParam("city_max", query.max, { replace: true });
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleMetricCommit(nextMetric: MetricOption | null): void {
        if (!nextMetric || nextMetric.value === selectedMetric?.value) {
            return;
        }
        selectedMetric = { ...nextMetric };
        setQueryParam("metric", nextMetric.value, {
            replace: true,
        });
        setQueryParam(
            "cumulative",
            buildCumulativeQueryValue(nextMetric.value, cumulative),
            { replace: true },
        );
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleCumulativeCommit(enabled: boolean): void {
        if (!selectedMetric || enabled === cumulative) return;
        cumulative = enabled;
        setQueryParam(
            "cumulative",
            buildCumulativeQueryValue(selectedMetric.value, enabled),
            { replace: true },
        );
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleAggregationCommit(enabled: boolean): void {
        const nextAggregationMode: BubbleAggregationMode = enabled
            ? "coalition"
            : "alliance";
        if (nextAggregationMode === aggregationMode) return;
        aggregationMode = nextAggregationMode;
        setQueryParam(
            "aggregation",
            aggregationMode === DEFAULT_METRIC_TIME_AGGREGATION_MODE
                ? null
                : aggregationMode,
            { replace: true },
        );
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleAllianceIdsCommit(nextIds: number[]): void {
        const normalizedAllianceIds = normalizeAllianceIdList(nextIds);
        const queryValue = buildAllianceQueryValue(graphInfo, normalizedAllianceIds);
        allowedAllianceIds = new Set(normalizedAllianceIds);
        requestedAllianceIdsFromQuery = queryValue ? normalizedAllianceIds : null;
        setQueryParam("ids", queryValue, { replace: true });
        saveCurrentQueryParams();
        void refreshMetricTimeSeries();
    }

    function handleCanvasHover(
        event: CustomEvent<{
            datum: MetricTimeHoverDatum | null;
            width: number;
            height: number;
        }>,
    ): void {
        metricTimeHoverDatum = event.detail.datum;
        metricTimeTooltipAnchor = buildMetricTimeTooltipAnchor(
            event.detail.datum,
            event.detail.width,
            event.detail.height,
        );
    }

    function handleCanvasRendered(): void {
        void ensureMetricTimeControlsPanel();
        if (hasCompletedFirstMetricTimeMount) return;
        hasCompletedFirstMetricTimeMount = true;
        endJourneySpan("journey.conflict_to_metric_time.firstMount");
    }

    onMount(() => {
        bootstrapIdRouteLifecycle({
            restoreParams: [
                "metric",
                "city_min",
                "city_max",
                "cumulative",
                "aggregation",
                "ids",
            ],
            onMissingId: () => {
                loadError = "Missing conflict id.";
                loaded = true;
            },
            onResolvedId: async (id) => {
                beginJourneySpan("journey.conflict_to_metric_time.routeTransition", {
                    mode: "route-entry",
                    conflictId: id,
                });
                beginJourneySpan("journey.conflict_to_metric_time.firstMount", {
                    conflictId: id,
                });
                await fetchMetricTimeData(id);
                hasBootstrappedUrlState = true;
                lastParsedUrlSearch = $page.url.search;
            },
        });
    });

    onDestroy(() => {
        metricTimeArtifacts?.destroy();
    });

    $: if (
        browser &&
        hasBootstrappedUrlState &&
        $page.url.search !== lastParsedUrlSearch
    ) {
        lastParsedUrlSearch = $page.url.search;
        syncMetricTimeStateFromUrl();
    }

    $: metricItems =
        graphInfo?.metric_names.map((name) => ({
            value: name,
            label: name,
        })) ?? [];

    $: isResetDirty = (() => {
        if (!graphInfo) return false;
        const defaultMetricName = resolveDefaultMetricTimeName(graphInfo);
        const defaultCumulative = isCumulativeMetricName(defaultMetricName);
        const defaultAllianceIds = normalizeAllianceIdList(
            buildDefaultTieringAllianceIds(graphInfo).flat(),
        );
        return (
            selectedMetric?.value !== defaultMetricName ||
            !isDefaultCityRange(cityRange) ||
            cumulative !== defaultCumulative ||
            aggregationMode !== DEFAULT_METRIC_TIME_AGGREGATION_MODE ||
            !arrayEquals(currentAllianceIds(), defaultAllianceIds)
        );
    })();

    $: visibleLegendItems =
        metricTimeCanvasModel && metricTimeCanvasModel.series.length <= 12
            ? metricTimeCanvasModel.series
            : [];

    $: tooltipTimeLabel =
        metricTimeHoverDatum && metricTimeCanvasModel
            ? formatMetricTimeLabel(
                metricTimeHoverDatum.time,
                metricTimeCanvasModel.isTurn,
            )
            : "";
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <meta name="lc-data-origin" content={config.data_origin} />
    <meta
        name="lc-graph-data-version"
        content={String(config.version.graph_data)}
    />
    <title>Metric Timeline</title>
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
                            ? `${base}/conflict?id=${conflictId}`
                            : undefined,
                    },
                    { label: "Metric Time" },
                ]}
            />
            <span class="ux-page-title-main">
                Metric Timeline: {conflictName}
            </span>
        </div>
    </h1>

    <ConflictRouteTabs {conflictId} active="metric-time" routeKind="single" />

    <div class="row m-0 p-0 ux-surface ux-tab-panel">
        {#if !loaded}
            <Progress />
        {/if}
        {#if loadError}
            <div class="alert alert-danger m-2 d-flex justify-content-between align-items-center">
                <span>{loadError}</span>
                <button
                    class="btn btn-sm btn-outline-danger fw-bold"
                    on:click={retryLoad}>Retry</button
                >
            </div>
        {/if}
        <div class="col-12 ux-compact-controls p-2 border-bottom border-3">
            <div class="ux-graph-control-launcher">
                {#if graphInfo && metricTimeControlsPanelPromise}
                    {#await metricTimeControlsPanelPromise}
                        <div class="ux-graph-controls-loading small ux-muted" role="status" aria-live="polite">
                            <strong>Loading controls…</strong>
                        </div>
                    {:then MetricTimeControlsPanel}
                        <svelte:component
                            this={MetricTimeControlsPanel}
                            {graphInfo}
                            items={metricItems}
                            {selectedMetric}
                            {cityRange}
                            {cumulative}
                            aggregationByCoalition={aggregationMode === "coalition"}
                            allowedAllianceIds={currentAllianceIds()}
                            {isResetDirty}
                            onSelectedMetricCommit={handleMetricCommit}
                            onCityRangeCommit={handleCityRangeCommit}
                            onCumulativeCommit={handleCumulativeCommit}
                            onAggregationByCoalitionCommit={handleAggregationCommit}
                            onAllowedAllianceIdsCommit={handleAllianceIdsCommit}
                            onReset={resetFilters}
                        />
                    {:catch}
                        <div class="ux-graph-controls-loading small ux-muted" role="status" aria-live="polite">
                            <strong>Controls unavailable.</strong>
                        </div>
                    {/await}
                {:else if graphInfo}
                    <div class="ux-graph-controls-loading small ux-muted" role="status" aria-live="polite">
                        <strong>Loading controls…</strong>
                    </div>
                {:else}
                    <div class="ux-graph-controls-loading small ux-muted" role="status" aria-live="polite">
                        <strong>Loading controls…</strong>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="container-fluid m-0 p-0 mt-2 ux-surface metric-time-shell">
        {#if visibleLegendItems.length}
            <div class="metric-time-legend" aria-label="Visible series">
                {#each visibleLegendItems as item (item.key)}
                    <span class="metric-time-legend-item">
                        <span
                            class="metric-time-legend-swatch"
                            style={`background:${item.color};`}
                        ></span>
                        <span>{item.label}</span>
                    </span>
                {/each}
            </div>
        {/if}
        <div class="metric-time-stage">
            {#if metricTimeCanvasModel}
                <MetricTimeCanvas
                    model={metricTimeCanvasModel}
                    ariaLabel="Metric timeline"
                    on:hover={handleCanvasHover}
                    on:rendered={handleCanvasRendered}
                />
            {:else}
                <div class="metric-time-loading" role="status" aria-live="polite">
                    <Icon name="checklist" size="1rem" />
                    <strong>
                        {loadError
                            ? "Metric timeline unavailable."
                            : "Loading metric timeline…"}
                    </strong>
                </div>
            {/if}

            {#if metricTimeHoverDatum && metricTimeTooltipAnchor}
                <div
                    class="metric-time-tooltip"
                    class:is-flip-x={metricTimeTooltipAnchor.flipX}
                    class:is-flip-y={metricTimeTooltipAnchor.flipY}
                    style={`left:${metricTimeTooltipAnchor.x}px;top:${metricTimeTooltipAnchor.y}px;--metric-time-tooltip-accent:${metricTimeHoverDatum.color};`}
                >
                    <div class="metric-time-tooltip__title">
                        {metricTimeHoverDatum.label}
                    </div>
                    <div class="metric-time-tooltip__subtitle">
                        {tooltipTimeLabel}
                        {#if aggregationMode === "coalition"}
                            • Coalition roll-up over selected alliances
                        {:else if graphInfo}
                            • {graphInfo.coalitions[metricTimeHoverDatum.coalitionIndex]?.name}
                        {/if}
                    </div>
                    <div class="metric-time-tooltip__row">
                        <span>{metricTimeCanvasModel ? formatMetricTimeMetricLabel(metricTimeCanvasModel.metric) : "Metric"}</span>
                        <strong>{formatMetricTimeNumber(metricTimeHoverDatum.value)}</strong>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>

<style>
    .ux-graph-control-launcher {
        min-height: 2.8rem;
    }

    .ux-graph-controls-loading {
        min-height: 5rem;
        display: grid;
        align-content: center;
        gap: 0.24rem;
    }

    .metric-time-shell {
        padding: 0.75rem;
        display: grid;
        gap: 0.75rem;
    }

    .metric-time-stage {
        position: relative;
        min-height: clamp(320px, 62vh, 640px);
        border: 1px solid color-mix(in srgb, var(--ux-border) 88%, transparent);
        border-radius: 12px;
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--ux-surface) 98%, transparent),
            color-mix(in srgb, rgba(148, 163, 184, 0.05) 76%, var(--ux-surface))
        );
        overflow: hidden;
    }

    .metric-time-loading {
        min-height: clamp(320px, 62vh, 640px);
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 0.5rem;
        color: rgba(71, 85, 105, 0.88);
    }

    .metric-time-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.38rem;
    }

    .metric-time-legend-item {
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

    .metric-time-legend-swatch {
        width: 0.62rem;
        height: 0.62rem;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.14);
    }

    .metric-time-tooltip {
        position: absolute;
        transform: translate(12px, calc(-100% - 12px));
        max-width: min(18rem, calc(100vw - 1.5rem));
        padding: 0.42rem 0.52rem;
        border-radius: 6px;
        border: 1px solid var(--metric-time-tooltip-accent, rgba(148, 163, 184, 0.5));
        background: rgba(15, 23, 42, 0.96);
        color: rgb(248, 250, 252);
        pointer-events: none;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
        z-index: 2;
    }

    .metric-time-tooltip.is-flip-x {
        transform: translate(calc(-100% - 12px), calc(-100% - 12px));
    }

    .metric-time-tooltip.is-flip-y {
        transform: translate(12px, 12px);
    }

    .metric-time-tooltip.is-flip-x.is-flip-y {
        transform: translate(calc(-100% - 12px), 12px);
    }

    .metric-time-tooltip__title {
        font-weight: 600;
        font-size: 0.76rem;
        line-height: 1.2;
    }

    .metric-time-tooltip__subtitle {
        color: rgba(226, 232, 240, 0.84);
        font-size: 0.67rem;
        margin-top: 0.08rem;
        margin-bottom: 0.35rem;
    }

    .metric-time-tooltip__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.7rem;
        font-size: 0.71rem;
    }

    :global([data-bs-theme="dark"]) .metric-time-stage,
    :global([data-bs-theme="dark"]) .metric-time-legend-item {
        border-color: rgba(148, 163, 184, 0.26);
        background: linear-gradient(
            180deg,
            rgba(15, 23, 42, 0.98),
            rgba(30, 41, 59, 0.9)
        );
    }

    :global([data-bs-theme="dark"]) .metric-time-loading {
        color: rgba(203, 213, 225, 0.84);
    }

    @media (max-width: 768px) {
        .metric-time-shell {
            padding: 0.5rem;
        }

        .metric-time-tooltip {
            max-width: min(15rem, calc(100vw - 1rem));
        }
    }
</style>
