<script lang="ts">
    import { createEventDispatcher, tick } from "svelte";
    import type { GridColumnDefinition } from "./types";
    import { getGridInitialViewport, getGridVirtualWindow } from "./virtualization";

    type ModalShellComponent = typeof import("../../components/ModalShell.svelte").default;

    const GRID_COLUMN_MIN_ROWS = 48;
    const GRID_COLUMN_ROW_HEIGHT = 26;

    export let columns: GridColumnDefinition[] = [];
    export let visibleColumnKeys: string[] = [];
    export let columnOrderKeys: string[] = [];
    export let buttonLabel = "Customize Columns";

    const dispatch = createEventDispatcher<{
        toggleColumn: { key: string };
        showAllColumns: undefined;
        hideAllColumns: undefined;
        reorderColumn: { key: string; targetIndex: number };
    }>();

    let open = false;
    let searchValue = "";
    let orderIndexByKey = new Map<string, number>();
    let visibleKeySet = new Set<string>();
    let orderedColumns: GridColumnDefinition[] = [];
    let filteredColumns: GridColumnDefinition[] = [];
    let visibleFilteredColumns: GridColumnDefinition[] = [];
    let dragKey: string | null = null;
    let dragOverKey: string | null = null;
    let searchInput: HTMLInputElement | null = null;
    let listContainer: HTMLDivElement | null = null;
    let listViewportStart = 0;
    let listViewportEnd = 0;
    let listRowHeight = GRID_COLUMN_ROW_HEIGHT;
    let listTopSpacerPx = 0;
    let listBottomSpacerPx = 0;
    let listSyncFrame = 0;
    let listSignature = "";
    let lastListSignature = "";
    let lastOpen = false;
    let modalShellComponent: ModalShellComponent | null = null;
    let modalShellLoadPromise: Promise<void> | null = null;

    $: orderIndexByKey = new Map(
        columnOrderKeys.map((key, index) => [key, index]),
    );
    $: visibleKeySet = new Set(visibleColumnKeys);
    $: orderedColumns = [...columns].sort(
        (left, right) =>
            (orderIndexByKey.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
            (orderIndexByKey.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
    $: filteredColumns = orderedColumns.filter((column) => {
        return column.title
            .toLowerCase()
            .includes(searchValue.trim().toLowerCase());
    });
    $: visibleFilteredColumns = filteredColumns.slice(
        listViewportStart,
        listViewportEnd,
    );
    $: listTopSpacerPx = listViewportStart * listRowHeight;
    $: listBottomSpacerPx = Math.max(
        0,
        (filteredColumns.length - listViewportEnd) * listRowHeight,
    );
    $: listSignature = `${open ? 1 : 0}:${searchValue.trim().toLowerCase()}:${filteredColumns.length}`;
    $: if (open && listSignature !== lastListSignature) {
        lastListSignature = listSignature;
        void tick().then(() => resetListViewport(true));
    }
    $: if (!open && lastListSignature !== "") {
        lastListSignature = "";
        listViewportStart = 0;
        listViewportEnd = 0;
    }
    $: if (open && !lastOpen) {
        lastOpen = true;
        void tick().then(() => {
            searchInput?.focus();
            searchInput?.select();
        });
    } else if (!open && lastOpen) {
        lastOpen = false;
        searchValue = "";
        dragKey = null;
        dragOverKey = null;
    }

    function closeMenu(): void {
        open = false;
    }

    async function ensureModalShellLoaded(): Promise<void> {
        if (modalShellComponent) return;
        if (!modalShellLoadPromise) {
            modalShellLoadPromise = import("../../components/ModalShell.svelte")
                .then((module) => {
                    modalShellComponent = module.default;
                })
                .finally(() => {
                    modalShellLoadPromise = null;
                });
        }

        await modalShellLoadPromise;
    }

    function openColumnManager(): void {
        void ensureModalShellLoaded().then(() => {
            open = true;
        });
    }

    function startDrag(key: string): void {
        dragKey = key;
        dragOverKey = key;
    }

    function resetListViewport(scrollToTop = false): void {
        if (scrollToTop && listContainer) {
            listContainer.scrollTop = 0;
        }
        const nextWindow = getGridInitialViewport({
            totalRows: filteredColumns.length,
            containerHeight: listContainer?.clientHeight ?? 420,
            rowHeight: listRowHeight,
            minimumRows: GRID_COLUMN_MIN_ROWS,
        });
        listViewportStart = nextWindow.start;
        listViewportEnd = nextWindow.end;
        scheduleListMeasurement();
    }

    function scheduleListMeasurement(): void {
        requestAnimationFrame(() => {
            if (!listContainer) return;
            const rows = Array.from(
                listContainer.querySelectorAll(".ux-grid-colmgr-row"),
            );
            if (rows.length === 0) return;
            const heights = rows
                .slice(0, 12)
                .map((row) => row.getBoundingClientRect().height)
                .filter((value) => Number.isFinite(value) && value > 0);
            if (heights.length === 0) return;
            const nextHeight = Math.max(
                22,
                Math.round(
                    (heights.reduce((sum, value) => sum + value, 0) / heights.length) *
                        100,
                ) / 100,
            );
            if (Math.abs(nextHeight - listRowHeight) < 0.5) return;
            listRowHeight = nextHeight;
            syncListViewportToScroll(true);
        });
    }

    function syncListViewportToScroll(force = false): void {
        if (!listContainer) return;
        const nextWindow = getGridVirtualWindow({
            scrollTop: listContainer.scrollTop,
            containerHeight: listContainer.clientHeight || 420,
            rowHeight: listRowHeight,
            totalRows: filteredColumns.length,
            minimumRows: GRID_COLUMN_MIN_ROWS,
        });
        if (
            !force &&
            nextWindow.start === listViewportStart &&
            nextWindow.end === listViewportEnd
        ) {
            return;
        }
        listViewportStart = nextWindow.start;
        listViewportEnd = nextWindow.end;
    }

    function requestListViewportSync(): void {
        if (listSyncFrame !== 0) return;
        listSyncFrame = requestAnimationFrame(() => {
            listSyncFrame = 0;
            syncListViewportToScroll();
        });
    }

    function completeDrop(targetKey: string): void {
        if (!dragKey) return;
        const targetIndex = orderedColumns.findIndex((column) => column.key === targetKey);
        if (targetIndex < 0) return;
        dispatch("reorderColumn", { key: dragKey, targetIndex });
        dragKey = null;
        dragOverKey = null;
    }
</script>

<button
    type="button"
    class="btn ux-btn btn-sm"
    aria-expanded={open}
    aria-label={buttonLabel}
    on:click={openColumnManager}
>
    {buttonLabel}
</button>

{#if open && modalShellComponent}
    <svelte:component
        this={modalShellComponent}
        open={open}
        title={buttonLabel}
        size="lg"
        scrollable={false}
        on:close={closeMenu}
    >
        <div class="ux-grid-colmgr-shell">
        <div class="ux-grid-colmgr-toolbar">
            <div class="small ux-muted">Search columns. Drag table headers or rows here to reorder.</div>
            <input
                bind:this={searchInput}
                class="form-control form-control-sm"
                type="search"
                placeholder="Search columns"
                bind:value={searchValue}
                aria-label="Search columns"
            />
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <button class="btn ux-btn btn-sm" type="button" on:click={() => dispatch("showAllColumns", undefined)}>
                    Show all
                </button>
                <button class="btn ux-btn btn-sm" type="button" on:click={() => dispatch("hideAllColumns", undefined)}>
                    Hide all
                </button>
            </div>
        </div>
        <div
            class="ux-grid-colmgr-list"
            role="list"
            bind:this={listContainer}
            on:scroll={requestListViewportSync}
        >
            {#if filteredColumns.length === 0}
                <div class="small ux-muted ux-grid-colmgr-empty">No columns match your search.</div>
            {:else}
                {#if listTopSpacerPx > 0}
                    <div
                        class="ux-grid-colmgr-spacer"
                        aria-hidden="true"
                        style={`height:${listTopSpacerPx}px;`}
                    ></div>
                {/if}
            {/if}
            {#each visibleFilteredColumns as column}
                <div
                    class="ux-grid-colmgr-row"
                    role="listitem"
                    class:ux-grid-colmgr-row-over={dragOverKey === column.key}
                    draggable="true"
                    on:dragstart={() => startDrag(column.key)}
                    on:dragend={() => {
                        dragKey = null;
                        dragOverKey = null;
                    }}
                    on:dragover|preventDefault={() => {
                        dragOverKey = column.key;
                    }}
                    on:drop|preventDefault={() => completeDrop(column.key)}
                >
                    <label class="ux-grid-colmgr-toggle">
                        <input
                            class="ux-grid-colmgr-checkbox"
                            type="checkbox"
                            checked={visibleKeySet.has(column.key)}
                            disabled={column.alwaysVisible}
                            on:change={() => dispatch("toggleColumn", { key: column.key })}
                            on:pointerdown|stopPropagation
                            on:click|stopPropagation
                        />
                        <span class="small fw-semibold ux-grid-colmgr-label">{column.title}</span>
                    </label>
                </div>
            {/each}
            {#if filteredColumns.length > 0 && listBottomSpacerPx > 0}
                <div
                    class="ux-grid-colmgr-spacer"
                    aria-hidden="true"
                    style={`height:${listBottomSpacerPx}px;`}
                ></div>
            {/if}
        </div>
        <div class="d-flex justify-content-end pt-2">
            <button class="btn btn-outline-secondary btn-sm" type="button" on:click={closeMenu}>
                Close
            </button>
        </div>
        </div>
    </svelte:component>
{/if}

<style>
    .ux-grid-colmgr-shell {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 0.55rem;
        min-height: min(62vh, 30rem);
        height: min(72vh, 34rem);
        max-height: calc(100vh - 7rem);
        min-width: min(46rem, 100%);
        max-width: 100%;
    }

    .ux-grid-colmgr-toolbar {
        display: grid;
        gap: 0.5rem;
    }

    .ux-grid-colmgr-list {
        overflow: auto;
        display: grid;
        gap: 0;
        min-height: 0;
        max-height: none;
        padding-right: 0;
        border-top: 1px solid var(--ux-grid-divider);
    }

    .ux-grid-colmgr-empty {
        padding: 0.38rem 0.16rem;
    }

    .ux-grid-colmgr-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.08rem 0;
        border: 0;
        border-bottom: 1px solid var(--ux-grid-divider);
        border-radius: 0;
        background: transparent;
        cursor: grab;
    }

    .ux-grid-colmgr-row-over {
        background: var(--ux-grid-drop-target);
    }

    .ux-grid-colmgr-spacer {
        width: 100%;
        flex: 0 0 auto;
    }

    .ux-grid-colmgr-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        margin: 0;
        padding: 0.26rem 0.24rem;
        cursor: pointer;
        user-select: none;
    }

    .ux-grid-colmgr-checkbox {
        flex: 0 0 auto;
        margin: 0;
        width: 0.95rem;
        height: 0.95rem;
        cursor: pointer;
        appearance: none;
        border: 1px solid color-mix(in srgb, var(--ux-border) 88%, var(--ux-text-muted));
        border-radius: 0.22rem;
        background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
        display: inline-grid;
        place-items: center;
        transition:
            background-color 120ms ease,
            border-color 120ms ease,
            box-shadow 120ms ease;
    }

    .ux-grid-colmgr-checkbox::after {
        content: "";
        width: 0.46rem;
        height: 0.26rem;
        border-inline-start: 0.12rem solid #ffffff;
        border-block-end: 0.12rem solid #ffffff;
        transform: rotate(-45deg) scale(0.7);
        opacity: 0;
        transition: opacity 120ms ease;
    }

    .ux-grid-colmgr-checkbox:hover {
        border-color: color-mix(in srgb, var(--ux-brand) 48%, var(--ux-border));
    }

    .ux-grid-colmgr-checkbox:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ux-brand) 22%, transparent);
    }

    .ux-grid-colmgr-checkbox:checked {
        border-color: color-mix(in srgb, var(--ux-brand) 70%, var(--ux-border));
        background: color-mix(in srgb, var(--ux-brand) 82%, #ffffff);
    }

    .ux-grid-colmgr-checkbox:checked::after {
        opacity: 1;
    }

    .ux-grid-colmgr-checkbox:disabled {
        cursor: not-allowed;
        opacity: 0.72;
    }

    .ux-grid-colmgr-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ux-grid-colmgr-checkbox:disabled + .ux-grid-colmgr-label {
        opacity: 0.7;
    }

    @media (max-width: 640px) {
        .ux-grid-colmgr-shell {
            min-width: 0;
            height: min(68vh, calc(100vh - 8rem));
            min-height: 14rem;
        }
    }
</style>
