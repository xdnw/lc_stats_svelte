<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import GridFilterField from "./GridFilterField.svelte";
    import type { GridColumnDefinition, GridSort } from "./types";

    export let columns: GridColumnDefinition[] = [];
    export let sort: GridSort | null = null;
    export let filters: Record<string, string> = {};

    const dispatch = createEventDispatcher<{
        toggleSort: { key: string };
        filterChange: { key: string; value: string };
        reorderColumn: { key: string; targetKey: string };
    }>();

    let dragKey: string | null = null;
    let dragOverKey: string | null = null;

    function sortIndicator(column: GridColumnDefinition): string {
        if (sort?.key !== column.key) return column.sortable === false ? "" : "\u2195";
        return sort.dir === "asc" ? "\u2191" : "\u2193";
    }

    function widthClass(column: GridColumnDefinition): string {
        switch (column.widthHint) {
            case "wide":
                return "ux-grid-column-wide";
            case "text":
                return "ux-grid-column-text";
            default:
                return "ux-grid-column-fit";
        }
    }

    function columnClass(column: GridColumnDefinition): string {
        return `${widthClass(column)} ${column.toneClass ?? ""}`.trim();
    }

    function startColumnDrag(event: DragEvent, key: string): void {
        dragKey = key;
        dragOverKey = key;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", key);
        }
    }

    function noteColumnDragOver(key: string): void {
        if (!dragKey) return;
        dragOverKey = key;
    }

    function completeColumnDrop(targetKey: string): void {
        if (!dragKey || dragKey === targetKey) {
            dragKey = null;
            dragOverKey = null;
            return;
        }
        dispatch("reorderColumn", { key: dragKey, targetKey });
        dragKey = null;
        dragOverKey = null;
    }

    function clearColumnDrag(): void {
        dragKey = null;
        dragOverKey = null;
    }

    $: hasFilterRow = columns.some((column) => column.filterable);
</script>

<thead>
    <tr class="ux-grid-header-row">
        <th scope="col" class="ux-grid-lead-header" rowspan={hasFilterRow ? 2 : undefined}>#</th>
        {#each columns as column, index (column.key)}
            <th
                scope="col"
                class={columnClass(column)}
            class:ux-grid-last-data-column={index === columns.length - 1}
                class:ux-grid-column-drop-target={dragOverKey === column.key && dragKey !== column.key}
                rowspan={hasFilterRow && !column.filterable ? 2 : undefined}
                draggable={columns.length > 1}
                on:dragstart={(event) => startColumnDrag(event, column.key)}
                on:dragend={clearColumnDrag}
                on:dragover|preventDefault={() => noteColumnDragOver(column.key)}
                on:drop|preventDefault={() => completeColumnDrop(column.key)}
            >
                <div class="ux-grid-header-stack">
                    {#if column.sortable === false}
                        <span class="ux-grid-header-label" title={column.title}>{column.title}</span>
                    {:else}
                        <button
                            class="btn btn-link p-0 text-decoration-none fw-semibold ux-grid-sort"
                            type="button"
                            on:click={() => dispatch("toggleSort", { key: column.key })}
                            aria-label={`Sort by ${column.title}`}
                            title={column.title}
                        >
                            <span class="ux-grid-sort-text">{column.title}</span>
                            <span class="ux-grid-sort-indicator">{sortIndicator(column)}</span>
                        </button>
                    {/if}
                </div>
            </th>
        {/each}
        <th scope="col" class="ux-grid-filler-column" rowspan={hasFilterRow ? 2 : undefined} aria-hidden="true"></th>
    </tr>
    {#if hasFilterRow}
        <tr class="ux-grid-filter-row">
            {#each columns as column (column.key)}
                {#if column.filterable}
                    <th scope="col" class={columnClass(column)}>
                        <GridFilterField
                            {column}
                            value={filters[column.key] ?? ""}
                            on:change={(event) =>
                                dispatch("filterChange", {
                                    key: column.key,
                                    value: event.detail.value,
                                })}
                        />
                    </th>
                {/if}
            {/each}
        </tr>
    {/if}
</thead>

<style>
    .ux-grid-lead-header,
    .ux-grid-filter-spacer {
        min-width: 3.1rem;
        width: 3.1rem;
        max-width: 3.1rem;
        white-space: nowrap;
    }

    .ux-grid-header-stack {
        display: grid;
        gap: 0;
        align-items: center;
        align-content: center;
        min-height: 0.9rem;
    }

    .ux-grid-header-label {
        display: block;
        font-size: 0.7rem;
        line-height: 1.12;
        white-space: normal;
        overflow-wrap: break-word;
        word-break: normal;
    }

    .ux-grid-sort {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.14rem;
        width: 100%;
        min-height: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: inherit;
        font-size: 0.66rem;
        line-height: 1.05;
        text-align: left;
    }

    .ux-grid-sort-text {
        min-width: 0;
        white-space: normal;
        overflow-wrap: break-word;
        word-break: normal;
    }

    .ux-grid-sort-indicator {
        flex: 0 0 auto;
        font-size: 0.78em;
        opacity: 0.75;
    }

    .ux-grid-column-drop-target {
        background: var(--ux-grid-drop-target);
        box-shadow: inset 0 0 0 1px var(--ux-grid-drop-outline);
    }

    :global(.ux-grid-shell thead th) {
        min-width: 0;
        padding: 0.12rem 0.26rem;
        vertical-align: middle;
        background: var(--ux-grid-header-surface);
        box-shadow: inset 0 -1px 0 var(--ux-grid-divider);
    }

    :global(.ux-grid-shell thead .ux-grid-filter-row th) {
        padding-top: 0.08rem;
        padding-bottom: 0.1rem;
        padding-inline: 0;
        vertical-align: top;
    }

    :global(.ux-grid-table-wrap-all .ux-grid-table thead th) {
        position: sticky;
        top: 0;
        z-index: 8;
        background: var(--ux-grid-sticky-surface);
    }

    :global(.ux-grid-table-wrap-all .ux-grid-table thead .ux-grid-filter-row th) {
        top: 1.18rem;
        z-index: 7;
    }

    :global(.ux-grid-shell thead .ux-grid-filter-row > th > input.form-control) {
        display: block;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        min-height: 1.08rem;
        height: 1.08rem;
        padding: 0.04rem 0.12rem;
        font-size: 0.64rem;
        line-height: 1.1;
    }

    :global(.ux-grid-shell thead th.ux-grid-column-wide) {
        width: 13rem;
        min-width: 8rem;
        max-width: none;
    }

    :global(.ux-grid-shell thead th.ux-grid-column-text) {
        width: 8.5rem;
        min-width: 6rem;
        max-width: none;
    }

    :global(.ux-grid-shell thead th.ux-grid-column-fit) {
        width: auto;
        min-width: 0;
        max-width: none;
        white-space: nowrap;
    }

    :global(.ux-grid-shell thead th.ux-grid-tone-selected),
    :global(.ux-grid-shell tfoot th.ux-grid-tone-selected) {
        background: color-mix(in srgb, var(--ux-danger) 11%, var(--ux-surface));
    }

    :global(.ux-grid-shell thead th.ux-grid-tone-compared),
    :global(.ux-grid-shell tfoot th.ux-grid-tone-compared) {
        background: color-mix(in srgb, var(--ux-brand) 11%, var(--ux-surface));
    }

    @media (max-width: 640px) {
        :global(.ux-grid-shell thead th) {
            padding: 0.1rem 0.2rem;
        }

        :global(.ux-grid-shell thead .ux-grid-filter-row th) {
            padding-top: 0.08rem;
            padding-bottom: 0.1rem;
            padding-inline: 0;
        }

        :global(.ux-grid-shell thead .ux-grid-filter-row > th > input.form-control) {
            min-height: 1.08rem;
            height: 1.08rem;
            padding: 0.04rem 0.12rem;
        }

        :global(.ux-grid-shell thead th.ux-grid-column-wide) {
            min-width: 6.6rem;
        }

        :global(.ux-grid-shell thead th.ux-grid-column-text) {
            min-width: 4.8rem;
        }

        :global(.ux-grid-shell thead th.ux-grid-column-fit) {
            min-width: 0;
        }
    }
</style>
