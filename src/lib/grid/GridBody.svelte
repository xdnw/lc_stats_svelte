<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import GridCell from "./GridCell.svelte";
    import type {
        GridCellActionArgs,
        GridColumnDefinition,
        GridPageRow,
        GridRowId,
    } from "./types";

    export let columns: GridColumnDefinition[] = [];
    export let hiddenDetailColumns: GridColumnDefinition[] = [];
    export let rows: GridPageRow[] = [];
    export let detailRowsById: Record<string, GridPageRow | null | undefined> = {};
    export let expandedRowIds: GridRowId[] = [];
    export let selectedRowIds: GridRowId[] = [];
    export let displayStartIndex = 0;
    export let topSpacerPx = 0;
    export let bottomSpacerPx = 0;
    export let emptyMessage = "No rows match the current view.";

    const dispatch = createEventDispatcher<{
        toggleRowSelection: { rowId: GridRowId; shiftKey: boolean };
        toggleRowExpanded: { rowId: GridRowId };
        cellAction: {
            rowId: GridRowId;
            columnKey: string;
            actionId: string;
            args?: GridCellActionArgs;
        };
    }>();

    $: expandedSet = new Set(expandedRowIds);
    $: selectedSet = new Set(selectedRowIds);
    $: colspan = columns.length + 1;
    $: hasExpandableDetails = hiddenDetailColumns.length > 0;

    function detailRowKey(rowId: GridRowId): string {
        return String(rowId);
    }

    function hasInteractiveAncestor(target: EventTarget | null): boolean {
        if (!(target instanceof Element)) return false;
        return !!target.closest(
            'a, button, input, label, select, textarea, summary, [contenteditable="true"], [role="textbox"]',
        );
    }

    function hasActiveTextSelection(): boolean {
        if (typeof window === "undefined" || typeof window.getSelection !== "function") {
            return false;
        }
        const selection = window.getSelection();
        return !!selection && !selection.isCollapsed;
    }

    function handleRowClick(event: MouseEvent, rowId: GridRowId): void {
        if (!hasExpandableDetails) return;
        if (hasInteractiveAncestor(event.target)) return;
        if (hasActiveTextSelection()) return;
        dispatch("toggleRowExpanded", { rowId });
    }

    function cellClass(column: GridColumnDefinition): string {
        const widthClass = column.filterable
            ? "ux-grid-column-text"
            : "ux-grid-column-compact";
        return `${widthClass} ${column.toneClass ?? ""}`.trim();
    }
</script>

<tbody>
    {#if topSpacerPx > 0}
        <tr aria-hidden="true" class="ux-grid-spacer-row">
            <td colspan={colspan} style={`height:${topSpacerPx}px;padding:0;border:0;`}></td>
        </tr>
    {/if}

    {#if rows.length === 0}
        <tr>
            <td colspan={colspan} class="text-center text-muted py-4">{emptyMessage}</td>
        </tr>
    {/if}

    {#each rows as row, index}
        <tr
            class:ux-grid-row-selected={selectedSet.has(row.id)}
            class={row.rowClass ?? ""}
            on:click={(event) => handleRowClick(event, row.id)}
        >
            <td class="ux-grid-lead-cell">
                <div class="ux-grid-row-controls">
                    <label class="d-inline-flex align-items-center gap-1 m-0 ux-grid-row-index">
                        <input
                            class="form-check-input mt-0"
                            type="checkbox"
                            checked={selectedSet.has(row.id)}
                            on:click|stopPropagation={(event) =>
                                dispatch("toggleRowSelection", {
                                    rowId: row.id,
                                    shiftKey: (event as MouseEvent).shiftKey,
                                })}
                            aria-label={`Select row ${displayStartIndex + index + 1}`}
                        />
                        <span class="ux-grid-row-index-text">
                            <span>{displayStartIndex + index + 1}</span>
                        </span>
                    </label>
                </div>
            </td>
            {#each columns as column (column.key)}
                <td class={cellClass(column)}>
                    <GridCell
                        cell={row.cells[column.key] ?? { kind: "empty" }}
                        on:action={(event) =>
                            dispatch("cellAction", {
                                rowId: row.id,
                                columnKey: column.key,
                                actionId: event.detail.actionId,
                                args: event.detail.args,
                            })}
                    />
                </td>
            {/each}
        </tr>
        {#if expandedSet.has(row.id)}
            <tr class="ux-grid-details-row">
                <td colspan={colspan}>
                    {#if detailRowsById[detailRowKey(row.id)]}
                        <div class="ux-grid-details-list">
                            {#each hiddenDetailColumns as column (column.key)}
                                <div class="ux-grid-details-item">
                                    <div class="small text-muted">{column.title}</div>
                                    <div class="fw-semibold">
                                        <GridCell
                                            cell={detailRowsById[detailRowKey(row.id)]?.cells[column.key] ?? {
                                                kind: "empty",
                                            }}
                                            on:action={(event) =>
                                                dispatch("cellAction", {
                                                    rowId: row.id,
                                                    columnKey: column.key,
                                                    actionId: event.detail.actionId,
                                                    args: event.detail.args,
                                                })}
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="small text-muted">Loading row details...</div>
                    {/if}
                </td>
            </tr>
        {/if}
    {/each}

    {#if bottomSpacerPx > 0}
        <tr aria-hidden="true" class="ux-grid-spacer-row">
            <td colspan={colspan} style={`height:${bottomSpacerPx}px;padding:0;border:0;`}></td>
        </tr>
    {/if}
</tbody>

<style>
    .ux-grid-lead-cell {
        min-width: 2.75rem;
        width: 2.75rem;
        white-space: nowrap;
        padding: 0.2rem 0.28rem;
        font-size: 0.68rem;
    }

    .ux-grid-row-controls {
        display: flex;
        align-items: center;
        gap: 0.18rem;
    }

    .ux-grid-row-index {
        font-size: 0.68rem;
        line-height: 1;
    }

    .ux-grid-row-index-text {
        display: inline-flex;
        align-items: center;
    }

    .ux-grid-details-row td {
        background: var(--ux-grid-detail-surface);
        max-width: none;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
    }

    .ux-grid-details-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        gap: 0.75rem;
    }

    .ux-grid-details-item {
        padding: 0.35rem 0.5rem;
        border-left: 3px solid var(--ux-grid-detail-accent);
    }

    :global(.ux-grid-shell tbody td) {
        padding: 0.22rem 0.38rem;
        font-size: 0.72rem;
        line-height: 1.22;
        vertical-align: top;
        border-top: 0;
        border-left: 0;
        border-bottom: 1px solid var(--ux-grid-divider);
        overflow-wrap: anywhere;
    }

    :global(.ux-grid-shell tbody td.ux-grid-column-text) {
        width: 6.4rem;
        min-width: 6.4rem;
        max-width: 6.4rem;
    }

    :global(.ux-grid-shell tbody td.ux-grid-column-compact) {
        width: 4.6rem;
        min-width: 4.6rem;
        max-width: 4.6rem;
    }

    @media (max-width: 640px) {
        :global(.ux-grid-shell tbody td) {
            padding: 0.16rem 0.28rem;
        }

        :global(.ux-grid-shell tbody td.ux-grid-column-text) {
            width: 5.2rem;
            min-width: 5.2rem;
            max-width: 5.2rem;
        }

        :global(.ux-grid-shell tbody td.ux-grid-column-compact) {
            width: 4rem;
            min-width: 4rem;
            max-width: 4rem;
        }
    }

    :global(.ux-grid-shell tbody tr:hover > td) {
        background: var(--ux-grid-row-hover);
    }

    :global(.ux-grid-shell tbody tr.ux-grid-row-selected > td) {
        background: var(--ux-grid-row-selected);
    }

    :global(.ux-grid-shell tbody tr.ux-conflict-row-c1 > td) {
        background: var(--ux-grid-row-c1);
    }

    :global(.ux-grid-shell tbody tr.ux-conflict-row-c2 > td) {
        background: var(--ux-grid-row-c2);
    }

    :global(.ux-grid-shell tbody tr.ux-conflicts-row-active > td) {
        background: var(--ux-grid-row-active);
    }

    :global(.ux-grid-shell tbody tr.ux-conflicts-row-recent > td) {
        background: var(--ux-grid-row-recent);
    }

    :global(.ux-grid-shell tbody tr.ux-conflicts-row-ended > td) {
        background: var(--ux-grid-row-ended);
    }

    :global(.ux-grid-shell tbody td.ux-grid-tone-selected) {
        background: color-mix(in srgb, var(--ux-danger) 10%, var(--ux-surface));
    }

    :global(.ux-grid-shell tbody td.ux-grid-tone-compared) {
        background: color-mix(in srgb, var(--ux-brand) 10%, var(--ux-surface));
    }

    :global(.ux-grid-shell tbody tr:hover > td.ux-grid-tone-selected) {
        background: color-mix(in srgb, var(--ux-danger) 15%, var(--ux-surface));
    }

    :global(.ux-grid-shell tbody tr:hover > td.ux-grid-tone-compared) {
        background: color-mix(in srgb, var(--ux-brand) 15%, var(--ux-surface));
    }

    .ux-grid-details-row :global(.ux-grid-cell-text),
    .ux-grid-details-row :global(.ux-grid-cell-link) {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
    }

    .ux-grid-details-row :global(.ux-grid-stack) {
        flex-wrap: wrap;
        white-space: normal;
        overflow: visible;
    }
</style>
