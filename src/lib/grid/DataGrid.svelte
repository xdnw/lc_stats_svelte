<script lang="ts">
    import { createEventDispatcher, onMount, tick } from "svelte";
    import type { ExportMenuAction, ExportMenuDataset } from "../../components/exportMenuTypes";
    import {
        hideAllGridColumns,
        initializeGridController,
        moveGridColumnToIndex,
        reconcileGridController,
        setGridFilter,
        setGridPageIndex,
        setGridPageSize,
        showAllGridColumns,
        toggleGridAllFilteredRows,
        toggleGridColumnVisibility,
        toggleGridRowExpanded,
        toggleGridRowSelection,
        toggleGridSort,
    } from "./controller";
    import { exportGridData } from "./export";
    import { incrementPerfCounter, startPerfSpan } from "../perf";
    import {
        areGridPageResultsEqual,
        areGridSummaryByColumnKeyEqual,
    } from "./renderState";
    import GridBody from "./GridBody.svelte";
    import GridFooter from "./GridFooter.svelte";
    import GridHeader from "./GridHeader.svelte";
    import GridToolbar from "./GridToolbar.svelte";
    import { prepareGridTableForWidthMeasurement } from "./columnMeasurement";
    import { GRID_PAGE_SIZE_OPTIONS, getHiddenDetailColumns, getVisibleColumns, toGridQueryState } from "./state";
    import {
        getGridVisibleRange,
        getGridVirtualWindow,
        isGridRangeWithinWindow,
        resolveGridRowHeightEstimate,
        resolveGridVirtualMinimumRows,
        resolveGridVirtualWindowChunkCount,
        resolveGridRowWindow,
    } from "./virtualization";
    import type {
        GridBootstrapResult,
        GridCellActionArgs,
        GridControllerState,
        GridDataProvider,
        GridPageResult,
        GridPageSize,
        GridPageRow,
        GridQueryState,
        GridRowId,
        GridSummaryByColumnKey,
    } from "./types";

    const GRID_LOADING_SKELETON_ROWS = 10;
    const GRID_LOADING_SKELETON_COLUMNS = 6;
    const GRID_LOADING_MIN_HEIGHT = 220;
    const COMPACT_GRID_MAX_WIDTH = 640;

    export let provider: GridDataProvider | null = null;
    export let initialState: Partial<GridQueryState> | null = null;
    export let resetKey = "";
    export let exportBaseFileName = "data";
    export let exportDatasetKey = "grid";
    export let exportDatasetLabel = "Current table";
    export let exportButtonLabel = "Export data";
    export let columnButtonLabel = "Customize Columns";
    export let emptyMessage = "No rows match the current view.";
    export let loadingMessage = "Loading table...";
    export let caption = "Data grid";
    export let allRowsHeight = 560;
    export let rowHeight = 22;
    export let minVirtualRows = 48;

    const dispatch = createEventDispatcher<{
        ready: { bootstrap: GridBootstrapResult };
        queryResult: { result: GridPageResult };
        stateChange: { state: GridQueryState };
        selectionChange: { selectedRowIds: GridRowId[] };
        cellAction: {
            rowId: GridRowId;
            columnKey: string;
            actionId: string;
            args?: GridCellActionArgs;
        };
        error: { message: string };
    }>();

    let bootstrap: GridBootstrapResult | null = null;
    let controllerState: GridControllerState | null = null;
    let pageResult: GridPageResult | null = null;
    let lastResolvedPageResult: GridPageResult | null = null;
    let detailRowsById: Record<string, GridPageRow | null | undefined> = {};
    let lastResolvedDetailRowsById: Record<string, GridPageRow | null | undefined> = {};
    let summaryByColumnKey: GridSummaryByColumnKey = {};
    let lastResolvedSummaryByColumnKey: GridSummaryByColumnKey = {};
    let loading = false;
    let loadError: string | null = null;
    let scrollContainer: HTMLDivElement | null = null;
    let requestedViewport: GridQueryState["viewport"] | undefined = undefined;
    let renderedViewport: GridQueryState["viewport"] | undefined = undefined;
    let queuedViewport: GridQueryState["viewport"] | undefined = undefined;
    let rowHeightEstimate = rowHeight;
    let rowHeightSeeded = false;
    let rowHeightSeedKey = "";
    let rowMeasurementFrame = 0;
    let topSpacerPx = 0;
    let bottomSpacerPx = 0;
    let requestToken = 0;
    let lastProvider: GridDataProvider | null = null;
    let lastResetKey = "";
    let lastSummaryStateKey = "";
    let viewportLoading = false;
    let viewportSyncFrame = 0;
    let allFilteredRowsSelected = false;
    let compactViewport = false;
    let coarsePointer = false;
    let tableElement: HTMLTableElement | null = null;
    let tableRegionElement: HTMLDivElement | null = null;
    let columnWidthMeasurementFrame = 0;
    let expandedLeadColumnWidthPx: number | null = null;
    let expandedColumnWidths: number[] = [];
    let lastColumnWidthLayoutKey = "";
    let gridUsesOverflowColumnMins = false;

    const GRID_OVERFLOW_TEXT_MIN_PX = 64;
    const GRID_OVERFLOW_WIDE_MIN_PX = 80;

    let exportDatasets: ExportMenuDataset[] = [];

    $: visibleColumns =
        bootstrap && controllerState
            ? getVisibleColumns(bootstrap, controllerState)
            : [];
    $: hiddenDetailColumns =
        bootstrap && controllerState
            ? getHiddenDetailColumns(bootstrap, controllerState)
            : [];
    $: filteredRowCount = pageResult?.filteredRowCount ?? bootstrap?.rowCount ?? 0;
    $: allFilteredRowsSelected = pageResult?.allFilteredRowsSelected ?? false;
    $: displayStartIndex =
        controllerState == null
            ? 0
            : controllerState.pageSize === "all"
              ? renderedViewport?.start ?? 0
              : controllerState.pageIndex * controllerState.pageSize;
    $: pageCount =
        controllerState == null || controllerState.pageSize === "all"
            ? 1
            : Math.max(1, Math.ceil(filteredRowCount / controllerState.pageSize));
    $: canGoPrev = (controllerState?.pageIndex ?? 0) > 0;
    $: canGoNext = (controllerState?.pageIndex ?? 0) + 1 < pageCount;
    $: exportDatasets = [{ key: exportDatasetKey, label: exportDatasetLabel }];
    $: loadingBodyColumns = visibleColumns.length > 0
        ? visibleColumns
        : (bootstrap?.columns.slice(0, Math.max(1, GRID_LOADING_SKELETON_COLUMNS - 1)) ?? []);
    $: loadingUsesAllRowsHeight =
        controllerState?.pageSize === "all" || initialState?.pageSize === "all";
    $: loadingShellHeight = loadingUsesAllRowsHeight
        ? allRowsHeight
        : Math.max(
            GRID_LOADING_MIN_HEIGHT,
            Math.round(rowHeightEstimate * GRID_LOADING_SKELETON_ROWS + 72),
        );
    $: tableWrapStyle = controllerState?.pageSize === "all"
        ? `max-height:${allRowsHeight}px;--ux-grid-row-height:${rowHeightEstimate}px;`
        : `--ux-grid-row-height:${rowHeightEstimate}px;`;
    $: loadingRowPlaceholders = Array.from(
        { length: GRID_LOADING_SKELETON_ROWS },
        (_, index) => index,
    );
    $: virtualMinimumRows = resolveGridVirtualMinimumRows({
        containerHeight: scrollContainer?.clientHeight ?? allRowsHeight,
        rowHeight: rowHeightEstimate,
        baseMinimumRows: minVirtualRows,
        compactViewport,
        coarsePointer,
    });
    $: virtualWindowChunkCount = resolveGridVirtualWindowChunkCount({
        compactViewport,
        coarsePointer,
    });

    function loadingColumnClass(column: (typeof loadingBodyColumns)[number]): string {
        const widthClass = column.widthHint === "wide"
            ? "ux-grid-column-wide"
            : column.widthHint === "text"
              ? "ux-grid-column-text"
              : "ux-grid-column-fit";
        return `${widthClass} ${column.toneClass ?? ""}`.trim();
    }

    function clearExpandedColumnWidths(): void {
        expandedLeadColumnWidthPx = null;
        expandedColumnWidths = [];
        gridUsesOverflowColumnMins = false;
    }

    function scheduleColumnWidthMeasurement(): void {
        if (columnWidthMeasurementFrame !== 0) return;
        columnWidthMeasurementFrame = requestAnimationFrame(() => {
            columnWidthMeasurementFrame = 0;
            measureExpandedColumnWidths();
        });
    }

    function measureExpandedColumnWidths(): void {
        if (!scrollContainer || !tableElement || !tableRegionElement || visibleColumns.length === 0) {
            clearExpandedColumnWidths();
            return;
        }

        const measurementHost = document.createElement("div");
        Object.assign(measurementHost.style, {
            position: "absolute",
            visibility: "hidden",
            pointerEvents: "none",
            left: "0",
            top: "0",
            overflow: "hidden",
            width: "0",
            height: "0",
        });

        const measurementTable = prepareGridTableForWidthMeasurement(tableElement);
        Object.assign(measurementTable.style, {
            width: "max-content",
            minWidth: "0",
            maxWidth: "none",
        });

        measurementHost.appendChild(measurementTable);
        tableRegionElement.appendChild(measurementHost);

        const headerCells = Array.from(
            measurementTable.querySelectorAll("thead tr:first-child th"),
        ) as HTMLElement[];
        if (headerCells.length !== visibleColumns.length + 1) {
            measurementHost.remove();
            clearExpandedColumnWidths();
            return;
        }

        const naturalWidths = headerCells.map((cell) =>
            Math.max(1, cell.getBoundingClientRect().width)
        );
        const computedMinimumWidths = headerCells.map((cell, index) => {
            if (index === 0) return naturalWidths[0];
            const parsed = Number.parseFloat(getComputedStyle(cell).minWidth);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        });
        measurementHost.remove();
        const naturalTotalWidth = naturalWidths.reduce((sum, width) => sum + width, 0);
        const availableWidth = tableRegionElement.clientWidth;
        const useOverflowColumnMins = naturalTotalWidth > availableWidth;
        const minimumWidths = computedMinimumWidths.map((width, index) => {
            if (!useOverflowColumnMins || index === 0) return width;
            const hint = visibleColumns[index - 1]?.widthHint ?? "fit";
            if (hint === "wide") {
                return Math.min(width, GRID_OVERFLOW_WIDE_MIN_PX);
            }
            if (hint === "text") {
                return Math.min(width, GRID_OVERFLOW_TEXT_MIN_PX);
            }
            return width;
        });
        gridUsesOverflowColumnMins = useOverflowColumnMins;

        if (naturalTotalWidth <= availableWidth) {
            expandedLeadColumnWidthPx = naturalWidths[0];
            expandedColumnWidths = naturalWidths.slice(1);
            return;
        }

        const shrunk = [...naturalWidths];
        let remainingOverflow = naturalTotalWidth - availableWidth;
        const shrinkableIndexes = Array.from({ length: visibleColumns.length }, (_, index) => index + 1)
            .filter((index) => shrunk[index] > minimumWidths[index]);

        while (remainingOverflow > 0 && shrinkableIndexes.length > 0) {
            const totalShrinkWeight = shrinkableIndexes.reduce(
                (sum, index) => sum + Math.max(1, shrunk[index] - minimumWidths[index]),
                0,
            );
            if (totalShrinkWeight <= 0) break;

            let distributed = 0;
            for (let listIndex = 0; listIndex < shrinkableIndexes.length; listIndex += 1) {
                const index = shrinkableIndexes[listIndex];
                const capacity = Math.max(0, shrunk[index] - minimumWidths[index]);
                if (capacity <= 0) continue;
                const share = listIndex === shrinkableIndexes.length - 1
                    ? remainingOverflow - distributed
                    : Math.min(
                        capacity,
                        Math.max(
                            0,
                            Math.floor((remainingOverflow * capacity) / totalShrinkWeight),
                        ),
                    );
                if (share <= 0) continue;
                shrunk[index] -= share;
                distributed += share;
            }

            if (distributed <= 0) break;
            remainingOverflow -= distributed;
        }

        expandedLeadColumnWidthPx = shrunk[0];
        expandedColumnWidths = shrunk.slice(1);
    }

    function buildColumnWidthLayoutKey(): string {
        const visibleKeys = visibleColumns.map((column) => column.key).join("|");
        const rowIds = pageResult?.rows.map((row) => String(row.id)).join("|") ?? "loading";
        const summarySignature = Object.entries(summaryByColumnKey)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${value.sum ?? ""}:${value.avg ?? ""}`)
            .join("|");
        return `${compactViewport ? "compact" : "wide"}::${visibleKeys}::${rowIds}::${summarySignature}`;
    }

    $: gridCanExpandToWidth = true;
    $: loadingGridCanExpandToWidth = true;

    $: {
        const nextColumnWidthLayoutKey = buildColumnWidthLayoutKey();
        if (nextColumnWidthLayoutKey !== lastColumnWidthLayoutKey) {
            lastColumnWidthLayoutKey = nextColumnWidthLayoutKey;
            clearExpandedColumnWidths();
            if (bootstrap && controllerState) {
                void tick().then(() => scheduleColumnWidthMeasurement());
            }
        }
    }

    $: if (controllerState?.pageSize === "all" && pageResult) {
        const start = renderedViewport?.start ?? 0;
        const renderedCount = pageResult.rows.length;
        topSpacerPx = start * rowHeightEstimate;
        bottomSpacerPx = Math.max(
            0,
            (pageResult.filteredRowCount - start - renderedCount) * rowHeightEstimate,
        );
    } else {
        topSpacerPx = 0;
        bottomSpacerPx = 0;
    }
    $: if (provider == null) {
        bootstrap = null;
        controllerState = null;
        pageResult = null;
        lastResolvedPageResult = null;
        detailRowsById = {};
        lastResolvedDetailRowsById = {};
        summaryByColumnKey = {};
        lastResolvedSummaryByColumnKey = {};
        requestedViewport = undefined;
        renderedViewport = undefined;
        queuedViewport = undefined;
        loadError = null;
        loading = false;
        lastProvider = null;
        lastResetKey = "";
        lastSummaryStateKey = "";
        viewportLoading = false;
        resetRowHeightEstimate(null);
    }
    $: if (provider && (provider !== lastProvider || resetKey !== lastResetKey)) {
        void initializeFromProvider(provider, resetKey !== lastResetKey);
    }
    $: if (pageResult && scrollContainer) {
        void tick().then(() => scheduleRowHeightMeasurement());
    }

    onMount(() => {
        syncResponsiveViewportSignals();
        const handleResize = (): void => {
            syncResponsiveViewportSignals();
        };

        window.addEventListener("resize", handleResize, { passive: true });
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    });

    function syncResponsiveViewportSignals(): void {
        if (typeof window === "undefined") return;

        const nextCompactViewport = window.innerWidth <= COMPACT_GRID_MAX_WIDTH;
        const nextCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
        const changed =
            nextCompactViewport !== compactViewport ||
            nextCoarsePointer !== coarsePointer;

        compactViewport = nextCompactViewport;
        coarsePointer = nextCoarsePointer;

        if (changed && controllerState?.pageSize === "all" && pageResult) {
            const nextRowHeightSeedKey = buildAllRowsHeightSeedKey(controllerState);
            if (nextRowHeightSeedKey !== rowHeightSeedKey) {
                resetRowHeightEstimate(controllerState);
                void tick().then(() => scheduleRowHeightMeasurement());
            }
            requestViewportSync();
        }

        clearExpandedColumnWidths();
        if (bootstrap && controllerState) {
            void tick().then(() => scheduleColumnWidthMeasurement());
        }
    }

    function createInitialViewport(
        totalRows: number,
    ): NonNullable<GridQueryState["viewport"]> {
        const initialWindow = getGridVirtualWindow({
            scrollTop: scrollContainer?.scrollTop ?? 0,
            totalRows,
            containerHeight: scrollContainer?.clientHeight ?? allRowsHeight,
            rowHeight: rowHeightEstimate,
            minimumRows: virtualMinimumRows,
            windowChunkCount: virtualWindowChunkCount,
        });
        return {
            start: initialWindow.start,
            end: initialWindow.end,
        };
    }

    function normalizeRequestedViewport(
        totalRows: number,
        viewport = requestedViewport,
    ): NonNullable<GridQueryState["viewport"]> {
        const fallback = createInitialViewport(totalRows);
        return resolveGridRowWindow({
            pageIndex: 0,
            pageSize: "all",
            viewport,
            totalRows,
            fallbackRowCount: Math.max(1, fallback.end - fallback.start),
        });
    }

    function buildAllRowsResetKey(state: GridControllerState | null | undefined): string {
        if (!state || state.pageSize !== "all") return "paged";
        const filters = Object.entries(state.filters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${value}`)
            .join("|");
        return JSON.stringify({
            pageSize: state.pageSize,
            sort: state.sort,
            filters,
        });
    }

    function buildAllRowsHeightSeedKey(
        state: GridControllerState | null | undefined,
    ): string {
        if (!state || state.pageSize !== "all") return "";
        const visibleColumnKeys = [...state.visibleColumnKeys].sort().join("|");
        const responsiveMode = compactViewport ? "compact" : "wide";
        const pointerMode = coarsePointer ? "coarse" : "fine";
        return `${buildAllRowsResetKey(state)}::${visibleColumnKeys}::${responsiveMode}::${pointerMode}`;
    }

    function resetRowHeightEstimate(
        state: GridControllerState | null | undefined,
    ): void {
        rowHeightEstimate = rowHeight;
        rowHeightSeeded = false;
        rowHeightSeedKey = buildAllRowsHeightSeedKey(state);
    }

    function shouldResetAllRowsViewport(
        previousState: GridControllerState | null,
        nextState: GridControllerState,
    ): boolean {
        if (nextState.pageSize !== "all") return false;
        if (!previousState || previousState.pageSize !== "all") return true;
        return buildAllRowsResetKey(previousState) !== buildAllRowsResetKey(nextState);
    }

    function buildProviderQueryState(state: GridControllerState): GridQueryState {
        const queryState = toGridQueryState(state);
        if (state.pageSize !== "all") {
            return {
                ...queryState,
                viewport: undefined,
            };
        }

        const totalRows = pageResult?.filteredRowCount ?? bootstrap?.rowCount ?? 0;
        const viewport = normalizeRequestedViewport(totalRows);
        requestedViewport = viewport;
        return {
            ...queryState,
            viewport,
        };
    }

    function rangesIntersect(
        left: { start: number; end: number },
        right: { start: number; end: number },
    ): boolean {
        return left.start < right.end && left.end > right.start;
    }

    function requestViewportQuery(
        nextViewport: GridQueryState["viewport"],
        options?: { viewportMiss?: boolean },
    ): void {
        requestedViewport = nextViewport;
        viewportLoading = !!options?.viewportMiss && !!pageResult;
        if (loading) {
            queuedViewport = nextViewport;
            return;
        }

        queuedViewport = undefined;
        void queryCurrentState();
    }

    function scheduleRowHeightMeasurement(): void {
        if (rowMeasurementFrame !== 0) return;
        rowMeasurementFrame = requestAnimationFrame(() => {
            rowMeasurementFrame = 0;
            measureRenderedRowHeight();
        });
    }

    function measureRenderedRowHeight(): void {
        if (!scrollContainer) return;
        const rows = Array.from(
            scrollContainer.querySelectorAll("tbody tr"),
        ).filter(
            (row) =>
                !row.classList.contains("ux-grid-spacer-row") &&
                !row.classList.contains("ux-grid-details-row"),
        );
        if (rows.length === 0) return;

        const heights = rows
            .slice(0, 12)
            .map((row) => row.getBoundingClientRect().height)
            .filter((value) => Number.isFinite(value) && value > 0);
        const nextMeasurement = resolveGridRowHeightEstimate({
            measuredHeights: heights,
            currentEstimate: rowHeightEstimate,
            pageSize: controllerState?.pageSize ?? 10,
            seeded: rowHeightSeeded,
            minimumRowHeight: 18,
        });
        const estimateChanged =
            Math.abs(nextMeasurement.estimate - rowHeightEstimate) >= 0.5;
        const seededChanged = nextMeasurement.seeded !== rowHeightSeeded;
        if (!estimateChanged && !seededChanged) return;

        rowHeightEstimate = nextMeasurement.estimate;
        rowHeightSeeded = nextMeasurement.seeded;
        if (estimateChanged && controllerState?.pageSize === "all") {
            requestViewportSync();
        }
    }

    async function initializeFromProvider(
        nextProvider: GridDataProvider,
        shouldReset: boolean,
    ): Promise<void> {
        syncResponsiveViewportSignals();
        const token = ++requestToken;
        loading = true;
        loadError = null;
        lastProvider = nextProvider;
        lastResetKey = resetKey;

        try {
            const nextBootstrap = await nextProvider.bootstrap();
            if (token !== requestToken) return;

            bootstrap = nextBootstrap;
            const previousState = controllerState;
            controllerState = shouldReset || !previousState
                ? initializeGridController(nextBootstrap, initialState)
                : reconcileGridController(nextBootstrap, previousState);
            resetRowHeightEstimate(controllerState);
            viewportLoading = false;
            requestedViewport =
                controllerState.pageSize === "all"
                    ? createInitialViewport(nextBootstrap.rowCount)
                    : undefined;
            pageResult = null;
            lastResolvedPageResult = null;
            detailRowsById = {};
            lastResolvedDetailRowsById = {};
            queuedViewport = undefined;
            summaryByColumnKey = {};
            lastResolvedSummaryByColumnKey = {};
            renderedViewport = undefined;
            lastSummaryStateKey = "";
            dispatch("ready", { bootstrap: nextBootstrap });
            dispatchStateChange(previousState);
            await queryCurrentState();
        } catch (error) {
            if (token !== requestToken) return;
            const message =
                error instanceof Error ? error.message : "Could not load grid.";
            loadError = message;
            loading = false;
            dispatch("error", { message });
        }
    }

    async function queryCurrentState(): Promise<void> {
        if (!provider || !bootstrap || !controllerState) return;

        const token = ++requestToken;
        loading = true;
        loadError = null;
        let perfTags: Record<string, string | number | null> = {
            pageSize: controllerState.pageSize,
            sortKey: controllerState.sort?.key ?? null,
            sortDir: controllerState.sort?.dir ?? null,
            filterCount: Object.values(controllerState.filters).filter(
                (value) => value.trim().length > 0,
            ).length,
            visibleColumnCount: controllerState.visibleColumnKeys.length,
            selectedRowCount: controllerState.selectedRowIds.length,
            viewportStart: null,
            viewportEnd: null,
        };

        try {
            const queryState = buildProviderQueryState(controllerState);
            const queryViewport =
                queryState.pageSize === "all" && queryState.viewport
                    ? { ...queryState.viewport }
                    : undefined;
            perfTags = {
                pageSize: queryState.pageSize,
                sortKey: queryState.sort?.key ?? null,
                sortDir: queryState.sort?.dir ?? null,
                filterCount: Object.values(queryState.filters).filter(
                    (value) => value.trim().length > 0,
                ).length,
                visibleColumnCount: queryState.visibleColumnKeys.length,
                selectedRowCount: queryState.selectedRowIds.length,
                viewportStart: queryViewport?.start ?? null,
                viewportEnd: queryViewport?.end ?? null,
            };
            const finishDataSpan = startPerfSpan("grid.query.data", perfTags);
            const summaryStateKey = buildSummaryStateKey(queryState);
            const shouldRefreshSummary = summaryStateKey !== lastSummaryStateKey;
            const result = await provider.query(queryState)
                .finally(() => {
                    finishDataSpan();
                });
            if (token !== requestToken) return;

            if (
                controllerState.pageSize !== "all" &&
                result.filteredRowCount > 0 &&
                result.rows.length === 0 &&
                controllerState.pageIndex > 0
            ) {
                const lastPageIndex = Math.max(
                    0,
                    Math.ceil(result.filteredRowCount / controllerState.pageSize) - 1,
                );
                applyState(
                    setGridPageIndex(bootstrap, controllerState, lastPageIndex),
                );
                return;
            }

            const finishApplySpan = startPerfSpan("grid.query.apply", {
                ...perfTags,
                filteredRowCount: result.filteredRowCount,
                returnedRowCount: result.rows.length,
            });
            const appliedPageResult: GridPageResult =
                lastResolvedPageResult &&
                areGridPageResultsEqual(lastResolvedPageResult, result)
                    ? lastResolvedPageResult
                    : result;
            const pageResultChanged = appliedPageResult !== lastResolvedPageResult;
            pageResult = appliedPageResult;
            lastResolvedPageResult = appliedPageResult;
            renderedViewport = queryViewport;
            loading = false;
            viewportLoading = false;
            if (pageResultChanged) {
                detailRowsById = {};
                lastResolvedDetailRowsById = {};
            } else {
                detailRowsById = lastResolvedDetailRowsById;
            }
            dispatch("queryResult", { result: appliedPageResult });
            void tick().then(() => {
                incrementPerfCounter("grid.query.applied", 1, {
                    ...perfTags,
                    filteredRowCount: result.filteredRowCount,
                    returnedRowCount: result.rows.length,
                });
                finishApplySpan();
            });
            if (
                controllerState.pageSize === "all" &&
                queryViewport &&
                queuedViewport &&
                (queuedViewport.start !== queryViewport.start ||
                    queuedViewport.end !== queryViewport.end)
            ) {
                const nextViewport = { ...queuedViewport };
                queuedViewport = undefined;
                requestViewportQuery(nextViewport);
            } else if (controllerState.pageSize === "all") {
                if (viewportSyncFrame !== 0) {
                    cancelAnimationFrame(viewportSyncFrame);
                    viewportSyncFrame = 0;
                }
                void tick().then(() => {
                    if (token !== requestToken) return;
                    syncViewportToScroll();
                });
            }
            if (shouldRefreshSummary) {
                void queryCurrentSummary(token, queryState, summaryStateKey);
            }
            await ensureExpandedDetails(token);
        } catch (error) {
            incrementPerfCounter("grid.query.failed", 1, perfTags);
            if (token !== requestToken) return;
            const message =
                error instanceof Error ? error.message : "Could not query grid.";
            loadError = message;
            loading = false;
            viewportLoading = false;
            dispatch("error", { message });
        }
    }

    function waitForSummaryPaint(): Promise<void> {
        if (typeof window === "undefined") {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 0);
            });
        });
    }

    async function queryCurrentSummary(
        token: number,
        queryState: GridQueryState,
        summaryStateKey: string,
    ): Promise<void> {
        if (!provider) return;
        await waitForSummaryPaint();
        if (token !== requestToken) return;

        try {
            const nextSummary = await provider.querySummary(queryState);
            const appliedSummary = areGridSummaryByColumnKeyEqual(
                lastResolvedSummaryByColumnKey,
                nextSummary,
            )
                ? lastResolvedSummaryByColumnKey
                : nextSummary;
            summaryByColumnKey = appliedSummary;
            lastResolvedSummaryByColumnKey = appliedSummary;
            lastSummaryStateKey = summaryStateKey;
        } catch {
            if (token !== requestToken) return;
            summaryByColumnKey = {};
            lastResolvedSummaryByColumnKey = {};
            lastSummaryStateKey = "";
        }
    }

    function buildSummaryStateKey(state: GridQueryState): string {
        const filters = Object.entries(state.filters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${value.trim().toLowerCase()}`)
            .join("|");
        const visibleColumns = [...state.visibleColumnKeys].sort().join("|");
        const selectedRowIds = [...state.selectedRowIds]
            .map(String)
            .sort()
            .join("|");
        return `${filters}::${visibleColumns}::${selectedRowIds}`;
    }

    function areRowIdListsEqual(
        left: GridRowId[],
        right: GridRowId[],
    ): boolean {
        if (left === right) return true;
        if (left.length !== right.length) return false;
        return left.every((rowId, index) => rowId === right[index]);
    }

    function dispatchStateChange(previousState?: GridControllerState | null): void {
        if (!controllerState) return;
        dispatch("stateChange", {
            state: {
                ...toGridQueryState(controllerState),
                viewport: undefined,
            },
        });
        if (
            previousState &&
            areRowIdListsEqual(
                previousState.selectedRowIds,
                controllerState.selectedRowIds,
            )
        ) {
            return;
        }
        dispatch("selectionChange", {
            selectedRowIds: [...controllerState.selectedRowIds],
        });
    }

    function applyState(
        nextState: GridControllerState,
        options?: { query?: boolean; silent?: boolean },
    ): void {
        const previousState = controllerState;
        if (previousState === nextState) return;

        const shouldResetViewport = shouldResetAllRowsViewport(previousState, nextState);
        const nextRowHeightSeedKey = buildAllRowsHeightSeedKey(nextState);
        if (nextRowHeightSeedKey !== rowHeightSeedKey) {
            resetRowHeightEstimate(nextState);
        }
        controllerState = nextState;

        if (nextState.pageSize !== "all") {
            requestedViewport = undefined;
            renderedViewport = undefined;
            queuedViewport = undefined;
            viewportLoading = false;
        }

        if (shouldResetViewport) {
            requestedViewport = createInitialViewport(filteredRowCount || bootstrap?.rowCount || 0);
            queuedViewport = undefined;
            pageResult = null;
            detailRowsById = {};
            renderedViewport = undefined;
            viewportLoading = false;
            if (scrollContainer) {
                scrollContainer.scrollTop = 0;
            }
        }

        if (!options?.silent) dispatchStateChange(previousState);
        if (options?.query === false) return;
        void queryCurrentState();
    }

    function syncViewportToScroll(): void {
        if (!bootstrap || !controllerState || controllerState.pageSize !== "all") {
            viewportLoading = false;
            return;
        }
        if (!scrollContainer) return;
        if (filteredRowCount <= 0) {
            viewportLoading = false;
            return;
        }

        const currentScrollTop = scrollContainer.scrollTop;

        const visibleRange = getGridVisibleRange({
            scrollTop: currentScrollTop,
            containerHeight: scrollContainer.clientHeight || allRowsHeight,
            rowHeight: rowHeightEstimate,
            totalRows: filteredRowCount,
        });
        const activeWindow = requestedViewport ?? renderedViewport ?? createInitialViewport(filteredRowCount);
        const visibleWindow = renderedViewport ?? activeWindow;
        const viewportMiss =
            visibleWindow.end > visibleWindow.start &&
            !rangesIntersect(visibleRange, visibleWindow);
        viewportLoading = viewportMiss;
        const visibleCount = Math.max(1, visibleRange.end - visibleRange.start);
        const availableMargin = Math.max(
            0,
            Math.floor(((activeWindow.end - activeWindow.start) - visibleCount) / 2),
        );
        const marginRows = Math.min(
            availableMargin,
            Math.max(visibleCount, Math.floor(virtualMinimumRows / 2)),
        );
        if (
            activeWindow.end > activeWindow.start &&
            isGridRangeWithinWindow({
                range: visibleRange,
                window: activeWindow,
                marginRows,
            })
        ) {
            return;
        }

        const nextWindow = getGridVirtualWindow({
            scrollTop: currentScrollTop,
            containerHeight: scrollContainer.clientHeight || allRowsHeight,
            rowHeight: rowHeightEstimate,
            totalRows: filteredRowCount,
            minimumRows: virtualMinimumRows,
            windowChunkCount: virtualWindowChunkCount,
        });
        if (
            activeWindow.start === nextWindow.start &&
            activeWindow.end === nextWindow.end
        ) {
            return;
        }

        requestViewportQuery(nextWindow, { viewportMiss });
    }

    function requestViewportSync(): void {
        let viewportMiss = false;
        if (
            scrollContainer &&
            controllerState?.pageSize === "all" &&
            pageResult &&
            renderedViewport
        ) {
            const visibleRange = getGridVisibleRange({
                scrollTop: scrollContainer.scrollTop,
                containerHeight: scrollContainer.clientHeight || allRowsHeight,
                rowHeight: rowHeightEstimate,
                totalRows: filteredRowCount,
            });
            viewportMiss = !rangesIntersect(visibleRange, renderedViewport);
            viewportLoading = viewportMiss;
        }
        if (viewportMiss) {
            // Mobile momentum can jump past the current slab before the queued rAF runs.
            if (viewportSyncFrame !== 0) {
                cancelAnimationFrame(viewportSyncFrame);
                viewportSyncFrame = 0;
            }
            syncViewportToScroll();
            return;
        }
        if (viewportSyncFrame !== 0) return;
        viewportSyncFrame = requestAnimationFrame(() => {
            viewportSyncFrame = 0;
            syncViewportToScroll();
        });
    }

    async function ensureExpandedDetails(token: number): Promise<void> {
        if (
            !provider ||
            !controllerState ||
            !pageResult ||
            hiddenDetailColumns.length === 0
        ) {
            return;
        }

        const expandedSet = new Set(controllerState.expandedRowIds);
        const entries = pageResult.rows.filter((row) => expandedSet.has(row.id));
        for (const row of entries) {
            const key = String(row.id);
            if (
                Object.prototype.hasOwnProperty.call(detailRowsById, key) &&
                detailRowsById[key] !== undefined
            ) {
                continue;
            }
            detailRowsById = { ...detailRowsById, [key]: undefined };
            const detail = await provider.getRowDetails(
                row.id,
                toGridQueryState(controllerState),
            );
            if (token !== requestToken) return;
            detailRowsById = { ...detailRowsById, [key]: detail };
            lastResolvedDetailRowsById = detailRowsById;
        }
    }

    async function handleExport(event: CustomEvent<ExportMenuAction>): Promise<void> {
        if (!provider || !controllerState) return;
        await exportGridData({
            provider,
            state: toGridQueryState(controllerState),
            baseFileName: exportBaseFileName,
            datasetKey: event.detail.datasetKey,
            datasetLabel: exportDatasetLabel,
            format: event.detail.format,
            target: event.detail.target,
        });
    }

    async function handleToggleRowSelection(
        event: CustomEvent<{ rowId: GridRowId; shiftKey: boolean }>,
    ): Promise<void> {
        if (!bootstrap || !controllerState) return;
        const orderedRowIds = event.detail.shiftKey && provider
            ? await provider.getFilteredRowIds(toGridQueryState(controllerState))
            : (pageResult?.rows.map((row) => row.id) ?? []);
        applyState(
            toggleGridRowSelection(
                bootstrap,
                controllerState,
                orderedRowIds,
                event.detail.rowId,
                event.detail.shiftKey,
            ),
        );
    }

    async function handleToggleFilteredSelection(): Promise<void> {
        if (!bootstrap || !controllerState || !provider) return;
        const filteredRowIds = await provider.getFilteredRowIds(
            toGridQueryState(controllerState),
        );
        applyState(
            toggleGridAllFilteredRows(bootstrap, controllerState, filteredRowIds),
        );
    }

    async function handleToggleRowExpanded(
        event: CustomEvent<{ rowId: GridRowId }>,
    ): Promise<void> {
        if (!bootstrap || !controllerState) return;
        const nextState = toggleGridRowExpanded(
            bootstrap,
            controllerState,
            event.detail.rowId,
        );
        const wasExpanded = controllerState.expandedRowIds.includes(event.detail.rowId);
        applyState(nextState, { query: false });

        if (!wasExpanded && provider) {
            const detail = await provider.getRowDetails(
                event.detail.rowId,
                toGridQueryState(nextState),
            );
            detailRowsById = {
                ...detailRowsById,
                [String(event.detail.rowId)]: detail,
            };
            lastResolvedDetailRowsById = detailRowsById;
        }
    }

    function handlePageSizeChange(event: Event): void {
        if (!bootstrap || !controllerState) return;
        const rawValue = (event.currentTarget as HTMLSelectElement).value;
        const nextPageSize = rawValue === "all"
            ? "all"
            : (Number.parseInt(rawValue, 10) as GridPageSize);
        applyState(
            setGridPageSize(bootstrap, controllerState, nextPageSize),
        );
    }

    function handleToggleColumn(event: CustomEvent<{ key: string }>): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            toggleGridColumnVisibility(
                bootstrap,
                controllerState,
                event.detail.key,
            ),
        );
    }

    function handleShowAllColumns(): void {
        if (!bootstrap || !controllerState) return;
        applyState(showAllGridColumns(bootstrap, controllerState));
    }

    function handleHideAllColumns(): void {
        if (!bootstrap || !controllerState) return;
        applyState(hideAllGridColumns(bootstrap, controllerState));
    }

    function handleReorderColumn(
        event: CustomEvent<{ key: string; targetIndex: number }>,
    ): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            moveGridColumnToIndex(
                bootstrap,
                controllerState,
                event.detail.key,
                event.detail.targetIndex,
            ),
        );
    }

    function handleHeaderReorderColumn(
        event: CustomEvent<{ key: string; targetKey: string }>,
    ): void {
        if (!bootstrap || !controllerState) return;
        const targetIndex = controllerState.columnOrderKeys.indexOf(
            event.detail.targetKey,
        );
        if (targetIndex < 0) return;
        applyState(
            moveGridColumnToIndex(
                bootstrap,
                controllerState,
                event.detail.key,
                targetIndex,
            ),
        );
    }

    function handleToggleSort(event: CustomEvent<{ key: string }>): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            toggleGridSort(bootstrap, controllerState, event.detail.key),
        );
    }

    function handleFilterChange(
        event: CustomEvent<{ key: string; value: string }>,
    ): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            setGridFilter(
                bootstrap,
                controllerState,
                event.detail.key,
                event.detail.value,
            ),
        );
    }

    function handlePrevPage(): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            setGridPageIndex(
                bootstrap,
                controllerState,
                controllerState.pageIndex - 1,
            ),
        );
    }

    function handleNextPage(): void {
        if (!bootstrap || !controllerState) return;
        applyState(
            setGridPageIndex(
                bootstrap,
                controllerState,
                controllerState.pageIndex + 1,
            ),
        );
    }

    function handleCellAction(
        event: CustomEvent<{
            rowId: GridRowId;
            columnKey: string;
            actionId: string;
            args?: GridCellActionArgs;
        }>,
    ): void {
        dispatch("cellAction", event.detail);
    }
</script>

<div class="ux-grid-shell">
    {#if bootstrap && controllerState}
        <GridToolbar
            columns={bootstrap.columns}
            visibleColumnKeys={controllerState.visibleColumnKeys}
            columnOrderKeys={controllerState.columnOrderKeys}
            exportDatasets={exportDatasets}
            exportButtonLabel={exportButtonLabel}
            columnButtonLabel={columnButtonLabel}
            on:export={handleExport}
            on:toggleColumn={handleToggleColumn}
            on:showAllColumns={handleShowAllColumns}
            on:hideAllColumns={handleHideAllColumns}
            on:reorderColumn={handleReorderColumn}
        />
    {/if}

    {#if loadError}
        <div class="alert alert-danger py-2 mb-2">{loadError}</div>
    {/if}

    {#if !bootstrap || !controllerState}
        <div class="ux-grid-loading-shell" aria-live="polite" aria-label={loadingMessage}>
            <div class="ux-grid-loading-toolbar" aria-hidden="true">
                <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
                <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
            </div>
            <div class="ux-grid-table-region">
                <div
                    class="ux-grid-table-wrap"
                    class:ux-grid-table-wrap-expand={loadingGridCanExpandToWidth}
                    style={`min-height:${loadingShellHeight}px;`}
                    aria-hidden="true"
                >
                    <table
                        class="ux-grid-table table mb-0"
                        class:ux-grid-table-expand={loadingGridCanExpandToWidth}
                    >
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
    {:else}
        <div class="ux-grid-table-region" bind:this={tableRegionElement}>
            <div
                class="ux-grid-table-wrap"
                class:ux-grid-table-wrap-expand={gridCanExpandToWidth}
                class:ux-grid-table-wrap-all={controllerState.pageSize === "all"}
                class:ux-grid-table-wrap-stable-mobile-all={controllerState.pageSize === "all" && (compactViewport || coarsePointer)}
                bind:this={scrollContainer}
                on:scroll={requestViewportSync}
                data-viewport-loading={viewportLoading ? "1" : undefined}
                aria-busy={loading ? "true" : undefined}
                style={tableWrapStyle}
            >
                <table
                    class="ux-grid-table table mb-0"
                    class:ux-grid-table-expand={gridCanExpandToWidth}
                    class:ux-grid-table-overflow={gridUsesOverflowColumnMins}
                    bind:this={tableElement}
                >
                    {#if gridCanExpandToWidth && expandedLeadColumnWidthPx != null}
                        <colgroup>
                            <col style={`width:${expandedLeadColumnWidthPx}px;`} />
                            {#each visibleColumns as column, index (column.key)}
                                <col style={`width:${expandedColumnWidths[index]}px;`} />
                            {/each}
                            <col class="ux-grid-filler-column" />
                        </colgroup>
                    {/if}
                    <caption class="visually-hidden">{caption}</caption>
                    <GridHeader
                        columns={visibleColumns}
                        sort={controllerState.sort}
                        filters={controllerState.filters}
                        on:toggleSort={handleToggleSort}
                        on:filterChange={handleFilterChange}
                        on:reorderColumn={handleHeaderReorderColumn}
                    />
                    {#if pageResult}
                        <GridBody
                            columns={visibleColumns}
                            hiddenDetailColumns={hiddenDetailColumns}
                            rows={pageResult.rows}
                            {detailRowsById}
                            expandedRowIds={controllerState.expandedRowIds}
                            selectedRowIds={controllerState.selectedRowIds}
                            {displayStartIndex}
                            {topSpacerPx}
                            {bottomSpacerPx}
                            {emptyMessage}
                            on:toggleRowSelection={handleToggleRowSelection}
                            on:toggleRowExpanded={handleToggleRowExpanded}
                            on:cellAction={handleCellAction}
                        />
                        <GridFooter
                            columns={visibleColumns}
                            {summaryByColumnKey}
                            {allFilteredRowsSelected}
                            on:toggleFilteredSelection={handleToggleFilteredSelection}
                        />
                    {:else}
                        <tbody class="ux-grid-table-loading-body" aria-hidden="true">
                            {#each loadingRowPlaceholders as placeholder (placeholder)}
                                <tr class="ux-grid-table-loading-row" data-placeholder={placeholder}>
                                    <td class="ux-grid-lead-cell">
                                        <span class="ux-grid-skeleton ux-grid-skeleton-cell"></span>
                                    </td>
                                    {#each loadingBodyColumns as column (column.key)}
                                        <td
                                            class={loadingColumnClass(column)}
                                        >
                                            <span class="ux-grid-skeleton ux-grid-skeleton-cell"></span>
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    {/if}
                </table>
            </div>
        </div>

        <div class="d-flex flex-wrap justify-content-start align-items-center gap-2 mt-2 ux-grid-bottom-bar">
            <div class="d-flex flex-wrap align-items-center gap-2">
                <label class="small d-flex align-items-center gap-2 ux-grid-page-size-label">
                    <span>Rows</span>
                    <select
                        class="form-select form-select-sm ux-grid-page-size-select"
                        value={controllerState.pageSize}
                        on:change={handlePageSizeChange}
                        aria-label="Rows per page"
                    >
                        {#each GRID_PAGE_SIZE_OPTIONS as pageSizeOption}
                            <option value={pageSizeOption}>
                                {pageSizeOption === "all" ? "All" : pageSizeOption}
                            </option>
                        {/each}
                    </select>
                </label>
                {#if controllerState.pageSize !== "all"}
                    <button
                        class="btn ux-btn btn-sm"
                        type="button"
                        disabled={!canGoPrev}
                        on:click={handlePrevPage}
                    >
                        Previous
                    </button>
                    <span class="small fw-semibold">Page {controllerState.pageIndex + 1} / {pageCount}</span>
                    <button
                        class="btn ux-btn btn-sm"
                        type="button"
                        disabled={!canGoNext}
                        on:click={handleNextPage}
                    >
                        Next
                    </button>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .ux-grid-table-wrap {
        position: relative;
        width: fit-content;
        max-width: 100%;
        min-width: 0;
        margin: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
    }

    .ux-grid-table-wrap-expand {
        width: 100%;
    }

    .ux-grid-table-wrap-all {
        overflow-y: auto;
        overflow-anchor: none;
    }

    .ux-grid-table-wrap-all[data-viewport-loading="1"] {
        background:
            linear-gradient(
                180deg,
                var(--ux-grid-loading-surface-start) 0%,
                var(--ux-grid-loading-surface-end) 100%
            ),
            repeating-linear-gradient(
                180deg,
                var(--ux-grid-loading-line-soft) 0,
                var(--ux-grid-loading-line-soft) 1px,
                transparent 1px,
                transparent calc(var(--ux-grid-row-height, 24px) - 7px),
                var(--ux-grid-loading-line-strong) calc(var(--ux-grid-row-height, 24px) - 7px),
                var(--ux-grid-loading-line-strong) calc(var(--ux-grid-row-height, 24px) - 2px),
                transparent calc(var(--ux-grid-row-height, 24px) - 2px),
                transparent var(--ux-grid-row-height, 24px)
            );
        background-attachment: local;
    }

    .ux-grid-table-region {
        position: relative;
        display: flex;
        justify-content: flex-start;
        width: 100%;
    }

    .ux-grid-shell :global(table) {
        min-width: 100%;
        border-collapse: collapse;
    }

    .ux-grid-shell :global(.ux-grid-table th),
    .ux-grid-shell :global(.ux-grid-table td) {
        border-right: 1px solid var(--ux-grid-divider);
    }

    .ux-grid-shell :global(.ux-grid-table tr > :last-child) {
        border-right: 0;
    }

    .ux-grid-shell :global(.ux-grid-spacer-row) {
        overflow-anchor: none;
    }

    /* Mobile/touch all-mode keeps rows single-line so height-based virtualization stays stable. */
    .ux-grid-table-wrap-stable-mobile-all :global(tbody td) {
        overflow: hidden;
    }

    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-cell-text),
    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-cell-link),
    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-cell-metric),
    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-cell-date),
    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-cell-action) {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        overflow-wrap: normal;
        word-break: normal;
    }

    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-stack) {
        flex-wrap: nowrap;
        overflow: hidden;
    }

    .ux-grid-table-wrap-stable-mobile-all :global(.ux-grid-stack-item) {
        overflow: hidden;
    }

    .ux-grid-shell {
        --ux-grid-divider: color-mix(in srgb, var(--ux-border) 82%, transparent);
        --ux-grid-muted: var(--ux-text-muted);
        --ux-grid-header-surface: color-mix(in srgb, var(--ux-surface-alt) 92%, var(--ux-surface));
        --ux-grid-footer-surface: color-mix(in srgb, var(--ux-surface-alt) 90%, var(--ux-surface));
        --ux-grid-sticky-surface: color-mix(
            in srgb,
            var(--ux-surface-alt) 96%,
            transparent
        );
        --ux-grid-detail-surface: color-mix(
            in srgb,
            var(--ux-surface-elevated) 84%,
            transparent
        );
        --ux-grid-detail-accent: color-mix(in srgb, var(--ux-border) 94%, transparent);
        --ux-grid-loading-surface-start: color-mix(
            in srgb,
            var(--ux-surface-alt) 96%,
            transparent
        );
        --ux-grid-loading-surface-end: color-mix(
            in srgb,
            var(--ux-surface-elevated) 92%,
            transparent
        );
        --ux-grid-loading-line-soft: color-mix(in srgb, var(--ux-border) 34%, transparent);
        --ux-grid-loading-line-strong: color-mix(in srgb, var(--ux-border) 62%, transparent);
        --ux-grid-skeleton-low: color-mix(in srgb, var(--ux-border) 30%, transparent);
        --ux-grid-skeleton-high: color-mix(in srgb, var(--ux-text-muted) 28%, transparent);
        --ux-grid-row-stripe-overlay: color-mix(in srgb, var(--ux-text) 2.5%, transparent);
        --ux-grid-row-hover: color-mix(in srgb, var(--ux-brand) 6%, var(--ux-surface));
        --ux-grid-row-selected: color-mix(in srgb, var(--ux-brand) 9%, var(--ux-surface));
        --ux-grid-row-c1: color-mix(in srgb, var(--ux-danger) 11%, var(--ux-surface));
        --ux-grid-row-c2: color-mix(in srgb, var(--ux-brand) 11%, var(--ux-surface));
        --ux-grid-row-active: color-mix(in srgb, var(--ux-danger) 16%, var(--ux-surface));
        --ux-grid-row-recent: color-mix(in srgb, var(--ux-warning) 16%, var(--ux-surface));
        --ux-grid-row-ended: color-mix(in srgb, var(--ux-surface-alt) 88%, var(--ux-surface));
        --ux-grid-drop-target: color-mix(in srgb, var(--ux-brand) 18%, var(--ux-surface-alt));
        --ux-grid-drop-outline: color-mix(in srgb, var(--ux-brand) 42%, transparent);
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

    .ux-grid-table-loading-row {
        pointer-events: none;
    }

    .ux-grid-loading-shell :global(thead th) {
        background: var(--ux-grid-header-surface);
    }

    .ux-grid-loading-shell :global(tfoot th) {
        background: var(--ux-grid-footer-surface);
    }

    .ux-grid-table-loading-body td {
        background: color-mix(in srgb, var(--ux-surface-alt) 68%, transparent);
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

    .ux-grid-shell :global(.ux-grid-table) {
        width: max-content;
        min-width: 100%;
        max-width: none;
        table-layout: auto;
        font-size: 0.72rem;
        line-height: 1.22;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-expand) {
        width: 100%;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow th.ux-grid-column-wide),
    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow td.ux-grid-column-wide) {
        min-width: 5rem !important;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow th.ux-grid-column-text),
    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow td.ux-grid-column-text) {
        min-width: 4rem !important;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow .ux-grid-cell-text),
    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow .ux-grid-cell-link) {
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow .ux-grid-stack) {
        min-width: 0;
    }

    .ux-grid-shell :global(.ux-grid-table.ux-grid-table-overflow .ux-grid-stack-item) {
        max-width: 100%;
    }

    .ux-grid-shell :global(.ux-grid-filler-column) {
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        padding: 0 !important;
        border-left: 0 !important;
        border-right: 0 !important;
        box-shadow: none !important;
    }

    .ux-grid-shell :global(.ux-grid-last-data-column) {
        border-right: 0 !important;
    }

    .ux-grid-shell :global(.ux-grid-table a) {
        color: inherit;
        text-decoration-thickness: 0.06em;
    }

    .ux-grid-page-size-label {
        font-size: 0.76rem;
        font-weight: 500;
    }

    .ux-grid-page-size-select {
        width: auto;
        min-width: 4.1rem;
        min-height: 1.7rem;
        padding: 0.12rem 1.7rem 0.12rem 0.42rem;
        font-size: 0.76rem;
    }

    .ux-grid-bottom-bar {
        width: 100%;
        max-width: 100%;
        margin: 0.5rem 0 0;
    }

    @media (max-width: 640px) {
        .ux-grid-shell {
            padding: 0.5rem;
        }

        .ux-grid-shell :global(.ux-grid-table) {
            font-size: 0.69rem;
        }
    }
</style>
