<script lang="ts">
    import {
        DEFAULT_CITY_RANGE,
        type CityRange,
    } from "$lib/cityRange";
    import type { GraphRouteInfo } from "$lib/graphRouteInfo";
    import CityRangeSlider from "./CityRangeSlider.svelte";
    import ShareResetBar from "./ShareResetBar.svelte";
    import MetricSelectionField from "./MetricSelectionField.svelte";
    import AllianceFilterModal from "./AllianceFilterModal.svelte";
    import "../styles/conflict-widgets.css";

    type MetricOption = {
        value: string;
        label: string;
    };

    export let graphInfo: GraphRouteInfo | null = null;
    export let items: MetricOption[] = [];
    export let selectedMetric: MetricOption | null = null;
    export let cityRange: CityRange = DEFAULT_CITY_RANGE;
    export let cumulative = false;
    export let aggregationByCoalition = false;
    export let allowedAllianceIds: number[] = [];
    export let isResetDirty = false;
    export let onSelectedMetricCommit: (metric: MetricOption | null) => void = () => {};
    export let onCityRangeCommit: (cityRange: CityRange) => void = () => {};
    export let onCumulativeCommit: (enabled: boolean) => void = () => {};
    export let onAggregationByCoalitionCommit: (enabled: boolean) => void = () => {};
    export let onAllowedAllianceIdsCommit: (ids: number[]) => void = () => {};
    export let onReset: () => void = () => {};

    function normalizeAllowedAllianceIds(ids: number[]): number[] {
        return Array.from(
            new Set(ids.map((id) => Math.trunc(Number(id))).filter((id) => id > 0)),
        ).sort((left, right) => left - right);
    }

    function allianceSelectionSummary(): string {
        const totalAllianceCount = graphInfo
            ? graphInfo.coalitions.reduce(
                    (total, coalition) => total + coalition.alliance_ids.length,
                    0,
                )
            : 0;
        const selectedAllianceCount = normalizedAllowedAllianceIds.length;
        if (totalAllianceCount === 0) {
            return "Filter alliances";
        }
        return `Filter alliances (${selectedAllianceCount}/${totalAllianceCount})`;
    }

    function handleMetricCommit(nextSelectedMetrics: MetricOption[]): void {
        onSelectedMetricCommit(nextSelectedMetrics[0] ? { ...nextSelectedMetrics[0] } : null);
    }

    function handleCumulativeToggle(event: Event): void {
        onCumulativeCommit((event.currentTarget as HTMLInputElement).checked);
    }

    function handleAggregationToggle(event: Event): void {
        onAggregationByCoalitionCommit(
            (event.currentTarget as HTMLInputElement).checked,
        );
    }

    $: normalizedAllowedAllianceIds = normalizeAllowedAllianceIds(allowedAllianceIds);
    $: selectedMetrics = selectedMetric ? [{ ...selectedMetric }] : [];
</script>

<div class="ux-metric-time-controls">
    <CityRangeSlider {cityRange} onCommit={onCityRangeCommit} />

    <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span class="fw-bold">Metric timeline</span>
        <div class="d-flex align-items-center gap-2 flex-wrap">
            {#if graphInfo}
                <AllianceFilterModal
                    title="Filter alliances"
                    description="Choose which alliances to include in the metric timeline."
                    coalitions={graphInfo.coalitions}
                    selectedIds={normalizedAllowedAllianceIds}
                    mode="all-coalitions"
                    validationMode="at-least-one"
                    buttonLabel={allianceSelectionSummary()}
                    size="sm"
                    on:commit={(event) => onAllowedAllianceIdsCommit(event.detail.ids)}
                />
            {/if}
            <ShareResetBar resetDirty={isResetDirty} onReset={onReset} />
        </div>
    </div>

    <MetricSelectionField
        title="Metric"
        description="Choose exactly one metric to plot over time."
        {items}
        {selectedMetrics}
        searchPlaceholder="Search metrics..."
        emptyLabel="Select a metric"
        selectedCountLabel="Metric"
        singleSelect={true}
        exactSelectedCount={1}
        onCommit={handleMetricCommit}
    />

    <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="fw-bold">Mode:</span>
        <label for="metricTimeCumulative" class="ux-toggle-chip">
            <span>Cumulative</span>
            <input
                id="metricTimeCumulative"
                class="form-check-input"
                type="checkbox"
                checked={cumulative}
                on:change={handleCumulativeToggle}
            />
        </label>
        <label for="metricTimeAggregate" class="ux-toggle-chip">
            <span>Coalition sides</span>
            <input
                id="metricTimeAggregate"
                class="form-check-input"
                type="checkbox"
                checked={aggregationByCoalition}
                on:change={handleAggregationToggle}
            />
        </label>
    </div>
</div>

<style>
    .ux-metric-time-controls {
        display: grid;
        gap: 0.85rem;
    }
</style>
