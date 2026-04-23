<script lang="ts">
    import SelectionModal from "./SelectionModal.svelte";
    import type { SelectionId, SelectionModalItem } from "$lib/selection/types";

    type MetricOption = {
        value: string;
        label: string;
    };

    export let title = "Select metrics";
    export let description = "";
    export let items: MetricOption[] = [];
    export let selectedMetrics: MetricOption[] = [];
    export let searchPlaceholder = "Search metrics...";
    export let emptyLabel = "Select metrics";
    export let applyLabel = "Apply";
    export let selectedCountLabel = "Selected";
    export let singleSelect = false;
    export let maxSelectedCount: number | null = null;
    export let minSelectedCount = 1;
    export let exactSelectedCount: number | null = null;
    export let badgeOrderLabels: string[] = [];
    export let onCommit: (selectedMetrics: MetricOption[]) => void = () => {};

    function cloneMetricOptions(options: MetricOption[]): MetricOption[] {
        return options.map((option) => ({ ...option }));
    }

    function normalizeMetricOptions(options: MetricOption[]): MetricOption[] {
        const normalizedOptions: MetricOption[] = [];
        const seenValues = new Set<string>();

        for (const option of options) {
            const value = `${option?.value ?? ""}`.trim();
            if (value.length === 0 || seenValues.has(value)) continue;
            seenValues.add(value);
            normalizedOptions.push({
                value,
                label: `${option?.label ?? value}`.trim() || value,
            });
        }

        return normalizedOptions;
    }

    function buildMetricItems(
        allItems: MetricOption[],
        currentSelection: MetricOption[],
    ): SelectionModalItem[] {
        const knownValues = new Set(allItems.map(({ value }) => value));
        const mergedItems = [...allItems];

        for (const option of currentSelection) {
            if (knownValues.has(option.value)) continue;
            knownValues.add(option.value);
            mergedItems.push(option);
        }

        return mergedItems.map((option) => ({
            id: option.value,
            label: option.label,
        }));
    }

    function normalizeCount(value: number | null | undefined): number | null {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            return null;
        }

        return Math.floor(value);
    }

    function metricCountLabel(count: number): string {
        return count === 1 ? "metric" : "metrics";
    }

    function validateSelection(ids: SelectionId[]): string | null {
        const selectedCount = ids.length;

        if (
            normalizedMaxSelectedCount != null &&
            selectedCount > normalizedMaxSelectedCount
        ) {
            return `Select at most ${normalizedMaxSelectedCount} ${metricCountLabel(normalizedMaxSelectedCount)}.`;
        }

        if (normalizedExactSelectedCount != null) {
            return selectedCount === normalizedExactSelectedCount
                ? null
                : `Select exactly ${normalizedExactSelectedCount} ${metricCountLabel(normalizedExactSelectedCount)}.`;
        }

        if (
            normalizedMinSelectedCount > 0 &&
            selectedCount < normalizedMinSelectedCount
        ) {
            return `Select at least ${normalizedMinSelectedCount} ${metricCountLabel(normalizedMinSelectedCount)}.`;
        }

        return null;
    }

    function handleApply(event: CustomEvent<{ ids: SelectionId[] }>): void {
        const nextMetrics = event.detail.ids.reduce<MetricOption[]>(
            (appliedMetrics, id) => {
                const option = metricOptionsByValue.get(`${id}`);
                if (!option) return appliedMetrics;
                appliedMetrics.push(option);
                return appliedMetrics;
            },
            [],
        );

        onCommit(cloneMetricOptions(nextMetrics));
    }

    $: normalizedItems = normalizeMetricOptions(Array.isArray(items) ? items : []);
    $: normalizedSelectedMetrics = normalizeMetricOptions(
        Array.isArray(selectedMetrics) ? selectedMetrics : [],
    );
    $: normalizedMaxSelectedCount = normalizeCount(maxSelectedCount);
    $: normalizedMinSelectedCount = normalizeCount(minSelectedCount) ?? 0;
    $: normalizedExactSelectedCount = normalizeCount(exactSelectedCount);
    $: metricModalItems = buildMetricItems(normalizedItems, normalizedSelectedMetrics);
    $: metricOptionsByValue = new Map(
        metricModalItems.map((item) => [
            `${item.id}`,
            {
                value: `${item.id}`,
                label: item.label,
            },
        ]),
    );
</script>

<div class="ux-metric-picker" role="group" aria-label={title}>
    <div class="ux-metric-picker__values">
        {#if normalizedSelectedMetrics.length === 0}
            <span class="ux-metric-picker__placeholder">{emptyLabel}</span>
        {:else}
            {#each normalizedSelectedMetrics as metric, index (metric.value)}
                <span class="ux-metric-picker__badge" title={metric.label}>
                    {#if badgeOrderLabels[index]}
                        <span class="ux-metric-picker__badge-key">
                            {badgeOrderLabels[index]}
                        </span>
                    {/if}
                    <span class="ux-metric-picker__badge-text">{metric.label}</span>
                </span>
            {/each}
        {/if}
    </div>

    <SelectionModal
        {title}
        {description}
        items={metricModalItems}
        selectedIds={normalizedSelectedMetrics.map((metric) => metric.value)}
        {searchPlaceholder}
        {applyLabel}
        {selectedCountLabel}
        {singleSelect}
        maxSelectedCount={normalizedMaxSelectedCount}
        validateSelection={validateSelection}
        buttonLabel=""
        buttonTitle={title}
        buttonAriaLabel={title}
        buttonClass="btn ux-metric-picker__trigger"
        buttonIcon="chevronDown"
        buttonIconSize="0.9rem"
        iconOnly
        size="lg"
        on:apply={handleApply}
    />
</div>

<style>
    .ux-metric-picker {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: stretch;
        min-height: 1.84rem;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
        overflow: hidden;
    }

    .ux-metric-picker__values {
        min-width: 0;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.22rem;
        padding: 0.2rem 0.34rem;
    }

    .ux-metric-picker__placeholder {
        color: var(--ux-text-muted);
        font-size: 0.74rem;
        line-height: 1.15;
    }

    .ux-metric-picker__badge {
        min-width: 0;
        max-width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 0.24rem;
        padding: 0.08rem 0.34rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 92%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
        color: var(--ux-text);
        font-size: 0.72rem;
        font-weight: 500;
        line-height: 1.15;
    }

    .ux-metric-picker__badge-key {
        flex: 0 0 auto;
        color: var(--ux-text-muted);
        font-size: 0.64rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .ux-metric-picker__badge-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    :global(.ux-metric-picker__trigger) {
        min-width: 2rem;
        margin: 0 !important;
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.44rem !important;
        border: 0 !important;
        border-left: 1px solid var(--ux-border) !important;
        border-radius: 0 !important;
        background: color-mix(in srgb, var(--ux-surface-alt) 90%, transparent) !important;
        color: var(--ux-text) !important;
        box-shadow: none !important;
    }

    :global(.ux-metric-picker__trigger:hover),
    :global(.ux-metric-picker__trigger:focus-visible) {
        background: color-mix(in srgb, var(--ux-brand) 10%, var(--ux-surface-alt)) !important;
    }

    @media (max-width: 768px) {
        .ux-metric-picker__values {
            padding-inline: 0.3rem;
        }

        .ux-metric-picker__badge {
            max-width: calc(100vw - 7.5rem);
        }
    }
</style>
