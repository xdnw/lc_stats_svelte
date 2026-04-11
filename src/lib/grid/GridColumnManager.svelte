<script lang="ts">
    import { createEventDispatcher, tick } from "svelte";
    import ModalShell from "../../components/ModalShell.svelte";
    import type { GridColumnDefinition } from "./types";
    import { getGridInitialViewport, getGridVirtualWindow } from "./virtualization";

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

    async function openModal(): Promise<void> {
        open = true;
        await tick();
        searchInput?.focus();
        searchInput?.select();
    }

    function closeModal(): void {
        open = false;
        searchValue = "";
        dragKey = null;
        dragOverKey = null;
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

<button class="btn ux-btn btn-sm fw-bold" type="button" on:click={openModal}>
    {buttonLabel}
</button>

<ModalShell open={open} title={buttonLabel} size="xl" on:close={closeModal}>
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
            <div class="small ux-muted">No columns match your search.</div>
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

    <div slot="footer">
        <button class="btn btn-outline-secondary" type="button" on:click={closeModal}>
            Close
        </button>
    </div>
</ModalShell>

<style>
    .ux-grid-colmgr-toolbar {
        display: grid;
        gap: 0.55rem;
    }

    .ux-grid-colmgr-list {
        overflow: auto;
        display: grid;
        gap: 0;
        max-height: min(65vh, 42rem);
        padding-right: 0.1rem;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
    }

    .ux-grid-colmgr-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.08rem 0;
        border: 0;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 0;
        background: transparent;
        cursor: grab;
    }

    .ux-grid-colmgr-row-over {
        background: rgba(13, 110, 253, 0.06);
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
        padding: 0.18rem 0.2rem;
        cursor: pointer;
        user-select: none;
    }

    .ux-grid-colmgr-checkbox {
        flex: 0 0 auto;
        margin: 0;
        width: 0.95rem;
        height: 0.95rem;
        cursor: pointer;
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
</style>
