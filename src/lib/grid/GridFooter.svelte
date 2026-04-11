<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { commafy } from "../formatting";
    import type {
        GridColumnDefinition,
        GridSummaryByColumnKey,
    } from "./types";

    export let columns: GridColumnDefinition[] = [];
    export let summaryByColumnKey: GridSummaryByColumnKey = {};
    export let allFilteredRowsSelected = false;

    const dispatch = createEventDispatcher<{
        toggleFilteredSelection: undefined;
    }>();

    function formatSummaryValue(value: number | null): string {
        if (value == null || !Number.isFinite(value)) return "";
        const rounded = Math.round(value * 100) / 100;
        return commafy(rounded);
    }

    function columnClass(column: GridColumnDefinition): string {
        const widthClass = column.filterable
            ? "ux-grid-column-text"
            : "ux-grid-column-compact";
        return `${widthClass} ${column.toneClass ?? ""}`.trim();
    }
</script>

<tfoot>
    <tr class="ux-summary-row">
        <th class="ux-summary-actions">
            <div class="d-flex align-items-center gap-2">
                <label class="ux-summary-toggle" title={allFilteredRowsSelected ? "Deselect all filtered" : "Select all filtered"}>
                    <input
                        class="form-check-input mt-0"
                        type="checkbox"
                        checked={allFilteredRowsSelected}
                        on:change={() => dispatch("toggleFilteredSelection", undefined)}
                        aria-label={allFilteredRowsSelected ? "Deselect all filtered" : "Select all filtered"}
                    />
                </label>
            </div>
        </th>
        {#each columns as column}
            <th class={`ux-summary-cell ${columnClass(column)}`.trim()}>
                {#if column.summary === "sum-avg" && summaryByColumnKey[column.key]}
                    <div class="ux-summary-values">
                        <span>&Sigma; {formatSummaryValue(summaryByColumnKey[column.key].sum)}</span>
                        <span>x&#772; {formatSummaryValue(summaryByColumnKey[column.key].avg)}</span>
                    </div>
                {/if}
            </th>
        {/each}
    </tr>
</tfoot>

<style>
    .ux-summary-actions {
        min-width: 2.5rem;
        width: 2.5rem;
    }

    .ux-summary-cell {
        vertical-align: top;
        padding: 0.18rem 0.38rem;
        font-weight: 400;
    }

    .ux-summary-values {
        display: flex;
        flex-direction: column;
        gap: 0.06rem;
        font-size: 0.64rem;
        line-height: 1.08;
        white-space: normal;
        overflow-wrap: anywhere;
        font-weight: 400;
    }

    .ux-summary-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.68rem;
        line-height: 1;
        white-space: nowrap;
    }

    :global(.ux-grid-shell tfoot th.ux-grid-column-text) {
        width: 6.4rem;
        min-width: 6.4rem;
        max-width: 6.4rem;
    }

    :global(.ux-grid-shell tfoot th.ux-grid-column-compact) {
        width: 4.6rem;
        min-width: 4.6rem;
        max-width: 4.6rem;
    }

    :global(.ux-grid-shell tfoot th) {
        font-weight: 400;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
        border-left: 0;
        border-bottom: 0;
    }

    :global(.ux-grid-table-wrap-all .ux-grid-table tfoot th) {
        position: sticky;
        bottom: 0;
        z-index: 7;
        background: rgba(248, 250, 252, 0.97);
        box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.08);
    }

    @media (max-width: 640px) {
        .ux-summary-cell {
            padding: 0.16rem 0.28rem;
        }

        :global(.ux-grid-shell tfoot th.ux-grid-column-text) {
            width: 5.2rem;
            min-width: 5.2rem;
            max-width: 5.2rem;
        }

        :global(.ux-grid-shell tfoot th.ux-grid-column-compact) {
            width: 4rem;
            min-width: 4rem;
            max-width: 4rem;
        }
    }
</style>
