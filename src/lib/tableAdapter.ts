import { incrementPerfCounter, startPerfSpan } from "./perf";
import {
    resolveCellFormatter,
    type TableCallbacks,
} from "./tableCallbacks";
import { setupColumnVisibilityController } from "./tableAdapter/columnVisibility";
import { buildFiltersAndSummaryScaffold } from "./tableAdapter/filters";
import { createSelectionController } from "./tableAdapter/selection";
import { createSummaryRenderer } from "./tableAdapter/summary";
import {
    addTableShell,
    bindExportActions,
    getColumnToneClass,
} from "./tableAdapter/tableShell";
import type { TableData } from "./types";

type DataTableRender = NonNullable<
    ReturnType<typeof resolveCellFormatter>
>;

type TableRuntimeState = {
    dataSet: TableData;
};

type TableContainerState = {
    schemaKey: string;
    tableElem: HTMLTableElement;
    containerId: string;
    runtimeState: TableRuntimeState;
    bootstrappedData: TableData;
    tableApi: any | null;
    resetSelection: (() => void) | null;
    pendingData: TableData | null;
    lastVisibleByCol: boolean[];
    lastSortKey: string;
};

const containerStateByElem = new WeakMap<HTMLElement, TableContainerState>();

function shouldLogContainer(containerId: string): boolean {
    return containerId === "conflict-table-1" || containerId === "aava-table";
}

function logTableAdapter(
    containerId: string,
    message: string,
    meta?: Record<string, unknown>,
): void {
    if (!shouldLogContainer(containerId)) return;
    if (meta) {
        console.info(`[table-adapter:${containerId}] ${message}`, meta);
        return;
    }
    console.info(`[table-adapter:${containerId}] ${message}`);
}

export type TableAdapterDeps = {
    uuidv4: () => string;
    htmlToElement: (html: string) => HTMLElement;
    commafy: (num: number) => string;
    setQueryParam: (
        param: string,
        value: string | number | boolean | null | undefined,
        options?: { replace?: boolean },
    ) => void;
    ensureScriptsLoaded: (scriptIds: string[]) => Promise<void>;
    ensureStylesLoaded: (styleIds: string[]) => Promise<void>;
};

function ensureJqueryLoaded(deps: TableAdapterDeps): Promise<void> {
    return deps.ensureScriptsLoaded(["jqjs"]).then(() => {
        if (typeof jQuery === "undefined") {
            return Promise.reject(new Error("jQuery did not load correctly"));
        }
        return;
    });
}

function ensureDTLoaded(deps: TableAdapterDeps): Promise<void> {
    return deps
        .ensureStylesLoaded(["dtcss1", "dtcss2"])
        .then(() => deps.ensureScriptsLoaded(["dtjs1", "dtjs2", "dtjs3"]));
}

function setupTable(
    containerElem: HTMLElement,
    tableElem: HTMLElement,
    runtimeState: TableRuntimeState,
    callbacks: TableCallbacks | undefined,
    deps: TableAdapterDeps,
    onTableReady?: () => void,
    onApiReady?: (tableApi: any, resetSelection: () => void) => void,
) {
    const containerId = containerElem.id || "(anonymous-container)";
    const setupStartedAt = performance.now();
    logTableAdapter(containerId, "setupTable start", {
        rows: runtimeState.dataSet.data.length,
        columns: runtimeState.dataSet.columns.length,
    });

    const jqueryLoadStartedAt = performance.now();
    ensureJqueryLoaded(deps).then(() => {
        logTableAdapter(containerId, "jQuery ready", {
            elapsedMs: Number((performance.now() - jqueryLoadStartedAt).toFixed(2)),
        });
        const jqTable = $(tableElem);

        const dataSetRoot = runtimeState.dataSet;

        const visibleColumns = dataSetRoot.visible;
        const dataColumns = dataSetRoot.columns;
        const dataList = dataSetRoot.data;
        const searchableColumns = dataSetRoot.searchable;
        const cell_format = dataSetRoot.cell_format;
        let sort = dataSetRoot.sort;
        if (sort == null) sort = [0, "asc"];
        const shouldDeferInitialSort =
            dataColumns.length >= 160 &&
            Array.isArray(sort) &&
            sort[0] > 0;
        const shouldDeferInitialSummary = dataColumns.length >= 160;

        function isDataColumnNumeric(dataColIndex: number): boolean {
            return (
                (cell_format.formatNumber &&
                    cell_format.formatNumber.includes(dataColIndex)) ||
                (cell_format.formatMoney &&
                    cell_format.formatMoney.includes(dataColIndex))
            );
        }

        function isDataColumnMoney(dataColIndex: number): boolean {
            return !!(
                cell_format.formatMoney &&
                cell_format.formatMoney.includes(dataColIndex)
            );
        }

        function formatSummaryValue(value: number, isMoney: boolean): string {
            const rounded = Math.round(value * 100) / 100;
            if (isMoney) return `$${deps.commafy(rounded)}`;
            return deps.commafy(rounded);
        }

        const cellFormatByCol: Record<number, DataTableRender> = {};
        const cellFormatNameByCol: Record<number, string> = {};
        const searchableSet = new Set<number>(searchableColumns);
        if (cell_format != null) {
            for (const func in cell_format) {
                const cols: number[] = cell_format[func];
                for (const col of cols) {
                    const funcObj = resolveCellFormatter(func, callbacks);
                    if (funcObj == null) {
                        console.warn("No function found for " + func);
                        continue;
                    }
                    cellFormatByCol[col] = funcObj;
                    cellFormatNameByCol[col] = func;
                }
            }
        }

        const columnsInfo: {
            data: number;
            className?: string;
            render?: DataTableRender;
            visible?: boolean;
            searchable?: boolean;
        }[] = [];
        if (dataColumns.length > 0) {
            for (let i = 0; i < dataColumns.length; i++) {
                const toneClass = getColumnToneClass(dataColumns[i]);
                const columnInfo: {
                    orderDataType?: string;
                    data: number;
                    className: string;
                    render?: DataTableRender;
                    defaultContent?: string;
                    searchable?: boolean;
                } = {
                    data: i,
                    className: `details-control ${toneClass}`.trim(),
                    defaultContent: "",
                    searchable: searchableSet.has(i),
                };
                const renderFunc = cellFormatByCol[i];
                if (renderFunc != null) {
                    columnInfo.render = renderFunc;
                    if (
                        cellFormatNameByCol[i] === "formatNumber" ||
                        cellFormatNameByCol[i] === "formatMoney"
                    ) {
                        columnInfo.orderDataType = "numeric-comma";
                    }
                }
                columnsInfo.push(columnInfo);
            }
        }
        const tableArr: any[] = [null];

        const scaffoldStartedAt = performance.now();
        buildFiltersAndSummaryScaffold({
            containerElem,
            columnsInfo,
            dataColumns,
            searchableColumns,
            visibleColumns,
            getColumnToneClass,
            getTableApi: () => tableArr[0],
        });
        logTableAdapter(containerId, "filters scaffold ready", {
            elapsedMs: Number((performance.now() - scaffoldStartedAt).toFixed(2)),
        });

        const dtLoadStartedAt = performance.now();
        ensureDTLoaded(deps).then(() => {
            logTableAdapter(containerId, "DataTables assets ready", {
                elapsedMs: Number((performance.now() - dtLoadStartedAt).toFixed(2)),
            });
            const selectionController = createSelectionController({
                containerElem,
                onSelectionChange: runtimeState.dataSet.onSelectionChange,
            });

            const renderSummaryRow = createSummaryRenderer({
                containerElem,
                getFilteredRowIndexes: selectionController.getFilteredRowIndexes,
                isDataColumnNumeric,
                isDataColumnMoney,
                formatSummaryValue,
                isSelected: selectionController.isSelected,
            });
            let readyForReorderRedraw = false;
            let pendingInitialSummary = shouldDeferInitialSummary;

            ($.fn as any).dataTableExt.oStdClasses.sWrapper =
                "py-2 px-2 dataTables_wrapper";
            const dataTableInitStartedAt = performance.now();
            const table = (tableArr[0] = (jqTable as any).DataTable({
                dom: "rt<'ux-dt-bottom'plf>",
                columns: [
                    {
                        data: null,
                        title: "#",
                        orderable: false,
                        searchable: false,
                        className: "dt-center p-0",
                        defaultContent: "",
                    },
                    ...columnsInfo,
                ],
                colReorder: true,
                data: dataList,
                paging: true,
                lengthMenu: [
                    [10, 25, 50, 100, -1],
                    [10, 25, 50, 100, "All"],
                ],
                pageLength: 10,
                deferRender: true,
                orderClasses: false,
                order: shouldDeferInitialSort ? [] : [sort],
                autoWidth: false,
                searchHighlight: false,
                info: false,
                processing: false,
                stateSave: false,
                scrollX: false,
                initComplete: function () {
                    const api = (this as any).api();
                    if (shouldDeferInitialSort) {
                        requestAnimationFrame(() => {
                            api.order([sort]).draw(false);
                            logTableAdapter(containerId, "deferred initial sort applied", {
                                sortIndex: sort[0],
                                sortDir: sort[1],
                            });
                        });
                    }
                    readyForReorderRedraw = true;
                    logTableAdapter(containerId, "DataTable initComplete", {
                        elapsedMs: Number((performance.now() - dataTableInitStartedAt).toFixed(2)),
                    });
                    onTableReady?.();
                },
                rowCallback: function (
                    row: any,
                    data: any,
                    _displayIndex: any,
                    displayIndexFull: any,
                ) {
                    const api = (this as any).api();
                    const rowIndex = api.row(row).index();
                    const isSelected = selectionController.isSelected(rowIndex);
                    $(row).toggleClass("table-active", isSelected);
                    $("td:eq(0)", row).html(
                        `<label class="d-inline-flex align-items-center m-0 ux-row-index"><input type="checkbox" class="ux-row-select" ${isSelected ? "checked" : ""} /><span>${displayIndexFull + 1}</span></label>`,
                    );
                    const rowFormat = runtimeState.dataSet.row_format;
                    if (rowFormat) {
                        rowFormat(row, data, displayIndexFull);
                    }
                },
                drawCallback: function () {
                    const api = this.api();
                    if (pendingInitialSummary) {
                        pendingInitialSummary = false;
                        requestAnimationFrame(() => {
                            renderSummaryRow(api);
                        });
                        return;
                    }
                    renderSummaryRow(api);
                },
            }));

            table.on("column-reorder", function (_e: any, _settings: any, _details: any) {
                if (!readyForReorderRedraw) return;
                table.draw(false);
            });

            function formatRowDetails(d: any) {
                let rows = "";
                table.columns().every(function (index: any) {
                    if (index === 0) return;
                    const numFormat: number[] = [];
                    if (cell_format.formatNumber != null) {
                        numFormat.push(...cell_format.formatNumber);
                    }
                    if (cell_format.formatMoney != null) {
                        numFormat.push(...cell_format.formatMoney);
                    }
                    const title = dataColumns[index - 1];
                    if (title != null) {
                        if (!table.column(index).visible()) {
                            let data = d[index - 1];
                            if (numFormat.includes(index - 1)) {
                                data = data.toLocaleString("en-US");
                            }
                            rows +=
                                "<tr>" +
                                "<td>" +
                                title +
                                "</td>" +
                                "<td>" +
                                data +
                                "</td>" +
                                "</tr>";
                        }
                    }
                });
                if (rows === "") rows = "No extra info";
                return '<table class="bg-body-secondary table table-striped table-bordered compact" cellspacing="0" border="0">' +
                    rows +
                    "</table>";
            }

            function addRowDetailsListener(jqTable: any, table: any) {
                jqTable.querySelector("tbody").addEventListener("click", function (event: Event) {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains("details-control")) {
                        const tr = target.closest("tr");
                        if (!tr) return;
                        const row = table.row(tr);

                        if (row.child.isShown()) {
                            row.child.hide();
                            tr.classList.remove("shown");
                        } else {
                            row.child(formatRowDetails(row.data())).show();
                            tr.classList.add("shown");
                        }
                    }
                });
            }

            setupColumnVisibilityController({
                containerElem,
                tableApi: table,
                dataColumns,
                setQueryParam: (param, value) => deps.setQueryParam(param, value),
            });
            addRowDetailsListener(tableElem, table);
            selectionController.addRowSelectionListener(tableElem, table, renderSummaryRow);
            selectionController.addSummarySelectionListener(table, renderSummaryRow);
            const resetSelection = () => {
                selectionController.resetSelection(table);
            };
            onApiReady?.(table, resetSelection);
            selectionController.publishSelection(table);
            tableElem.classList.remove("d-none");
            requestAnimationFrame(() => {
                table.columns.adjust();
            });
            logTableAdapter(containerId, "setupTable end", {
                elapsedMs: Number((performance.now() - setupStartedAt).toFixed(2)),
            });
        });
    });
}

function normalizeCellFormat(cellFormat: TableData["cell_format"]): string {
    const keys = Object.keys(cellFormat).sort();
    const parts: string[] = [];
    for (const key of keys) {
        const values = (cellFormat[key] ?? []).slice().sort((a, b) => a - b);
        parts.push(`${key}:${values.join(",")}`);
    }
    return parts.join("|");
}

function buildSchemaKey(data: TableData): string {
    return [
        data.columns.join("|"),
        data.searchable.join(","),
        normalizeCellFormat(data.cell_format),
    ].join("::");
}

function applyIncrementalUpdate(state: TableContainerState, data: TableData): void {
    const startedAt = performance.now();
    state.runtimeState.dataSet = data;

    if (!state.tableApi) {
        if (data === state.bootstrappedData) {
            logTableAdapter(state.containerId, "incremental update skipped (matches bootstrap data)", {
                rows: data.data.length,
                columns: data.columns.length,
            });
            return;
        }
        state.pendingData = data;
        logTableAdapter(state.containerId, "incremental update deferred (api not ready)", {
            rows: data.data.length,
            columns: data.columns.length,
        });
        return;
    }

    const tableApi = state.tableApi;
    const sort = data.sort ?? [0, "asc"];
    const nextSortKey = `${sort[0]}:${sort[1]}`;

    const rowsUpdateStartedAt = performance.now();

    tableApi.clear();
    tableApi.rows.add(data.data);

    const rowsUpdateMs = performance.now() - rowsUpdateStartedAt;

    const visibilityStartedAt = performance.now();
    const nextVisibleSet = new Set<number>(data.visible);
    let visibilityChanges = 0;
    const columnsToShow: number[] = [];
    const columnsToHide: number[] = [];

    const hasColReorderApi =
        tableApi.colReorder &&
        typeof tableApi.colReorder.disable === "function" &&
        typeof tableApi.colReorder.enable === "function";
    const colReorderSuspendStartedAt = performance.now();
    if (hasColReorderApi) {
        tableApi.colReorder.disable();
    }
    const colReorderSuspendMs = performance.now() - colReorderSuspendStartedAt;

    for (let i = 0; i < data.columns.length; i++) {
        const shouldBeVisible = nextVisibleSet.has(i);
        if (state.lastVisibleByCol[i] === shouldBeVisible) {
            continue;
        }
        const apiColIndex = i + 1;
        if (shouldBeVisible) columnsToShow.push(apiColIndex);
        else columnsToHide.push(apiColIndex);
        state.lastVisibleByCol[i] = shouldBeVisible;
        visibilityChanges++;
    }

    const showStartedAt = performance.now();
    if (columnsToShow.length > 0) {
        tableApi.columns(columnsToShow).visible(true, false);
    }
    const showMs = performance.now() - showStartedAt;

    const hideStartedAt = performance.now();
    if (columnsToHide.length > 0) {
        tableApi.columns(columnsToHide).visible(false, false);
    }
    const hideMs = performance.now() - hideStartedAt;

    const colReorderResumeStartedAt = performance.now();
    if (hasColReorderApi) {
        tableApi.colReorder.enable();
    }
    const colReorderResumeMs = performance.now() - colReorderResumeStartedAt;
    const visibilityMs = performance.now() - visibilityStartedAt;

    if (state.lastSortKey !== nextSortKey) {
        tableApi.order([sort]);
        state.lastSortKey = nextSortKey;
    }

    const drawStartedAt = performance.now();
    state.resetSelection?.();
    const adjustStartedAt = performance.now();
    if (visibilityChanges > 0) {
        tableApi.columns.adjust();
    }
    const adjustMs = performance.now() - adjustStartedAt;
    tableApi.draw(false);
    const drawMs = performance.now() - drawStartedAt;

    logTableAdapter(state.containerId, "incremental update applied", {
        rows: data.data.length,
        columns: data.columns.length,
        visibilityChanges,
        shownChanges: columnsToShow.length,
        hiddenChanges: columnsToHide.length,
        colReorderSuspended: hasColReorderApi,
        colReorderSuspendMs: Number(colReorderSuspendMs.toFixed(2)),
        showMs: Number(showMs.toFixed(2)),
        hideMs: Number(hideMs.toFixed(2)),
        colReorderResumeMs: Number(colReorderResumeMs.toFixed(2)),
        rowsUpdateMs: Number(rowsUpdateMs.toFixed(2)),
        visibilityMs: Number(visibilityMs.toFixed(2)),
        adjustMs: Number(adjustMs.toFixed(2)),
        drawMs: Number(drawMs.toFixed(2)),
        elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
    });
}

function disposeContainerState(container: HTMLElement): void {
    if (!containerStateByElem.has(container)) return;
    // Destroying large DataTable instances can block the main thread for seconds.
    // Clearing container HTML releases the old subtree and keeps route switches responsive.
    containerStateByElem.delete(container);
}

export function setupContainer(
    container: HTMLElement,
    data: TableData,
    deps: TableAdapterDeps,
    callbacks?: TableCallbacks,
): HTMLTableElement {
    const containerId = container.id || "(anonymous-container)";
    const setupStartedAt = performance.now();
    const finishSpan = startPerfSpan("table.setupContainer", {
        rows: data.data.length,
        columns: data.columns.length,
    });
    const schemaKey = buildSchemaKey(data);
    const existingState = containerStateByElem.get(container);
    if (existingState && existingState.schemaKey === schemaKey) {
        incrementPerfCounter("table.incremental.reuse", 1, {
            reason: "schema-match",
        });
        logTableAdapter(containerId, "reuse schema-match", {
            rows: data.data.length,
            columns: data.columns.length,
        });
        applyIncrementalUpdate(existingState, data);
        finishSpan();
        logTableAdapter(containerId, "setupContainer end (reuse)", {
            elapsedMs: Number((performance.now() - setupStartedAt).toFixed(2)),
        });
        return existingState.tableElem;
    }

    incrementPerfCounter("table.incremental.rebuild", 1, {
        reason: existingState ? "schema-change" : "first-build",
    });
    logTableAdapter(containerId, "rebuild", {
        reason: existingState ? "schema-change" : "first-build",
        rows: data.data.length,
        columns: data.columns.length,
    });

    disposeContainerState(container);

    container.innerHTML = "";
    addTableShell(container, deps.uuidv4(), deps.htmlToElement);
    bindExportActions(container, callbacks?.actions?.download);
    const table = container.getElementsByTagName("table")[0] as HTMLTableElement;

    const runtimeState: TableRuntimeState = {
        dataSet: data,
    };

    const nextState: TableContainerState = {
        schemaKey,
        tableElem: table,
        containerId,
        runtimeState,
        bootstrappedData: data,
        tableApi: null,
        resetSelection: null,
        pendingData: null,
        lastVisibleByCol: data.columns.map((_, index) => data.visible.includes(index)),
        lastSortKey: `${(data.sort ?? [0, "asc"])[0]}:${(data.sort ?? [0, "asc"])[1]}`,
    };

    containerStateByElem.set(container, nextState);

    setupTable(
        container,
        table,
        runtimeState,
        callbacks,
        deps,
        finishSpan,
        (tableApi, resetSelection) => {
            nextState.tableApi = tableApi;
            nextState.resetSelection = resetSelection;
            logTableAdapter(containerId, "table api ready", {
                elapsedMs: Number((performance.now() - setupStartedAt).toFixed(2)),
            });
            if (nextState.pendingData) {
                const pending = nextState.pendingData;
                nextState.pendingData = null;
                if (pending !== nextState.bootstrappedData) {
                    requestAnimationFrame(() => {
                        applyIncrementalUpdate(nextState, pending);
                    });
                } else {
                    logTableAdapter(containerId, "pending update skipped (already bootstrapped)");
                }
            }
        },
    );
    return table;
}
