<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import ModalShell from "./ModalShell.svelte";
    import type {
        ConflictKPIWidget,
        PresetCardKey,
        WidgetEntity,
        WidgetScope,
    } from "$lib/kpi";

    type ScopeOption = {
        value: WidgetScope;
        label: string;
        requiresSelection?: boolean;
    };

    type EntityOption = {
        value: WidgetEntity;
        label: string;
    };

    export let open = false;
    export let title = "KPI Builder";
    export let description = "";
    export let widgets: ConflictKPIWidget[] = [];

    export let showPresetSection = true;
    export let showRankingSection = true;
    export let showMetricSection = true;

    export let presetCardLabels: Record<PresetCardKey, string> | null = null;
    export let presetCardDescriptions: Partial<Record<PresetCardKey, string>> =
        {};

    export let rankingEntityOptions: EntityOption[] = [
        { value: "alliance", label: "Alliance" },
        { value: "nation", label: "Nation" },
    ];
    export let metricEntityOptions: EntityOption[] = [
        { value: "alliance", label: "Alliance" },
        { value: "nation", label: "Nation" },
    ];
    export let scopeOptions: ScopeOption[] = [
        { value: "all", label: "All" },
        { value: "coalition1", label: "Coalition 1" },
        { value: "coalition2", label: "Coalition 2" },
        { value: "selection", label: "Selection" },
    ];

    export let rankingEntityToAdd: WidgetEntity = "nation";
    export let rankingMetricToAdd = "";
    export let rankingScopeToAdd: WidgetScope = "all";
    export let rankingLimitToAdd = 10;

    export let metricEntityToAdd: WidgetEntity = "nation";
    export let metricMetricToAdd = "";
    export let metricScopeToAdd: WidgetScope = "all";
    export let metricAggToAdd: "sum" | "avg" = "sum";
    export let metricNormalizeByToAdd = "";

    export let metricsOptions: string[] = [];
    export let selectedSnapshotLabel = "No selection";

    export let canAddRanking = true;
    export let canAddMetric = true;
    export let canAddRankingReason = "";
    export let canAddMetricReason = "";
    export let showMetricGlossary = false;

    export let showAavaHint = false;
    export let aavaHref: string | null = null;

    export let widgetManagerLabel: (widget: ConflictKPIWidget) => string = () =>
        "";
    export let metricLabel: (metric: string) => string = (metric) => metric;
    export let metricDescription: (metric: string) => string = () =>
        "Choose a metric";

    const dispatch = createEventDispatcher<{
        close: void;
        removeWidget: { id: string };
        moveWidget: { id: string; delta: number };
        addPreset: { key: PresetCardKey };
        addRanking: void;
        addMetric: void;
    }>();

    function closeModal() {
        dispatch("close");
    }

    function removeWidget(id: string) {
        dispatch("removeWidget", { id });
    }

    function moveWidget(id: string, delta: number) {
        dispatch("moveWidget", { id, delta });
    }

    function addPresetCard(key: PresetCardKey) {
        dispatch("addPreset", { key });
    }

    function addRankingCard() {
        dispatch("addRanking");
    }

    function addMetricCard() {
        dispatch("addMetric");
    }

    function scopeOptionLabel(option: ScopeOption): string {
        if (option.value !== "selection") return option.label;
        return `${option.label} (${selectedSnapshotLabel})`;
    }

    function previewScope(scope: WidgetScope): string {
        const option = scopeOptions.find((item) => item.value === scope);
        return option ? scopeOptionLabel(option) : scope;
    }

    function rankingPreviewLabel(): string {
        const entityLabel =
            rankingEntityOptions.find(
                (item) => item.value === rankingEntityToAdd,
            )?.label ?? rankingEntityToAdd;
        return `Top ${Math.max(1, Number(rankingLimitToAdd) || 1)} ${entityLabel.toLowerCase()}s by ${metricLabel(rankingMetricToAdd)} in ${previewScope(rankingScopeToAdd)}`;
    }

    function metricPreviewLabel(): string {
        const entityLabel =
            metricEntityOptions.find((item) => item.value === metricEntityToAdd)
                ?.label ?? metricEntityToAdd;
        const normalize = metricNormalizeByToAdd
            ? ` per ${metricLabel(metricNormalizeByToAdd)}`
            : "";
        return `${metricAggToAdd.toUpperCase()} ${entityLabel.toLowerCase()} ${metricLabel(metricMetricToAdd)}${normalize} in ${previewScope(metricScopeToAdd)}`;
    }

    function metricGlossary(): {
        metric: string;
        label: string;
        description: string;
    }[] {
        return metricsOptions.map((metric) => ({
            metric,
            label: metricLabel(metric),
            description: metricDescription(metric),
        }));
    }
</script>

<ModalShell {open} {title} size="xl" bodyClass="kpi-builder-modal-body" on:close={closeModal}>
    {#if description}
        <div class="ux-modal-intro">{description}</div>
    {/if}

    <div class="row g-3 kpi-builder-modal-grid">
                        <div class="col-12 col-lg-6">
                            <h6 class="ux-modal-section-title">Widget layout</h6>
                            {#if widgets.length === 0}
                                <div class="ux-modal-pane-copy kpi-builder-empty-state">
                                    No KPI cards yet.
                                </div>
                            {:else}
                                <div class="d-flex flex-column gap-2">
                                    {#each widgets as widget, idx}
                                        <div
                                            class="ux-modal-pane d-flex align-items-start justify-content-between gap-2 kpi-builder-row"
                                        >
                                            <div class="small flex-grow-1">
                                                <span class="text-muted me-1"
                                                    >#{idx + 1}</span
                                                >
                                                {widgetManagerLabel(widget)}
                                            </div>
                                            <div class="d-flex gap-1">
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-secondary"
                                                    on:click={() =>
                                                        moveWidget(
                                                            widget.id,
                                                            -1,
                                                        )}
                                                    disabled={idx === 0}
                                                >
                                                    Up
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-secondary"
                                                    on:click={() =>
                                                        moveWidget(
                                                            widget.id,
                                                            1,
                                                        )}
                                                    disabled={idx ===
                                                        widgets.length - 1}
                                                >
                                                    Down
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-danger"
                                                    on:click={() =>
                                                        removeWidget(widget.id)}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <div class="col-12 col-lg-6">
                            {#if showPresetSection && presetCardLabels}
                                <h6 class="ux-modal-section-title">Preset cards</h6>
                                <div class="d-flex flex-column gap-2 mb-3">
                                    {#each Object.keys(presetCardLabels) as key}
                                        {@const presetKey =
                                            key as PresetCardKey}
                                        <div
                                            class="ux-modal-pane d-flex align-items-center justify-content-between gap-2 kpi-builder-row"
                                        >
                                            <div>
                                                <div class="ux-modal-pane-title">
                                                    {presetCardLabels[
                                                        presetKey
                                                    ]}
                                                </div>
                                                <div class="ux-modal-pane-copy">
                                                    {presetCardDescriptions[
                                                        presetKey
                                                    ] ??
                                                        "Fixed KPI summary card."}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-secondary"
                                                on:click={() =>
                                                    addPresetCard(presetKey)}
                                                disabled={widgets.some(
                                                    (w) =>
                                                        w.kind === "preset" &&
                                                        w.key === presetKey,
                                                )}
                                            >
                                                Add
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            {#if showRankingSection}
                                <h6 class="ux-modal-section-title">Ranking card</h6>
                                <div class="row g-2 mb-2">
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-ranking-entity"
                                            >Entity</label
                                        >
                                        <select
                                            id="kpi-ranking-entity"
                                            class="form-select form-select-sm"
                                            bind:value={rankingEntityToAdd}
                                        >
                                            {#each rankingEntityOptions as option}
                                                <option value={option.value}
                                                    >{option.label}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-ranking-scope">Scope</label
                                        >
                                        <select
                                            id="kpi-ranking-scope"
                                            class="form-select form-select-sm"
                                            bind:value={rankingScopeToAdd}
                                        >
                                            {#each scopeOptions as option}
                                                <option value={option.value}
                                                    >{scopeOptionLabel(
                                                        option,
                                                    )}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-ranking-limit">Top N</label
                                        >
                                        <input
                                            id="kpi-ranking-limit"
                                            class="form-control form-control-sm"
                                            type="number"
                                            min="1"
                                            max="50"
                                            bind:value={rankingLimitToAdd}
                                        />
                                    </div>
                                    <div class="col-12">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-ranking-metric"
                                            >Metric</label
                                        >
                                        <select
                                            id="kpi-ranking-metric"
                                            class="form-select form-select-sm"
                                            bind:value={rankingMetricToAdd}
                                        >
                                            {#each metricsOptions as metric}
                                                <option value={metric}
                                                    >{metricLabel(
                                                        metric,
                                                    )}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                                <div class="ux-modal-preview mb-2">
                                    <div class="small fw-semibold">Preview</div>
                                    <div class="small">
                                        {rankingPreviewLabel()}
                                    </div>
                                    <div class="small text-muted">
                                        {metricDescription(rankingMetricToAdd)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary w-100 mb-3"
                                    on:click={addRankingCard}
                                    disabled={!canAddRanking}
                                >
                                    Add ranking card
                                </button>
                                {#if !canAddRanking && canAddRankingReason}
                                    <div class="small text-warning mb-3">
                                        {canAddRankingReason}
                                    </div>
                                {/if}
                            {/if}

                            {#if showMetricSection}
                                <h6 class="ux-modal-section-title">Metric card</h6>
                                <div class="row g-2 mb-2">
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-metric-entity"
                                            >Entity</label
                                        >
                                        <select
                                            id="kpi-metric-entity"
                                            class="form-select form-select-sm"
                                            bind:value={metricEntityToAdd}
                                        >
                                            {#each metricEntityOptions as option}
                                                <option value={option.value}
                                                    >{option.label}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-metric-scope">Scope</label
                                        >
                                        <select
                                            id="kpi-metric-scope"
                                            class="form-select form-select-sm"
                                            bind:value={metricScopeToAdd}
                                        >
                                            {#each scopeOptions as option}
                                                <option value={option.value}
                                                    >{scopeOptionLabel(
                                                        option,
                                                    )}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-metric-agg"
                                            >Aggregation</label
                                        >
                                        <select
                                            id="kpi-metric-agg"
                                            class="form-select form-select-sm"
                                            bind:value={metricAggToAdd}
                                        >
                                            <option value="sum">Sum</option>
                                            <option value="avg">Average</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-metric-metric"
                                            >Metric</label
                                        >
                                        <select
                                            id="kpi-metric-metric"
                                            class="form-select form-select-sm"
                                            bind:value={metricMetricToAdd}
                                        >
                                            {#each metricsOptions as metric}
                                                <option value={metric}
                                                    >{metricLabel(
                                                        metric,
                                                    )}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label
                                            class="form-label small mb-1"
                                            for="kpi-metric-normalize"
                                            >Normalize by (optional)</label
                                        >
                                        <select
                                            id="kpi-metric-normalize"
                                            class="form-select form-select-sm"
                                            bind:value={metricNormalizeByToAdd}
                                        >
                                            <option value=""
                                                >No normalization</option
                                            >
                                            {#each metricsOptions as metric}
                                                <option value={metric}
                                                    >Per {metricLabel(
                                                        metric,
                                                    )}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                                <div class="ux-modal-preview mb-2">
                                    <div class="small fw-semibold">Preview</div>
                                    <div class="small">
                                        {metricPreviewLabel()}
                                    </div>
                                    <div class="small text-muted">
                                        {metricDescription(metricMetricToAdd)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary w-100"
                                    on:click={addMetricCard}
                                    disabled={!canAddMetric}
                                >
                                    Add metric card
                                </button>
                                {#if !canAddMetric && canAddMetricReason}
                                    <div class="small text-warning mt-2">
                                        {canAddMetricReason}
                                    </div>
                                {/if}
                            {/if}

                            {#if showMetricGlossary && metricsOptions.length > 0}
                                <hr />
                                <details>
                                    <summary
                                        class="small fw-semibold cursor-pointer"
                                    >
                                        Metric glossary
                                    </summary>
                                    <div class="mt-2 d-flex flex-column gap-2">
                                        {#each metricGlossary() as item}
                                            <div class="ux-modal-pane">
                                                <div class="ux-modal-pane-title">
                                                    {item.label}
                                                </div>
                                                <div class="ux-modal-pane-copy">
                                                    {item.description}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                </details>
                            {/if}

                            {#if showAavaHint && aavaHref}
                                <hr />
                                <a
                                    class="btn btn-sm btn-outline-secondary w-100"
                                    href={aavaHref}
                                >
                                    Add AAvA widgets from the AAvA page
                                </a>
                            {/if}
                        </div>
                    </div>
</ModalShell>

<style>
    .kpi-builder-modal-grid {
        --bs-gutter-x: 0.72rem;
        --bs-gutter-y: 0.45rem;
    }

    .kpi-builder-row {
        min-width: 0;
    }

    .kpi-builder-empty-state {
        margin: 0;
        padding: 0.32rem 0;
    }

    :global(.kpi-builder-modal-body) {
        padding-top: 0.4rem !important;
        padding-bottom: 0.48rem !important;
    }

    :global(.kpi-builder-modal-body .ux-modal-pane) {
        padding: 0.38rem 0.46rem;
    }

    :global(.kpi-builder-modal-body .ux-modal-preview) {
        padding: 0.36rem 0.44rem;
    }

    :global(.kpi-builder-modal-body .btn.btn-sm) {
        min-height: 1.42rem;
        padding-top: 0.04rem !important;
        padding-bottom: 0.04rem !important;
    }

    :global(.kpi-builder-modal-body .ux-modal-section-title) {
        margin-bottom: 0.18rem;
    }

    :global(.kpi-builder-modal-body .row.g-2) {
        --bs-gutter-x: 0.48rem;
        --bs-gutter-y: 0.28rem;
    }

    :global(.kpi-builder-modal-body .mb-3) {
        margin-bottom: 0.55rem !important;
    }

    :global(.kpi-builder-modal-body .mb-2) {
        margin-bottom: 0.38rem !important;
    }

    :global(.kpi-builder-modal-body .mt-2) {
        margin-top: 0.28rem !important;
    }
</style>
