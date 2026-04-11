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
    <div class="ux-surface p-2 mb-3 rounded border">
        <div class="d-flex align-items-center justify-content-between mb-2">
            <h5 class="m-0">KPI</h5>
            <button
                type="button"
                class="btn-close"
                aria-label="Hide KPI"
                on:click={() => dispatch("toggleCollapse")}
            ></button>
        </div>

        <div class="row g-2">
            {#each kpiWidgets as card}
                <div class={card.kind === "ranking" ? "col-12 col-lg-6" : "col-12 col-sm-6 col-xl-4"}>
                    <div
                        class="ux-surface p-3 rounded border h-100 position-relative kpi-card"
                        class:kpi-card-dragging={draggingWidgetId === card.id}
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
                        {#if card.kind === "preset"}
                            {#if !presetReady}
                                <div class="small text-muted">Loading preset KPI...</div>
                                <div class="h6 m-0">-</div>
                            {:else if card.key === "duration"}
                                <div class="small text-muted">Duration</div>
                                <div class="h6 m-0">{durationSoFar}</div>
                            {:else if card.key === "wars"}
                                <div class="small text-muted">Wars tracked</div>
                                <div class="h6 m-0">{formatKpiNumber(warsTracked)}</div>
                            {:else if card.key === "damage-total"}
                                <div class="small text-muted">Total damage exchanged</div>
                                <div class="h6 m-0">{formatKpiNumber(totalDamage)}</div>
                            {:else if card.key === "net-gap"}
                                <div class="small text-muted">Damage gap</div>
                                <div class="h6 m-0">{formatKpiNumber(damageGap)}</div>
                                {#if leadingCoalition}
                                    <div class="small text-muted">Lead: {leadingCoalition.name}</div>
                                {/if}
                            {:else if card.key === "c1-dealt"}
                                <div class="small text-muted">
                                    {coalitionSummary?.[0]?.name ?? "Coalition 1"} dealt
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(coalitionSummary?.[0]?.dealt)}
                                </div>
                            {:else if card.key === "c2-dealt"}
                                <div class="small text-muted">
                                    {coalitionSummary?.[1]?.name ?? "Coalition 2"} dealt
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(coalitionSummary?.[1]?.dealt)}
                                </div>
                            {:else if card.key === "off-wars-per-nation"}
                                <div class="small text-muted">Offensive wars per nation</div>
                                <div class="h6 m-0">
                                    {offWarsPerNationStats
                                        ? offWarsPerNationStats.perNation.toFixed(2)
                                        : "N/A"}
                                </div>
                                {#if offWarsPerNationStats}
                                    <div class="small text-muted">
                                        {formatKpiNumber(offWarsPerNationStats.totalOffWars)}
                                        offensive / {formatKpiNumber(offWarsPerNationStats.totalNations)}
                                        nations
                                    </div>
                                {/if}
                            {/if}
                        {:else if card.kind === "ranking"}
                            <div class="small text-muted mb-1">
                                Top {card.limit}
                                {card.entity}s by
                                {card.source === "aava"
                                    ? getAavaMetricLabel(card.metric, card.aavaSnapshot?.header ?? "wars")
                                    : metricLabel(card.metric)}
                                ({widgetScopeLabel(card)})
                            </div>
                            {#if rankingRowsByWidgetId[card.id] === undefined && !secondaryReady}
                                <div class="small text-muted">Loading ranking...</div>
                            {:else if (rankingRowsByWidgetId[card.id] ?? []).length === 0}
                                <div class="small text-muted">No ranking data for this widget.</div>
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
                            <div class="small text-muted">
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
                            <div class="h6 m-0">
                                {#if metricValuesByWidgetId[card.id] === undefined && !secondaryReady}
                                    Loading...
                                {:else}
                                    {formatKpiNumber(metricValuesByWidgetId[card.id])}
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}
