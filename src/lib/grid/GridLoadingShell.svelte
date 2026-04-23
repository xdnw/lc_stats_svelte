<script lang="ts">
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

    function loadingColumnClass(column: LoadingColumn): string {
        const widthClass = column.widthHint === "wide"
            ? "ux-grid-column-wide"
            : column.widthHint === "text"
              ? "ux-grid-column-text"
              : "ux-grid-column-fit";
        return widthClass;
    }
</script>

<div class="ux-grid-shell ux-grid-loading-shell" aria-live="polite" aria-label={loadingMessage}>
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

<style>
    .ux-grid-shell {
        --ux-grid-divider: color-mix(in srgb, var(--ux-border) 82%, transparent);
        --ux-grid-header-surface: color-mix(in srgb, var(--ux-surface-alt) 92%, var(--ux-surface));
        --ux-grid-footer-surface: color-mix(in srgb, var(--ux-surface-alt) 90%, var(--ux-surface));
        --ux-grid-skeleton-low: color-mix(in srgb, var(--ux-border) 30%, transparent);
        --ux-grid-skeleton-high: color-mix(in srgb, var(--ux-text-muted) 28%, transparent);
        position: relative;
        min-width: 0;
        padding: 0.5rem;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface) 98%, transparent);
        box-shadow: none;
    }

    .ux-grid-loading-shell {
        display: grid;
        gap: 0.45rem;
    }

    .ux-grid-loading-toolbar {
        display: flex;
        gap: 0.5rem;
    }

    .ux-grid-table-region {
        position: relative;
        display: flex;
        justify-content: flex-start;
        width: 100%;
    }

    .ux-grid-table-wrap {
        position: relative;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
    }

    .ux-grid-table {
        width: max-content;
        min-width: 100%;
        max-width: none;
        border-collapse: collapse;
        table-layout: auto;
        font-size: 0.72rem;
        line-height: 1.22;
    }

    .ux-grid-table th,
    .ux-grid-table td {
        border-right: 1px solid var(--ux-grid-divider);
    }

    .ux-grid-table tr > :last-child {
        border-right: 0;
    }

    .ux-grid-lead-header,
    .ux-grid-lead-cell {
        min-width: 3.1rem;
        width: 3.1rem;
        max-width: 3.1rem;
        white-space: nowrap;
    }

    .ux-grid-lead-header,
    .ux-grid-table thead th {
        padding: 0.12rem 0.26rem;
        vertical-align: middle;
        background: var(--ux-grid-header-surface);
        box-shadow: inset 0 -1px 0 var(--ux-grid-divider);
    }

    .ux-grid-table tbody td {
        padding: 0.18rem 0.32rem;
        border-bottom: 1px solid var(--ux-grid-divider);
        background: color-mix(in srgb, var(--ux-surface-alt) 68%, transparent);
    }

    .ux-grid-table tfoot th {
        padding: 0.18rem 0.38rem;
        border-top: 1px solid var(--ux-grid-divider);
        border-bottom: 0;
        background: var(--ux-grid-footer-surface);
        box-shadow: inset 0 1px 0 var(--ux-grid-divider);
    }

    .ux-grid-column-wide {
        width: 13rem;
        min-width: 8rem;
        max-width: none;
    }

    .ux-grid-column-text {
        width: 8.5rem;
        min-width: 6rem;
        max-width: none;
    }

    .ux-grid-column-fit {
        width: auto;
        min-width: 0;
        max-width: none;
        white-space: nowrap;
    }

    .ux-grid-filler-column {
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        padding: 0 !important;
        border-left: 0 !important;
        border-right: 0 !important;
        box-shadow: none !important;
    }

    .ux-grid-last-data-column {
        border-right: 0 !important;
    }

    .ux-grid-table-loading-row {
        pointer-events: none;
    }

    .ux-grid-skeleton {
        display: block;
        border-radius: 0.25rem;
        background: linear-gradient(
            90deg,
            var(--ux-grid-skeleton-low) 0%,
            var(--ux-grid-skeleton-high) 50%,
            var(--ux-grid-skeleton-low) 100%
        );
        background-size: 200% 100%;
        animation: ux-grid-skeleton-shimmer 1.25s ease-in-out infinite;
    }

    .ux-grid-skeleton-button {
        width: 8.5rem;
        height: 1.75rem;
    }

    .ux-grid-skeleton-header {
        height: 0.92rem;
    }

    .ux-grid-skeleton-footer {
        height: 0.76rem;
    }

    .ux-grid-skeleton-cell {
        height: max(0.9rem, calc(var(--ux-grid-row-height, 24px) - 0.35rem));
    }

    @keyframes ux-grid-skeleton-shimmer {
        0% {
            background-position: 200% 0;
        }

        100% {
            background-position: -200% 0;
        }
    }

    @media (max-width: 640px) {
        .ux-grid-shell {
            padding: 0.5rem;
        }

        .ux-grid-table {
            font-size: 0.69rem;
        }

        .ux-grid-table thead th {
            padding: 0.1rem 0.2rem;
        }

        .ux-grid-table tbody td {
            padding: 0.14rem 0.24rem;
        }

        .ux-grid-table tfoot th {
            padding: 0.16rem 0.28rem;
        }

        .ux-grid-column-wide {
            min-width: 6.6rem;
        }

        .ux-grid-column-text {
            min-width: 4.8rem;
        }
    }
</style>