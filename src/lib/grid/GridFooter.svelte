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
        const widthClass = column.widthHint === "wide"
            ? "ux-grid-column-wide"
            : column.widthHint === "text"
              ? "ux-grid-column-text"
              : "ux-grid-column-fit";
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
        {#each columns as column, index (column.key)}
            <th class={`ux-summary-cell ${columnClass(column)}`.trim()} class:ux-grid-last-data-column={index === columns.length - 1}>
                {#if column.summary === "sum-avg" && summaryByColumnKey[column.key]}
                    <div class="ux-summary-values">
                        <span>&Sigma; {formatSummaryValue(summaryByColumnKey[column.key].sum)}</span>
                        <span>x&#772; {formatSummaryValue(summaryByColumnKey[column.key].avg)}</span>
                    </div>
                {/if}
            </th>
        {/each}
        <th class="ux-grid-filler-column" aria-hidden="true"></th>
    </tr>
</tfoot>

<style>
    .ux-summary-actions {
        min-width: 3.1rem;
        width: 3.1rem;
        max-width: 3.1rem;
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
        white-space: nowrap;
        overflow-wrap: normal;
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

    :global(.ux-grid-shell tfoot th.ux-grid-column-wide) {
        width: 13rem;
        min-width: 8rem;
        max-width: none;
    }

    :global(.ux-grid-shell tfoot th.ux-grid-column-text) {
        width: 8.5rem;
        min-width: 6rem;
        max-width: none;
    }

    :global(.ux-grid-shell tfoot th.ux-grid-column-fit) {
        width: auto;
        min-width: 0;
        max-width: none;
        white-space: nowrap;
    }

    :global(.ux-grid-shell tfoot th) {
        font-weight: 400;
        border-top: 1px solid var(--ux-grid-divider);
        border-left: 0;
        border-bottom: 0;
        background: var(--ux-grid-footer-surface);
        box-shadow: inset 0 1px 0 var(--ux-grid-divider);
    }

    :global(.ux-grid-table-wrap-all .ux-grid-table tfoot th) {
        position: sticky;
        bottom: 0;
        z-index: 7;
        background: var(--ux-grid-sticky-surface);
    }

    @media (max-width: 640px) {
        .ux-summary-cell {
            padding: 0.16rem 0.28rem;
        }

        :global(.ux-grid-shell tfoot th.ux-grid-column-wide) {
            min-width: 6.6rem;
        }

        :global(.ux-grid-shell tfoot th.ux-grid-column-text) {
            min-width: 4.8rem;
        }

        :global(.ux-grid-shell tfoot th.ux-grid-column-fit) {
            min-width: 0;
        }
    }
</style>
