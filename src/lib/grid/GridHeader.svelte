<script lang="ts">
    import { createEventDispatcher } from "svelte";
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

    function columnClass(column: GridColumnDefinition): string {
        const widthClass = column.filterable
            ? "ux-grid-column-text"
            : "ux-grid-column-compact";
        return `${widthClass} ${column.toneClass ?? ""}`.trim();
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
</script>

<thead class="table-info">
    <tr>
        <th scope="col" class="ux-grid-lead-header">#</th>
        {#each columns as column}
            <th
                scope="col"
                class={columnClass(column)}
                class:ux-grid-column-drop-target={dragOverKey === column.key && dragKey !== column.key}
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
                    {#if column.filterable}
                        <input
                            class="form-control form-control-sm"
                            type="search"
                            placeholder={`Filter ${column.title}`}
                            value={filters[column.key] ?? ""}
                            on:input={(event) =>
                                dispatch("filterChange", {
                                    key: column.key,
                                    value: (event.currentTarget as HTMLInputElement)
                                        .value,
                                })}
                            aria-label={`Filter ${column.title}`}
                        />
                    {/if}
                </div>
            </th>
        {/each}
    </tr>
</thead>

<style>
    .ux-grid-lead-header,
    .ux-grid-filter-spacer {
        min-width: 2.5rem;
        width: 2.5rem;
    }

    .ux-grid-header-stack {
        display: grid;
        gap: 0.18rem;
        align-items: start;
    }

    .ux-grid-header-label {
        display: block;
        font-size: 0.72rem;
        line-height: 1.2;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    .ux-grid-sort {
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 0.25rem;
        width: 100%;
        color: inherit;
        font-size: 0.72rem;
        line-height: 1.1;
        text-align: left;
    }

    .ux-grid-sort-text {
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    .ux-grid-sort-indicator {
        flex: 0 0 auto;
        font-size: 0.78em;
        opacity: 0.75;
    }

    .ux-grid-column-drop-target {
        background: rgba(13, 110, 253, 0.08);
        box-shadow: inset 0 0 0 1px rgba(13, 110, 253, 0.28);
    }

    :global(.ux-grid-shell thead th) {
        min-width: 0;
        padding: 0.22rem 0.38rem;
        vertical-align: top;
    }

    :global(.ux-grid-table-wrap-all .ux-grid-table thead th) {
        position: sticky;
        top: 0;
        z-index: 8;
        background: rgba(248, 250, 252, 0.97);
        box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.08);
    }

    :global(.ux-grid-shell thead input.form-control) {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        padding: 0.12rem 0.2rem;
        font-size: 0.67rem;
        line-height: 1.1;
    }

    :global(.ux-grid-shell thead th.ux-grid-column-text) {
        width: 6.4rem;
        min-width: 6.4rem;
        max-width: 6.4rem;
    }

    :global(.ux-grid-shell thead th.ux-grid-column-compact) {
        width: 4.6rem;
        min-width: 4.6rem;
        max-width: 4.6rem;
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
            padding: 0.16rem 0.28rem;
        }

        :global(.ux-grid-shell thead input.form-control) {
            padding: 0.1rem 0.16rem;
        }

        :global(.ux-grid-shell thead th.ux-grid-column-text) {
            width: 5.2rem;
            min-width: 5.2rem;
            max-width: 5.2rem;
        }

        :global(.ux-grid-shell thead th.ux-grid-column-compact) {
            width: 4rem;
            min-width: 4rem;
            max-width: 4rem;
        }
    }
</style>
