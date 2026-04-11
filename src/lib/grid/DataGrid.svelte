<script lang="ts">
    import { createEventDispatcher, tick } from "svelte";
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
    import GridBody from "./GridBody.svelte";
    import GridFooter from "./GridFooter.svelte";
    import GridHeader from "./GridHeader.svelte";
    import GridToolbar from "./GridToolbar.svelte";
    import { GRID_PAGE_SIZE_OPTIONS, getHiddenDetailColumns, getVisibleColumns, toGridQueryState } from "./state";
    import {
        getGridVisibleRange,
        getGridVirtualWindow,
        isGridRangeWithinWindow,
        resolveGridRowHeightEstimate,
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
    const GRID_LOADING_MIN_HEIGHT = 280;

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
    let detailRowsById: Record<string, GridPageRow | null | undefined> = {};
    let summaryByColumnKey: GridSummaryByColumnKey = {};
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
    $: loadingUsesAllRowsHeight =
        controllerState?.pageSize === "all" || initialState?.pageSize === "all";
    $: loadingShellHeight = loadingUsesAllRowsHeight
        ? allRowsHeight
        : Math.max(
            GRID_LOADING_MIN_HEIGHT,
            Math.round(rowHeightEstimate * GRID_LOADING_SKELETON_ROWS + 96),
        );
    $: tableWrapStyle = controllerState?.pageSize === "all"
        ? `max-height:${allRowsHeight}px;--ux-grid-row-height:${rowHeightEstimate}px;`
        : `--ux-grid-row-height:${rowHeightEstimate}px;`;
    $: loadingRowPlaceholders = Array.from(
        { length: GRID_LOADING_SKELETON_ROWS },
        (_, index) => index,
    );
    $: loadingColumnPlaceholders = Array.from(
        { length: GRID_LOADING_SKELETON_COLUMNS },
        (_, index) => index,
    );
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
        detailRowsById = {};
        summaryByColumnKey = {};
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

    function createInitialViewport(
        totalRows: number,
    ): NonNullable<GridQueryState["viewport"]> {
        const initialWindow = getGridVirtualWindow({
            scrollTop: scrollContainer?.scrollTop ?? 0,
            totalRows,
            containerHeight: scrollContainer?.clientHeight ?? allRowsHeight,
            rowHeight: rowHeightEstimate,
            minimumRows: minVirtualRows,
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
        return `${buildAllRowsResetKey(state)}::${visibleColumnKeys}`;
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
        const token = ++requestToken;
        loading = true;
        loadError = null;
        lastProvider = nextProvider;
        lastResetKey = resetKey;

        try {
            const nextBootstrap = await nextProvider.bootstrap();
            if (token !== requestToken) return;

            bootstrap = nextBootstrap;
            controllerState = shouldReset || !controllerState
                ? initializeGridController(nextBootstrap, initialState)
                : reconcileGridController(nextBootstrap, controllerState);
            resetRowHeightEstimate(controllerState);
            viewportLoading = false;
            requestedViewport =
                controllerState.pageSize === "all"
                    ? createInitialViewport(nextBootstrap.rowCount)
                    : undefined;
            pageResult = null;
            detailRowsById = {};
            queuedViewport = undefined;
            summaryByColumnKey = {};
            renderedViewport = undefined;
            lastSummaryStateKey = "";
            dispatch("ready", { bootstrap: nextBootstrap });
            dispatchStateChange();
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
            if (shouldRefreshSummary) {
                summaryByColumnKey = {};
            }
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
            pageResult = result;
            renderedViewport = queryViewport;
            loading = false;
            viewportLoading = false;
            detailRowsById = {};
            dispatch("queryResult", { result });
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
            summaryByColumnKey = await provider.querySummary(queryState);
            lastSummaryStateKey = summaryStateKey;
        } catch {
            if (token !== requestToken) return;
            summaryByColumnKey = {};
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

    function dispatchStateChange(): void {
        if (!controllerState) return;
        dispatch("stateChange", {
            state: {
                ...toGridQueryState(controllerState),
                viewport: undefined,
            },
        });
        dispatch("selectionChange", {
            selectedRowIds: [...controllerState.selectedRowIds],
        });
    }

    function applyState(
        nextState: GridControllerState,
        options?: { query?: boolean; silent?: boolean },
    ): void {
        const previousState = controllerState;
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

        if (!options?.silent) dispatchStateChange();
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
            Math.max(visibleCount, Math.floor(minVirtualRows / 2)),
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
            minimumRows: minVirtualRows,
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
            viewportLoading = !rangesIntersect(visibleRange, renderedViewport);
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
            detailRowsById = { ...detailRowsById, [key]: undefined };
            const detail = await provider.getRowDetails(
                row.id,
                toGridQueryState(controllerState),
            );
            if (token !== requestToken) return;
            detailRowsById = { ...detailRowsById, [key]: detail };
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

    {#if !bootstrap || !controllerState || !pageResult}
        <div
            class="ux-grid-loading-shell"
            style={`min-height:${loadingShellHeight}px;`}
            aria-live="polite"
        >
            <div class="ux-grid-loading-toolbar" aria-hidden="true">
                <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
                <span class="ux-grid-skeleton ux-grid-skeleton-button"></span>
            </div>
            <div class="ux-grid-loading-status">{loadingMessage}</div>
            <div class="ux-grid-loading-table" aria-hidden="true">
                <div class="ux-grid-loading-header">
                    {#each loadingColumnPlaceholders as placeholder}
                        <span class="ux-grid-skeleton ux-grid-skeleton-header" data-placeholder={placeholder}></span>
                    {/each}
                </div>
                <div class="ux-grid-loading-rows">
                    {#each loadingRowPlaceholders as placeholder}
                        <div class="ux-grid-loading-row" data-placeholder={placeholder}>
                            {#each loadingColumnPlaceholders as columnPlaceholder}
                                <span class="ux-grid-skeleton ux-grid-skeleton-cell" data-placeholder={columnPlaceholder}></span>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {:else}
        <div class="ux-grid-table-region">
            <div
                class="ux-grid-table-wrap"
                class:ux-grid-table-wrap-all={controllerState.pageSize === "all"}
                bind:this={scrollContainer}
                on:scroll={requestViewportSync}
                data-viewport-loading={viewportLoading ? "1" : undefined}
                style={tableWrapStyle}
            >
                <table class="ux-grid-table table mb-0">
                    <caption class="visually-hidden">{caption}</caption>
                    <GridHeader
                        columns={visibleColumns}
                        sort={controllerState.sort}
                        filters={controllerState.filters}
                        on:toggleSort={handleToggleSort}
                        on:filterChange={handleFilterChange}
                        on:reorderColumn={handleHeaderReorderColumn}
                    />
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
                </table>
            </div>
        </div>

        <div class="d-flex flex-wrap justify-content-end align-items-center gap-2 mt-2">
            <div class="d-flex flex-wrap align-items-center gap-2">
                <label class="small d-flex align-items-center gap-2">
                    <span>Rows</span>
                    <select
                        class="form-select form-select-sm"
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
        width: 100%;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
    }

    .ux-grid-table-wrap-all {
        overflow-y: auto;
        overflow-anchor: none;
    }

    .ux-grid-table-wrap-all[data-viewport-loading="1"] {
        background:
            linear-gradient(
                180deg,
                rgba(241, 245, 249, 0.94) 0%,
                rgba(226, 232, 240, 0.82) 100%
            ),
            repeating-linear-gradient(
                180deg,
                rgba(148, 163, 184, 0.06) 0,
                rgba(148, 163, 184, 0.06) 1px,
                transparent 1px,
                transparent calc(var(--ux-grid-row-height, 24px) - 7px),
                rgba(148, 163, 184, 0.14) calc(var(--ux-grid-row-height, 24px) - 7px),
                rgba(148, 163, 184, 0.14) calc(var(--ux-grid-row-height, 24px) - 2px),
                transparent calc(var(--ux-grid-row-height, 24px) - 2px),
                transparent var(--ux-grid-row-height, 24px)
            );
        background-attachment: local;
    }

    .ux-grid-table-region {
        position: relative;
    }

    .ux-grid-shell :global(table) {
        min-width: 100%;
        border-collapse: collapse;
    }

    .ux-grid-shell :global(.ux-grid-table th),
    .ux-grid-shell :global(.ux-grid-table td) {
        border-right: 1px solid rgba(15, 23, 42, 0.08);
    }

    .ux-grid-shell :global(.ux-grid-table tr > :last-child) {
        border-right: 0;
    }

    .ux-grid-shell :global(.ux-grid-spacer-row) {
        overflow-anchor: none;
    }

    .ux-grid-shell {
        position: relative;
        min-width: 0;
        padding: 0.7rem;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-md);
        background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
        box-shadow: var(--ux-shadow-sm);
    }

    .ux-grid-loading-shell {
        display: grid;
        gap: 0.7rem;
    }

    .ux-grid-loading-toolbar {
        display: flex;
        gap: 0.5rem;
    }

    .ux-grid-loading-status {
        font-size: 0.72rem;
        color: rgba(15, 23, 42, 0.68);
    }

    .ux-grid-loading-table {
        display: grid;
        gap: 0.45rem;
        min-height: 0;
    }

    .ux-grid-loading-header,
    .ux-grid-loading-row {
        display: grid;
        grid-template-columns: 2.5rem repeat(5, minmax(0, 1fr));
        gap: 0.38rem;
    }

    .ux-grid-loading-rows {
        display: grid;
        gap: 0.28rem;
    }

    .ux-grid-skeleton {
        display: block;
        border-radius: 0.45rem;
        background: linear-gradient(
            90deg,
            rgba(148, 163, 184, 0.12) 0%,
            rgba(148, 163, 184, 0.26) 50%,
            rgba(148, 163, 184, 0.12) 100%
        );
        background-size: 200% 100%;
        animation: ux-grid-skeleton-shimmer 1.25s ease-in-out infinite;
    }

    .ux-grid-skeleton-button {
        width: 8.5rem;
        height: 1.95rem;
    }

    .ux-grid-skeleton-header {
        height: 1.65rem;
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
        font-size: 0.74rem;
        line-height: 1.22;
    }

    .ux-grid-shell :global(.ux-grid-table a) {
        color: inherit;
        text-decoration-thickness: 0.06em;
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
