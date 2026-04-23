<script lang="ts">
    import type { ExportDatasetOption } from "$lib";
    import {
        formatDaysToDate,
        formatTurnsToDate,
    } from "$lib";
    import type { SliderContext } from "$lib/graphSlider";
    import type { GraphRouteInfo } from "$lib/graphRouteInfo";
    import { buildSliderTickDescriptors } from "$lib/sliderTicks";
    import { normalizeTieringSliderValues } from "$lib/tieringSelection";
    import AllianceFilterModal from "./AllianceFilterModal.svelte";
    import ExportDataMenu from "./ExportDataMenu.svelte";
    import GraphSlider from "./GraphSlider.svelte";
    import MetricSelectionField from "./MetricSelectionField.svelte";
    import ShareResetBar from "./ShareResetBar.svelte";
    import type { ExportMenuAction } from "./exportMenuTypes";
    import "../styles/conflict-widgets.css";

    type MetricOption = {
        value: string;
        label: string;
    };

    type QuickLayoutOption = {
        name: string;
        metrics: MetricOption[];
        normalize: boolean;
        href: string | null;
    };

    export let rawData: GraphRouteInfo | null = null;
    export let items: MetricOption[] = [];
    export let selectedMetrics: MetricOption[] = [];
    export let normalize = false;
    export let useSingleColor = false;
    export let cityBandSize = 0;
    export let allowedAllianceIds: number[] = [];
    export let timeRange: [number, number] | null = null;
    export let usesRangeSelection = false;
    export let sliderValues: number[] = [];
    export let isTurn = false;
    export let selectedExportDatasetKey = "snapshot";
    export let exportDatasets: ExportDatasetOption[] = [];
    export let quickLayouts: QuickLayoutOption[] = [];
    export let isResetDirty = false;
    export let onSelectedMetricsCommit: (selectedMetrics: MetricOption[]) => void =
        () => {};
    export let onNormalizeCommit: (normalize: boolean) => void = () => {};
    export let onUseSingleColorCommit: (useSingleColor: boolean) => void = () => {};
    export let onCityBandSizeCommit: (cityBandSize: number) => void = () => {};
    export let onAllowedAllianceIdsCommit: (allowedAllianceIds: number[]) => void =
        () => {};
    export let onSliderValuesCommit: (sliderValues: number[]) => void = () => {};
    export let onQuickLayoutCommit: (layout: QuickLayoutOption) => void = () => {};
    export let onSelectedExportDatasetKeyChange: (datasetKey: string) => void =
        () => {};
    export let onExport: (action: ExportMenuAction) => void = () => {};
    export let onReset: () => void = () => {};

    let localSelectedExportDatasetKey = selectedExportDatasetKey;
    let lastSyncedExportDatasetKey = selectedExportDatasetKey;

    function normalizeAllowedAllianceIds(ids: number[]): number[] {
        return Array.from(
            new Set(ids.map((id) => Math.trunc(Number(id))).filter((id) => id > 0)),
        ).sort((left, right) => left - right);
    }

    function allowedAllianceIdsEqual(left: number[], right: number[]): boolean {
        if (left.length !== right.length) return false;
        for (let index = 0; index < left.length; index += 1) {
            if (left[index] !== right[index]) return false;
        }
        return true;
    }

    function sliderFormatter(value: number): string {
        return isTurn ? formatTurnsToDate(value) : formatDaysToDate(value);
    }

    function buildSliderTicks(
        nextTimeRange: [number, number] | null,
        nextIsTurn: boolean,
    ) {
        if (!nextTimeRange) return [];
        const density = nextIsTurn ? 60 : 5;
        const tickValues: number[] = [];
        for (let value = nextTimeRange[0]; value <= nextTimeRange[1]; value += 1) {
            if (
                value === nextTimeRange[0] ||
                value === nextTimeRange[1] ||
                value % density === 0
            ) {
                tickValues.push(value);
            }
        }
        return buildSliderTickDescriptors(
            tickValues,
            (value) => sliderFormatter(value),
        );
    }

    function isPointSelection(values: number[]): boolean {
        if (!timeRange) {
            return true;
        }
        return values.length === 1 || values[0] === timeRange[0];
    }

    function buildSliderSelectionLabel(values: number[]): string {
        if (!timeRange) {
            return "";
        }

        if (isPointSelection(values)) {
            return sliderFormatter(values[values.length - 1] ?? values[0] ?? timeRange[0]);
        }

        return `${sliderFormatter(values[0] ?? timeRange[0])} - ${sliderFormatter(values[1] ?? timeRange[1])}`;
    }

    function normalizeTieringGraphSliderValues(
        nextValues: number[],
        context: SliderContext,
    ): number[] {
        return normalizeTieringSliderValues(
            nextValues,
            [context.min, context.max],
            context.mode === "range",
        );
    }

    function coalitionSelectionLabel(coalitionIndex: 0 | 1): string {
        if (!rawData) return "Loading selection...";
        const coalition = rawData.coalitions[coalitionIndex];
        const normalizedAllowedAllianceIds = normalizeAllowedAllianceIds(
            allowedAllianceIds,
        );
        const selectedCount = coalition.alliance_ids.filter((id) =>
            normalizedAllowedAllianceIds.includes(id),
        ).length;
        return `${coalition.name} selected: ${selectedCount}/${coalition.alliance_ids.length}`;
    }

    function commitAllowedAllianceIds(nextAllowedAllianceIds: number[]): void {
        const currentAllowedAllianceIds = normalizeAllowedAllianceIds(
            allowedAllianceIds,
        );
        const normalizedIds = normalizeAllowedAllianceIds(nextAllowedAllianceIds);
        if (allowedAllianceIdsEqual(currentAllowedAllianceIds, normalizedIds)) return;
        onAllowedAllianceIdsCommit(normalizedIds);
    }

    function handleNormalizeChange(checked: boolean): void {
        onNormalizeCommit(checked);
    }

    function handleUseSingleColorChange(checked: boolean): void {
        onUseSingleColorCommit(checked);
    }

    function handleCityBandSizeChange(nextValueRaw: string): void {
        const nextValue = Math.max(0, Math.floor(Number(nextValueRaw) || 0));
        onCityBandSizeCommit(nextValue);
    }

    $: sliderTicks = buildSliderTicks(timeRange, isTurn);
    $: if (localSelectedExportDatasetKey !== lastSyncedExportDatasetKey) {
        lastSyncedExportDatasetKey = localSelectedExportDatasetKey;
        onSelectedExportDatasetKeyChange(localSelectedExportDatasetKey);
    }

    $: if (selectedExportDatasetKey !== lastSyncedExportDatasetKey) {
        lastSyncedExportDatasetKey = selectedExportDatasetKey;
        localSelectedExportDatasetKey = selectedExportDatasetKey;
    }
</script>

<div class="ux-graph-controls-panel">
    {#if rawData}
        <div class="ux-graph-controls-group">
            <div class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">{coalitionSelectionLabel(0)}</span>
                </div>
                <div class="mt-2">
                    <AllianceFilterModal
                        title={`Filter Alliances: ${rawData.coalitions[0]?.name ?? "Coalition"}`}
                        description="Select alliances for the coalition associated with the button you clicked."
                        coalitions={rawData.coalitions}
                        selectedIds={normalizeAllowedAllianceIds(allowedAllianceIds)}
                        mode="coalition-merged"
                        coalitionIndex={0}
                        buttonLabel="Edit alliances"
                        size="sm"
                        on:commit={(event) => commitAllowedAllianceIds(event.detail.ids)}
                    />
                </div>
            </div>
            <div class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--blue">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">{coalitionSelectionLabel(1)}</span>
                </div>
                <div class="mt-2">
                    <AllianceFilterModal
                        title={`Filter Alliances: ${rawData.coalitions[1]?.name ?? "Coalition"}`}
                        description="Select alliances for the coalition associated with the button you clicked."
                        coalitions={rawData.coalitions}
                        selectedIds={normalizeAllowedAllianceIds(allowedAllianceIds)}
                        mode="coalition-merged"
                        coalitionIndex={1}
                        buttonLabel="Edit alliances"
                        size="sm"
                        on:commit={(event) => commitAllowedAllianceIds(event.detail.ids)}
                    />
                </div>
            </div>
        </div>
    {/if}

    <div class="ux-graph-controls-group">
        {#if timeRange}
            <div class="ux-range-slider-wrap">
                <GraphSlider
                    mode={usesRangeSelection ? "range" : "single"}
                    min={timeRange[0]}
                    max={timeRange[1]}
                    step={1}
                    values={sliderValues}
                    ticks={sliderTicks}
                    formatValue={sliderFormatter}
                    normalizeValues={normalizeTieringGraphSliderValues}
                    getSelectionLabel={buildSliderSelectionLabel}
                    ariaLabel={isTurn ? "Tiering turn" : "Tiering day"}
                    ariaLabelStart={isTurn ? "Tiering range start turn" : "Tiering range start day"}
                    ariaLabelEnd={isTurn ? "Tiering range end turn" : "Tiering range end day"}
                    onValuesInput={onSliderValuesCommit}
                    onValuesCommit={onSliderValuesCommit}
                />
            </div>
        {/if}
    </div>

    <div class="ux-graph-controls-group">
        <div class="mb-1">
            <MetricSelectionField
                title="Tiering metrics"
                {items}
                {selectedMetrics}
                searchPlaceholder="Search metrics..."
                emptyLabel="Select metrics"
                selectedCountLabel="Metrics"
                maxSelectedCount={4}
                minSelectedCount={1}
                onCommit={onSelectedMetricsCommit}
            />
        </div>
        <div class="ux-control-strip mb-1">
            <ExportDataMenu
                datasets={exportDatasets}
                bind:selectedDatasetKey={localSelectedExportDatasetKey}
                onExport={onExport}
            />
            <ShareResetBar resetDirty={isResetDirty} onReset={onReset} />
            <label for="tieringNormalize" class="ux-toggle-chip">
                <span>Use Percent</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="tieringNormalize"
                    value="normalize"
                    checked={normalize}
                    on:change={(event) =>
                        handleNormalizeChange(
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
            <label for="tieringSingleColor" class="ux-toggle-chip">
                <span>Single Color</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="tieringSingleColor"
                    value="single-color"
                    checked={useSingleColor}
                    on:change={(event) =>
                        handleUseSingleColorChange(
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
            <label for="tieringCityBand" class="ux-toggle-chip">
                <span>City Bands</span>
                <select
                    id="tieringCityBand"
                    class="form-select form-select-sm"
                    value={cityBandSize}
                    on:change={(event) =>
                        handleCityBandSizeChange(
                            (event.currentTarget as HTMLSelectElement).value,
                        )}
                >
                    <option value={0}>Off (per city)</option>
                    <option value={5}>5-city bands</option>
                    <option value={10}>10-city bands</option>
                    <option value={20}>20-city bands</option>
                </select>
            </label>
            {#if rawData && quickLayouts.length > 0}
                <div class="ux-quick-layouts">
                    <span class="fw-bold">Quick Layouts:</span>
                    {#each quickLayouts as layout}
                        <button
                            type="button"
                            class="btn ux-btn btn-sm"
                            on:click={() => onQuickLayoutCommit(layout)}
                        >
                            {layout.name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .ux-graph-controls-panel {
        display: grid;
        gap: 0.9rem;
    }

    .ux-graph-controls-group {
        min-width: 0;
    }
</style>
