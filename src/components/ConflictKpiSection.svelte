<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { ConflictKpiRankingRow } from "$lib/conflictGrid/protocol";
    import type {
        CoalitionSummaryRow,
        OffWarsPerNationStats,
    } from "$lib/conflictKpiPresetComputations";
    import type {
        ConflictKPIWidget,
    } from "$lib/kpi";

    type KpiSectionEvents = {
        toggleCollapse: undefined;
        startDrag: { id: string };
        endDrag: undefined;
        dropOn: { id: string };
        removeWidget: { id: string };
    };

    export let visible = false;
    export let presetReady = false;
    export let kpiWidgets: ConflictKPIWidget[] = [];
    export let draggingWidgetId: string | null = null;

    export let durationSoFar = "N/A";
    export let warsTracked: number | null = null;
    export let totalDamage: number | null = null;
    export let damageGap: number | null = null;
    export let leadingCoalition: CoalitionSummaryRow | null = null;
    export let coalitionSummary: CoalitionSummaryRow[] | null = null;
    export let offWarsPerNationStats: OffWarsPerNationStats | null = null;
    export let secondaryReady = false;
    export let rankingRowsByWidgetId: Record<
        string,
        ConflictKpiRankingRow[] | undefined
    > = {};
    export let metricValuesByWidgetId: Record<
        string,
        number | null | undefined
    > = {};

    export let formatKpiNumber: (value: number | null | undefined) => string;
    export let metricLabel: (metric: string) => string;
    export let widgetScopeLabel: (widget: ConflictKPIWidget) => string;
    export let getAavaMetricLabel: (metric: string, header: string) => string;

    const dispatch = createEventDispatcher<KpiSectionEvents>();
</script>

{#if visible}
    <div class="ux-surface ux-kpi-section mb-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
            <h5 class="m-0 ux-kpi-heading">KPI</h5>
            <button
                type="button"
                class="btn-close ux-kpi-section-close"
                aria-label="Hide KPI"
                on:click={() => dispatch("toggleCollapse")}
            ></button>
        </div>

        <div class="row g-1">
            {#each kpiWidgets as card}
                <div class={card.kind === "ranking" ? "col-12 col-lg-6" : "col-12 col-sm-6 col-xl-4"}>
                    <div
                        class="ux-surface ux-kpi-card h-100 position-relative kpi-card"
                        class:kpi-card-dragging={draggingWidgetId === card.id}
                        class:ux-kpi-card-preset={card.kind === "preset"}
                        class:ux-kpi-card-ranking={card.kind === "ranking"}
                        class:ux-kpi-card-metric={card.kind === "metric"}
                        role="group"
                        draggable="true"
                        on:dragstart={() => dispatch("startDrag", { id: card.id })}
                        on:dragend={() => dispatch("endDrag")}
                        on:dragover|preventDefault
                        on:drop|preventDefault={() => dispatch("dropOn", { id: card.id })}
                    >
                        <button
                            type="button"
                            class="btn-close kpi-card-close"
                            aria-label="Remove KPI card"
                            on:click={() => dispatch("removeWidget", { id: card.id })}
                        ></button>
                        <div
                            class="ux-kpi-card-content"
                            class:ux-kpi-card-content-preset={card.kind === "preset"}
                            class:ux-kpi-card-content-ranking={card.kind === "ranking"}
                            class:ux-kpi-card-content-metric={card.kind === "metric"}
                        >
                        {#if card.kind === "preset"}
                            {#if !presetReady}
                                <div class="ux-kpi-card-label">Loading preset KPI...</div>
                                <div class="ux-kpi-card-value">-</div>
                            {:else if card.key === "duration"}
                                <div class="ux-kpi-card-label">Duration</div>
                                <div class="ux-kpi-card-value">{durationSoFar}</div>
                            {:else if card.key === "wars"}
                                <div class="ux-kpi-card-label">Wars tracked</div>
                                <div class="ux-kpi-card-value">{formatKpiNumber(warsTracked)}</div>
                            {:else if card.key === "damage-total"}
                                <div class="ux-kpi-card-label">Total damage exchanged</div>
                                <div class="ux-kpi-card-value">{formatKpiNumber(totalDamage)}</div>
                            {:else if card.key === "net-gap"}
                                <div class="ux-kpi-card-label">Damage gap</div>
                                <div class="ux-kpi-card-value">{formatKpiNumber(damageGap)}</div>
                                {#if leadingCoalition}
                                    <div class="ux-kpi-card-note">Lead: {leadingCoalition.name}</div>
                                {/if}
                            {:else if card.key === "c1-dealt"}
                                <div class="ux-kpi-card-label">
                                    {coalitionSummary?.[0]?.name ?? "Coalition 1"} dealt
                                </div>
                                <div class="ux-kpi-card-value">
                                    {formatKpiNumber(coalitionSummary?.[0]?.dealt)}
                                </div>
                            {:else if card.key === "c2-dealt"}
                                <div class="ux-kpi-card-label">
                                    {coalitionSummary?.[1]?.name ?? "Coalition 2"} dealt
                                </div>
                                <div class="ux-kpi-card-value">
                                    {formatKpiNumber(coalitionSummary?.[1]?.dealt)}
                                </div>
                            {:else if card.key === "off-wars-per-nation"}
                                <div class="ux-kpi-card-label">Offensive wars per nation</div>
                                <div class="ux-kpi-card-value">
                                    {offWarsPerNationStats
                                        ? offWarsPerNationStats.perNation.toFixed(2)
                                        : "N/A"}
                                </div>
                                {#if offWarsPerNationStats}
                                    <div class="ux-kpi-card-note">
                                        {formatKpiNumber(offWarsPerNationStats.totalOffWars)}
                                        offensive / {formatKpiNumber(offWarsPerNationStats.totalNations)}
                                        nations
                                    </div>
                                {/if}
                            {/if}
                        {:else if card.kind === "ranking"}
                            <div class="ux-kpi-card-label">
                                Top {card.limit}
                                {card.entity}s by
                                {card.source === "aava"
                                    ? getAavaMetricLabel(card.metric, card.aavaSnapshot?.header ?? "wars")
                                    : metricLabel(card.metric)}
                                ({widgetScopeLabel(card)})
                            </div>
                            {#if rankingRowsByWidgetId[card.id] === undefined && !secondaryReady}
                                <div class="ux-kpi-card-note">Loading ranking...</div>
                            {:else if (rankingRowsByWidgetId[card.id] ?? []).length === 0}
                                <div class="ux-kpi-card-note">No ranking data for this widget.</div>
                            {:else}
                                {@const rows = rankingRowsByWidgetId[card.id] ?? []}
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped m-0">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>{card.entity === "alliance" ? "Alliance" : "Nation"}</th>
                                                {#if card.entity === "nation"}
                                                    <th>Alliance</th>
                                                {/if}
                                                <th class="text-end">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each rows as row, i}
                                                <tr>
                                                    <td>{i + 1}</td>
                                                    <td>
                                                        {#if card.entity === "alliance"}
                                                            <a href={`https://politicsandwar.com/alliance/id=${row.allianceId}`}>{row.label}</a>
                                                        {:else}
                                                            <a href={`https://politicsandwar.com/nation/id=${row.nationId}`}>{row.label}</a>
                                                        {/if}
                                                    </td>
                                                    {#if card.entity === "nation"}
                                                        <td>
                                                            <a href={`https://politicsandwar.com/alliance/id=${row.allianceId}`}>{row.allianceName}</a>
                                                        </td>
                                                    {/if}
                                                    <td class="text-end">{row.valueText}</td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            {/if}
                        {:else}
                            <div class="ux-kpi-card-label">
                                {card.aggregation.toUpperCase()}
                                {card.entity}
                                {card.source === "aava"
                                    ? getAavaMetricLabel(card.metric, card.aavaSnapshot?.header ?? "wars")
                                    : metricLabel(card.metric)}
                                {card.normalizeBy
                                    ? ` per ${
                                          card.source === "aava"
                                              ? getAavaMetricLabel(
                                                    card.normalizeBy,
                                                    card.aavaSnapshot?.header ?? "wars",
                                                )
                                              : metricLabel(card.normalizeBy)
                                      }`
                                    : ""}
                                ({widgetScopeLabel(card)})
                            </div>
                            <div class="ux-kpi-card-value">
                                {#if metricValuesByWidgetId[card.id] === undefined && !secondaryReady}
                                    Loading...
                                {:else}
                                    {formatKpiNumber(metricValuesByWidgetId[card.id])}
                                {/if}
                            </div>
                        {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .ux-kpi-section {
        padding: 0.34rem 0.42rem !important;
    }

    .ux-kpi-heading {
        font-size: 0.98rem;
        font-weight: 600;
        letter-spacing: 0.01em;
    }

    .ux-kpi-card {
        padding: 0.4rem 0.42rem 0.36rem !important;
    }

    .kpi-card {
        padding-top: 0.28rem !important;
        cursor: move;
    }

    .ux-kpi-card-content {
        display: grid;
        gap: 0.28rem;
        align-content: start;
        min-height: 100%;
        padding-top: 0.06rem;
    }

    .ux-kpi-card-content-preset {
        min-height: 6.2rem;
    }

    .ux-kpi-card-content-metric {
        min-height: 5.2rem;
    }

    .ux-kpi-card-content-ranking {
        min-height: 8.8rem;
    }

    .ux-kpi-card-label {
        font-size: 0.74rem;
        line-height: 1.16;
        letter-spacing: 0.01em;
        color: var(--ux-text);
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .ux-kpi-card-value {
        font-size: 0.88rem;
        line-height: 1.14;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .ux-kpi-card-note {
        font-size: 0.68rem;
        line-height: 1.18;
        color: var(--ux-text-muted);
    }

    .ux-kpi-section-close {
        width: 1.06rem;
        height: 1.06rem;
    }

    .kpi-card :global(.table) {
        font-size: 0.72rem;
    }

    .kpi-card :global(.table-responsive) {
        margin-top: 0.04rem;
    }

    .kpi-card :global(.table-sm > :not(caption) > * > *) {
        padding: 0.18rem 0.28rem;
    }

    .kpi-card-close {
        position: absolute;
        top: 0.04rem;
        right: 0.04rem;
        width: 1rem;
        height: 1rem;
        z-index: 1;
    }

    .kpi-card-dragging {
        opacity: 0.6;
    }
</style>
