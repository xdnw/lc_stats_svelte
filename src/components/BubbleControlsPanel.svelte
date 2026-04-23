<script lang="ts">
    import type { CityRange } from "$lib/cityRange";
    import type { GraphRouteInfo } from "$lib/graphRouteInfo";
    import ExportDataMenu from "./ExportDataMenu.svelte";
    import CityRangeSlider from "./CityRangeSlider.svelte";
    import MetricSelectionField from "./MetricSelectionField.svelte";
    import ShareResetBar from "./ShareResetBar.svelte";
    import AllianceFilterModal from "./AllianceFilterModal.svelte";
    import "../styles/conflict-widgets.css";
    import type { ExportDatasetOption } from "$lib";
    import type { ExportMenuAction } from "./exportMenuTypes";

    type MetricOption = {
        value: string;
        label: string;
    };

    export let rawData: GraphRouteInfo | null = null;
    export let items: MetricOption[] = [];
    export let selectedMetrics: MetricOption[] = [];
    export let cityRange: CityRange = [0, 70];
    export let normalizeX = false;
    export let normalizeY = false;
    export let normalizeZ = false;
    export let aggregationByCoalition = false;
    export let allowedAllianceIds: number[] = [];
    export let selectedExportDatasetKey = "frame";
    export let exportDatasets: ExportDatasetOption[] = [];
    export let isResetDirty = false;
    export let onSelectedMetricsCommit: (selectedMetrics: MetricOption[]) => void =
        () => {};
    export let onCityRangeCommit: (cityRange: CityRange) => void = () => {};
    export let onNormalizeCommit: (normalize: {
        x: boolean;
        y: boolean;
        z: boolean;
    }) => void = () => {};
    export let onAggregationByCoalitionCommit: (enabled: boolean) => void =
        () => {};
    export let onAllowedAllianceIdsCommit: (allowedAllianceIds: number[]) => void =
        () => {};
    export let onSelectedExportDatasetKeyChange: (datasetKey: string) => void =
        () => {};
    export let onExport: (action: ExportMenuAction) => void = () => {};
    export let onReset: () => void = () => {};

    let localSelectedExportDatasetKey = selectedExportDatasetKey;
    let lastSyncedExportDatasetKey = selectedExportDatasetKey;

    function handleNormalizeToggle(axis: "x" | "y" | "z", checked: boolean): void {
        onNormalizeCommit({
            x: axis === "x" ? checked : normalizeX,
            y: axis === "y" ? checked : normalizeY,
            z: axis === "z" ? checked : normalizeZ,
        });
    }

    function handleAggregationToggle(checked: boolean): void {
        if (checked === aggregationByCoalition) return;
        onAggregationByCoalitionCommit(checked);
    }

    function normalizeAllowedAllianceIds(ids: number[]): number[] {
        return Array.from(
            new Set(ids.map((id) => Math.trunc(Number(id))).filter((id) => id > 0)),
        ).sort((left, right) => left - right);
    }

    function allianceSelectionSummary(): string {
        const totalAllianceCount = rawData
            ? rawData.coalitions.reduce(
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

    $: normalizedAllowedAllianceIds = normalizeAllowedAllianceIds(allowedAllianceIds);
    $: if (localSelectedExportDatasetKey !== selectedExportDatasetKey) {
        if (selectedExportDatasetKey !== lastSyncedExportDatasetKey) {
            lastSyncedExportDatasetKey = selectedExportDatasetKey;
            localSelectedExportDatasetKey = selectedExportDatasetKey;
        }
    }

    $: if (localSelectedExportDatasetKey !== lastSyncedExportDatasetKey) {
        lastSyncedExportDatasetKey = localSelectedExportDatasetKey;
        onSelectedExportDatasetKeyChange(localSelectedExportDatasetKey);
    }
</script>

<div class="ux-graph-controls-panel">
    <div class="ux-graph-controls-group">
        <CityRangeSlider {cityRange} onCommit={onCityRangeCommit} />
    </div>

    <div class="ux-graph-controls-group">
        <div class="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
            <span class="fw-bold">Select 3 metrics</span>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                {#if rawData}
                    <AllianceFilterModal
                        title="Filter alliances"
                        description="Choose which alliances to include in the bubble timeline. Keep at least one alliance selected in each coalition."
                        coalitions={rawData.coalitions}
                        selectedIds={normalizedAllowedAllianceIds}
                        mode="all-coalitions"
                        buttonLabel={allianceSelectionSummary()}
                        size="sm"
                        on:commit={(event) =>
                            onAllowedAllianceIdsCommit(event.detail.ids)}
                    />
                {/if}
                <ExportDataMenu
                    datasets={exportDatasets}
                    bind:selectedDatasetKey={localSelectedExportDatasetKey}
                    onExport={onExport}
                />
                <ShareResetBar resetDirty={isResetDirty} onReset={onReset} />
            </div>
        </div>
        <div class="mb-2">
            <MetricSelectionField
                title="Bubble metrics"
                description="Choose exactly three metrics in X, Y, and size order."
                {items}
                {selectedMetrics}
                searchPlaceholder="Search metrics..."
                emptyLabel="Select X, Y, and size metrics"
                selectedCountLabel="Metrics"
                maxSelectedCount={3}
                exactSelectedCount={3}
                badgeOrderLabels={["X", "Y", "Size"]}
                onCommit={onSelectedMetricsCommit}
            />
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap mt-2">
            <span class="fw-bold">Per Unit or Nation:</span>
            <label for="bubbleNormalizeX" class="ux-toggle-chip">
                <span>X</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="bubbleNormalizeX"
                    value="x"
                    checked={normalizeX}
                    on:change={(event) =>
                        handleNormalizeToggle(
                            "x",
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
            <label for="bubbleNormalizeY" class="ux-toggle-chip">
                <span>Y</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="bubbleNormalizeY"
                    value="y"
                    checked={normalizeY}
                    on:change={(event) =>
                        handleNormalizeToggle(
                            "y",
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
            <label for="bubbleNormalizeZ" class="ux-toggle-chip">
                <span>Z</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="bubbleNormalizeZ"
                    value="z"
                    checked={normalizeZ}
                    on:change={(event) =>
                        handleNormalizeToggle(
                            "z",
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
            <span class="fw-bold ms-1">Aggregation:</span>
            <label for="bubbleAggregateByCoalition" class="ux-toggle-chip">
                <span>Coalition sides</span>
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="bubbleAggregateByCoalition"
                    checked={aggregationByCoalition}
                    on:change={(event) =>
                        handleAggregationToggle(
                            (event.currentTarget as HTMLInputElement).checked,
                        )}
                />
            </label>
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
