<script lang="ts">
    import { browser } from "$app/environment";
    import type { GridColumnDefinition, GridPageSize } from "./types";

    type LoadingColumn = Pick<GridColumnDefinition, "key" | "widthHint">;

    const GRID_LOADING_SKELETON_ROWS = 10;
    const GRID_LOADING_SKELETON_COLUMNS = 6;
    const GRID_LOADING_MIN_HEIGHT = 220;
    const DEFAULT_LOADING_COLUMNS: LoadingColumn[] = [
        { key: "name", widthHint: "wide" },
        { key: "alliance", widthHint: "text" },
        { key: "metric-1", widthHint: "fit" },
        { key: "metric-2", widthHint: "fit" },
        { key: "metric-3", widthHint: "fit" },
    ];

    export let columns: LoadingColumn[] = [];
    export let loadingMessage = "Loading table...";
    export let caption = "Data grid";
    export let allRowsHeight = 560;
    export let rowHeight = 22;
    export let pageSize: GridPageSize | null = null;
    export let showToolbar = true;

    $: loadingBodyColumns =
        columns.length > 0
            ? columns.slice(0, Math.max(1, GRID_LOADING_SKELETON_COLUMNS - 1))
            : DEFAULT_LOADING_COLUMNS;
    $: loadingUsesAllRowsHeight = pageSize === "all";
    $: loadingShellHeight = loadingUsesAllRowsHeight
        ? allRowsHeight
        : Math.max(
              GRID_LOADING_MIN_HEIGHT,
              Math.round(rowHeight * GRID_LOADING_SKELETON_ROWS + 72),
          );
    $: loadingRowPlaceholders = Array.from(
        { length: GRID_LOADING_SKELETON_ROWS },
        (_, index) => index,
    );

    if (browser) {
        void import("./grid-loading-shell.css");
    }

    function loadingColumnClass(column: LoadingColumn): string {
        const widthClass = column.widthHint === "wide"
            ? "ux-grid-column-wide"
            : column.widthHint === "text"
              ? "ux-grid-column-text"
              : "ux-grid-column-fit";
        return widthClass;
    }
</script>

<div
    class="ux-grid-loading-shell-root ux-grid-loading-shell"
    aria-live="polite"
    aria-label={loadingMessage}
>
    {#if showToolbar}
        <div class="ux-grid-loading-toolbar" aria-hidden="true">
            <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
            <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
        </div>
    {/if}

    <div class="ux-grid-table-region">
        <div class="ux-grid-table-wrap" style={`min-height:${loadingShellHeight}px;`} aria-hidden="true">
            <table class="ux-grid-table table mb-0">
                <caption class="visually-hidden">{caption}</caption>
                <thead>
                    <tr>
                        <th class="ux-grid-lead-header">
                            <span class="ux-grid-skeleton ux-grid-skeleton-header"></span>
                        </th>
                        {#each loadingBodyColumns as column, index (column.key)}
                            <th
                                class={loadingColumnClass(column)}
                                class:ux-grid-last-data-column={index === loadingBodyColumns.length - 1}
                            >
                                <span class="ux-grid-skeleton ux-grid-skeleton-header"></span>
                            </th>
                        {/each}
                        <th class="ux-grid-filler-column" aria-hidden="true"></th>
                    </tr>
                </thead>
                <tbody class="ux-grid-table-loading-body">
                    {#each loadingRowPlaceholders as placeholder (placeholder)}
                        <tr class="ux-grid-table-loading-row" data-placeholder={placeholder}>
                            <td class="ux-grid-lead-cell">
                                <span class="ux-grid-skeleton ux-grid-skeleton-cell"></span>
                            </td>
                            {#each loadingBodyColumns as column, index (column.key)}
                                <td
                                    class={loadingColumnClass(column)}
                                    class:ux-grid-last-data-column={index === loadingBodyColumns.length - 1}
                                >
                                    <span class="ux-grid-skeleton ux-grid-skeleton-cell"></span>
                                </td>
                            {/each}
                            <td class="ux-grid-filler-column" aria-hidden="true"></td>
                        </tr>
                    {/each}
                </tbody>
                <tfoot>
                    <tr>
                        <th class="ux-grid-lead-header">
                            <span class="ux-grid-skeleton ux-grid-skeleton-footer"></span>
                        </th>
                        {#each loadingBodyColumns as column, index (column.key)}
                            <th
                                class={loadingColumnClass(column)}
                                class:ux-grid-last-data-column={index === loadingBodyColumns.length - 1}
                            >
                                <span class="ux-grid-skeleton ux-grid-skeleton-footer"></span>
                            </th>
                        {/each}
                        <th class="ux-grid-filler-column" aria-hidden="true"></th>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>

    <div class="visually-hidden">{loadingMessage}</div>
</div>
