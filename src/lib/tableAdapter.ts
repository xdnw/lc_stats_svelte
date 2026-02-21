type TableDataSet = {
    columns: string[];
    data: any[][];
    searchable: number[];
    visible: number[];
    cell_format: { [key: string]: number[] };
    row_format:
    | ((row: HTMLElement, data: { [key: string]: any }, index: number) => void)
    | null;
    sort: [number, string];
    onSelectionChange?: (selection: {
        selectedRowIndexes: number[];
        selectedRows: any[][];
    }) => void;
};

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
    return deps.ensureScriptsLoaded(["dtjs1", "dtjs2", "dtjs3"]);
}

function addTable(container: HTMLElement, id: string, deps: TableAdapterDeps) {
    const modalId = `tblColModal-${id}`;
    const dropdownId = `dropdownMenuButton-${id}`;

    container.appendChild(
        deps.htmlToElement(`<div class="ux-toolbar">
    <button class="btn ux-btn" type="button" data-bs-toggle="modal" data-bs-target="#${modalId}" aria-expanded="false" aria-controls="${modalId}">
    <i class="bi bi-layout-three-columns"></i>&nbsp;Customize Columns&nbsp;<i class="bi bi-chevron-down"></i></button>
    <div class="dropdown d-inline">
    <button class="btn ux-btn" type="button" id="${dropdownId}" data-bs-toggle="dropdown" aria-expanded="false">
    Export&nbsp;<i class="bi bi-chevron-down"></i>
    </button>
    <ul class="dropdown-menu" aria-labelledby="${dropdownId}">
    <li><button class="dropdown-item fw-bold" type="button" onclick="download(false, 'CSV')"><kbd><i class="bi bi-download"></i> ,</kbd> Download CSV</button></li>
    <li><button class="dropdown-item fw-bold" type="button" onclick="download(true, 'CSV')"><kbd><i class="bi bi-copy"></i> ,</kbd> Copy CSV</button></li>
    <li><button class="dropdown-item fw-bold" type="button" onclick="download(false, 'TSV')"><kbd><i class="bi bi-download"></i><i class="bi bi-indent"></i></kbd> Download TSV</button></li>
    <li><button class="dropdown-item fw-bold" type="button" onclick="download(true, 'TSV')"><kbd><i class="bi bi-copy"></i><i class="bi bi-indent"></i></kbd> Copy TSV</button></li>
    </ul>
    </div>
    </div>`),
    );
    container.appendChild(
        deps.htmlToElement(`<div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="${modalId}-label">Customize Columns</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="ux-callout mb-2">
                    Search and toggle visible columns. Changes apply immediately.
                </div>
                <input class="form-control mb-2 ux-colmgr-search" type="search" placeholder="Search columns" aria-label="Search columns">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <button class="btn ux-btn btn-sm ux-colmgr-all" type="button">Show all</button>
                    <button class="btn ux-btn btn-sm ux-colmgr-none" type="button">Hide all</button>
                    <span class="small ux-muted ux-colmgr-count"></span>
                </div>
                <div class="ux-surface p-2 ux-colmgr-list" style="max-height:50vh;overflow:auto;"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>`),
    );
    container.appendChild(
        deps.htmlToElement(`<div class="ux-table-wrap"><table id="${id}" class="bg-body-secondary border table compact table-bordered table-striped d-none" style="width:100%">
        <thead class="table-info"><tr></tr></thead>
        <tbody></tbody>
        <tfoot><tr></tr></tfoot>
    </table></div>`),
    );
}

function setupTable(
    containerElem: HTMLElement,
    tableElem: HTMLElement,
    dataSetRoot: TableDataSet,
    deps: TableAdapterDeps,
) {
    function getColumnToneClass(title: string | null | undefined): string {
        const normalized = (title ?? "").toLowerCase();
        if (normalized.includes("selected")) return "ux-col-selected";
        if (normalized.includes("compared") || normalized.includes("confirmed")) {
            return "ux-col-compared";
        }
        return "";
    }

    ensureJqueryLoaded(deps).then(() => {
        const jqTable = $(tableElem);

        const visibleColumns = dataSetRoot.visible;
        const dataColumns = dataSetRoot.columns;
        const dataList = dataSetRoot.data;
        const searchableColumns = dataSetRoot.searchable;
        const cell_format = dataSetRoot.cell_format;
        const row_format = dataSetRoot.row_format;
        let sort = dataSetRoot.sort;
        const onSelectionChange = dataSetRoot.onSelectionChange;
        if (sort == null) sort = [0, "asc"];

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

        const cellFormatByCol: {
            [key: number]: (data: number, type: any, row: any, meta: any) => void;
        } = {};
        if (cell_format != null) {
            for (const func in cell_format) {
                const cols: number[] = cell_format[func];
                for (const col of cols) {
                    const funcObj = (window as any)[func] as Function;
                    cellFormatByCol[col] = funcObj as any;
                    if (funcObj == null) {
                        console.log("No function found for " + func);
                    }
                }
            }
        }

        const columnsInfo: {
            data: number;
            className?: string;
            render?: any;
            visible?: boolean;
        }[] = [];
        if (dataColumns.length > 0) {
            for (let i = 0; i < dataColumns.length; i++) {
                const toneClass = getColumnToneClass(dataColumns[i]);
                const columnInfo: {
                    orderDataType?: string;
                    data: number;
                    className: string;
                    render?: any;
                    defaultContent?: string;
                } = {
                    data: i,
                    className: `details-control ${toneClass}`.trim(),
                    defaultContent: "",
                };
                const renderFunc = cellFormatByCol[i];
                if (renderFunc != null) {
                    columnInfo.render = renderFunc;
                    if (
                        renderFunc == (window as any).formatNumber ||
                        renderFunc == (window as any).formatMoney
                    ) {
                        columnInfo.orderDataType = "numeric-comma";
                    }
                }
                columnsInfo.push(columnInfo);
            }
        }
        const tableArr: any[] = [null];

        const thead = containerElem.querySelector("thead tr");
        const tfoot = containerElem.querySelector("tfoot tr");
        function handleSearch(input: HTMLInputElement, _event: Event) {
            const th = input.closest("th");
            if (!th || tableArr[0] == null) return;
            const column = tableArr[0].column(th as any);
            if (column.search() !== input.value) {
                column.search(input.value).draw();
            }
        }
        function stopPropagation(event: Event) {
            event.stopPropagation();
        }
        if (thead && tfoot) {
            const theadFragment = document.createDocumentFragment();
            const tfootFragment = document.createDocumentFragment();
            const summaryRow = document.createElement("tr");
            summaryRow.className = "ux-summary-row";

            const thNumber = document.createElement("th");
            thNumber.textContent = "#";
            theadFragment.appendChild(thNumber);

            const tfNumber = document.createElement("th");
            tfootFragment.appendChild(tfNumber);

            const summaryActionsCell = document.createElement("th");
            summaryActionsCell.className = "ux-summary-actions";
            summaryActionsCell.innerHTML = `<button type="button" class="btn btn-sm ux-btn ux-select-visible-btn" title="Select all filtered" aria-label="Select all filtered"><i class="bi bi-square" aria-hidden="true"></i></button>`;
            summaryRow.appendChild(summaryActionsCell);

            for (let i = 0; i < columnsInfo.length; i++) {
                const columnInfo = columnsInfo[i];
                const title = dataColumns[i];
                if (visibleColumns != null) {
                    columnInfo["visible"] = visibleColumns.includes(i);
                }

                const th = document.createElement("th");
                const tf = document.createElement("th");
                const summaryCell = document.createElement("th");
                summaryCell.className = "ux-summary-cell";

                if (title != null) {
                    const toneClass = getColumnToneClass(title);
                    if (toneClass) {
                        th.classList.add(toneClass);
                        tf.classList.add(toneClass);
                        summaryCell.classList.add(toneClass);
                    }
                    if (
                        searchableColumns == null ||
                        searchableColumns.includes(i)
                    ) {
                        const input = document.createElement("input");
                        input.type = "text";
                        input.placeholder = title;
                        input.style.width = "100%";
                        input.addEventListener("keyup", handleSearch.bind(null, input));
                        input.addEventListener("change", handleSearch.bind(null, input));
                        input.addEventListener("clear", handleSearch.bind(null, input));
                        input.addEventListener("click", stopPropagation);
                        th.appendChild(input);
                    } else {
                        th.textContent = title;
                    }
                    tf.textContent = i === 0 ? "" : title;
                }

                theadFragment.appendChild(th);
                tfootFragment.appendChild(tf);
                summaryRow.appendChild(summaryCell);
            }

            thead.appendChild(theadFragment);
            tfoot.appendChild(tfootFragment);
            tfoot.parentElement?.appendChild(summaryRow);
        }

        ensureDTLoaded(deps).then(() => {
            const selectedRowIndexesSet = new Set<number>();
            let lastSelectionVisibleIndex: number | null = null;

            function publishSelection(tableApi: any): void {
                if (!onSelectionChange) return;
                const selectedRowIndexes = Array.from(selectedRowIndexesSet);
                const selectedRows = selectedRowIndexes
                    .map((idx) => tableApi.row(idx).data())
                    .filter((row: any) => row != null);
                onSelectionChange({
                    selectedRowIndexes,
                    selectedRows,
                });
            }

            function getFilteredRowIndexes(tableApi: any): number[] {
                return tableApi.rows({ search: "applied" }).indexes().toArray();
            }

            function getVisiblePageRowIndexes(tableApi: any): number[] {
                return tableApi
                    .rows({ search: "applied", page: "current" })
                    .indexes()
                    .toArray();
            }

            function renderSummaryRow(tableApi: any): void {
                const filteredIndexes = getFilteredRowIndexes(tableApi);
                const selectedIndexes = filteredIndexes.filter((idx: number) =>
                    selectedRowIndexesSet.has(idx),
                );
                const activeIndexes =
                    selectedIndexes.length > 0 ? selectedIndexes : filteredIndexes;

                const filteredSelectableIndexes = getFilteredRowIndexes(tableApi);
                const allVisibleSelected =
                    filteredSelectableIndexes.length > 0 &&
                    filteredSelectableIndexes.every((idx: number) =>
                        selectedRowIndexesSet.has(idx),
                    );
                const selectVisibleLabel = allVisibleSelected
                    ? "Deselect all filtered"
                    : "Select all filtered";

                const summaryRow = containerElem.querySelector("tfoot tr.ux-summary-row");
                if (!summaryRow) return;

                const actionButton = summaryRow.querySelector(
                    ".ux-select-visible-btn",
                ) as HTMLButtonElement | null;
                if (actionButton) {
                    const icon = actionButton.querySelector("i");
                    if (icon) {
                        icon.className = allVisibleSelected
                            ? "bi bi-check2-square"
                            : "bi bi-square";
                    }
                    actionButton.title = selectVisibleLabel;
                    actionButton.setAttribute("aria-label", selectVisibleLabel);
                }

                const visibleApiIndexes: number[] = tableApi
                    .columns(":visible")
                    .indexes()
                    .toArray()
                    .filter((idx: number) => idx > 0);

                let summaryCellPos = 1;
                for (const colIndex of visibleApiIndexes) {
                    const summaryCell = summaryRow.children[
                        summaryCellPos
                    ] as HTMLElement | undefined;
                    summaryCellPos++;
                    if (!summaryCell) continue;

                    const dataColIndex = colIndex - 1;
                    const colNumeric = isDataColumnNumeric(dataColIndex);

                    summaryCell.style.display = "";

                    if (!colNumeric) {
                        summaryCell.textContent = "";
                        continue;
                    }

                    const vals: number[] = activeIndexes.map((rowIdx: number) => {
                        const rowData = tableApi.row(rowIdx).data();
                        const value = rowData ? rowData[dataColIndex] : 0;
                        return typeof value === "number" ? value : Number(value) || 0;
                    });

                    if (vals.length === 0) {
                        summaryCell.textContent = "";
                        continue;
                    }

                    const sum = vals.reduce((a: number, b: number) => a + b, 0);
                    const avg = sum / vals.length;
                    const isMoney = isDataColumnMoney(dataColIndex);
                    summaryCell.innerHTML = `<div class="ux-summary-values"><span>Σ ${formatSummaryValue(sum, isMoney)}</span><span>x̄ ${formatSummaryValue(avg, isMoney)}</span></div>`;
                }

                while (summaryCellPos < summaryRow.children.length) {
                    const extraCell = summaryRow.children[
                        summaryCellPos
                    ] as HTMLElement | undefined;
                    summaryCellPos++;
                    if (!extraCell) continue;
                    extraCell.textContent = "";
                }
            }

            ($.fn as any).dataTableExt.oStdClasses.sWrapper =
                "py-2 px-2 dataTables_wrapper";
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
                order: [sort],
                autoWidth: false,
                searchHighlight: false,
                info: false,
                processing: false,
                stateSave: false,
                scrollX: false,
                initComplete: function () {
                    const api = (this as any).api();
                    api.columns.adjust();
                    renderSummaryRow(api);
                },
                rowCallback: function (
                    row: any,
                    data: any,
                    _displayIndex: any,
                    displayIndexFull: any,
                ) {
                    const api = (this as any).api();
                    const rowIndex = api.row(row).index();
                    const isSelected = selectedRowIndexesSet.has(rowIndex);
                    $(row).toggleClass("table-active", isSelected);
                    $("td:eq(0)", row).html(
                        `<label class="d-inline-flex align-items-center m-0 ux-row-index"><input type="checkbox" class="ux-row-select" ${isSelected ? "checked" : ""} /><span>${displayIndexFull + 1}</span></label>`,
                    );
                    if (row_format) {
                        row_format(row, data, displayIndexFull);
                    }
                },
                drawCallback: function () {
                    renderSummaryRow(this.api());
                },
            }));

            table.on("column-reorder", function (_e: any, _settings: any, _details: any) {
                table.draw(false);
            });

            function syncVisibleColumnsToQuery(tableApi: any): void {
                const visibleColumns = tableApi
                    .columns()
                    .indexes()
                    .filter((idx: number) => idx > 0 && tableApi.column(idx).visible())
                    .map((idx: number) => dataColumns[idx - 1])
                    .toArray();
                deps.setQueryParam("columns", visibleColumns.join("."));
            }

            function setupColumnManager(tableApi: any): void {
                const searchInput = containerElem.querySelector(
                    ".ux-colmgr-search",
                ) as HTMLInputElement | null;
                const listElem = containerElem.querySelector(
                    ".ux-colmgr-list",
                ) as HTMLElement | null;
                const countElem = containerElem.querySelector(
                    ".ux-colmgr-count",
                ) as HTMLElement | null;
                const showAllBtn = containerElem.querySelector(
                    ".ux-colmgr-all",
                ) as HTMLButtonElement | null;
                const hideAllBtn = containerElem.querySelector(
                    ".ux-colmgr-none",
                ) as HTMLButtonElement | null;

                if (!searchInput || !listElem || !countElem || !showAllBtn || !hideAllBtn) {
                    return;
                }

                const searchInputEl = searchInput;
                const listElemEl = listElem;
                const countElemEl = countElem;
                const showAllBtnEl = showAllBtn;
                const hideAllBtnEl = hideAllBtn;

                function renderColumnManagerList(): void {
                    const query = searchInputEl.value.trim().toLowerCase();
                    listElemEl.innerHTML = "";

                    let visibleCount = 0;
                    let matchedCount = 0;
                    for (let i = 0; i < dataColumns.length; i++) {
                        if (i === 0) continue;
                        const title = dataColumns[i] ?? "";
                        const isVisible = tableApi.column(i + 1).visible();
                        if (isVisible) visibleCount++;

                        if (query && !title.toLowerCase().includes(query)) {
                            continue;
                        }

                        matchedCount++;
                        const row = document.createElement("label");
                        row.className = "form-check d-flex align-items-center gap-2 mb-1";

                        const checkbox = document.createElement("input");
                        checkbox.type = "checkbox";
                        checkbox.className = "form-check-input mt-0";
                        checkbox.checked = isVisible;
                        checkbox.addEventListener("change", () => {
                            tableApi.column(i + 1).visible(checkbox.checked);
                            syncVisibleColumnsToQuery(tableApi);
                            tableApi.columns.adjust().draw(false);
                            renderColumnManagerList();
                        });

                        const label = document.createElement("span");
                        label.textContent = title;

                        row.appendChild(checkbox);
                        row.appendChild(label);
                        listElemEl.appendChild(row);
                    }

                    if (matchedCount === 0) {
                        const empty = document.createElement("div");
                        empty.className = "small ux-muted";
                        empty.textContent = "No columns match your search.";
                        listElemEl.appendChild(empty);
                    }

                    countElemEl.textContent = `Visible: ${visibleCount}/${Math.max(0, dataColumns.length - 1)}`;
                }

                searchInputEl.addEventListener("input", renderColumnManagerList);
                showAllBtnEl.addEventListener("click", () => {
                    for (let i = 1; i < dataColumns.length; i++) {
                        tableApi.column(i + 1).visible(true, false);
                    }
                    syncVisibleColumnsToQuery(tableApi);
                    tableApi.columns.adjust().draw(false);
                    renderColumnManagerList();
                });
                hideAllBtnEl.addEventListener("click", () => {
                    for (let i = 1; i < dataColumns.length; i++) {
                        tableApi.column(i + 1).visible(false, false);
                    }
                    syncVisibleColumnsToQuery(tableApi);
                    tableApi.columns.adjust().draw(false);
                    renderColumnManagerList();
                });

                renderColumnManagerList();
                tableApi.on("column-visibility", renderColumnManagerList);
            }

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

            function addRowSelectionListener(jqTable: any, table: any) {
                jqTable.querySelector("tbody").addEventListener("click", function (event: Event) {
                    const target = event.target as HTMLElement;
                    if (!target.classList.contains("ux-row-select")) return;
                    const tr = target.closest("tr");
                    if (!tr) return;

                    const rowIndex = table.row(tr).index();
                    const checkbox = target as HTMLInputElement;
                    const checked = checkbox.checked;

                    const visibleIndexes = getVisiblePageRowIndexes(table);
                    const currentVisiblePos = visibleIndexes.indexOf(rowIndex);
                    const mouseEvent = event as MouseEvent;

                    if (
                        mouseEvent.shiftKey &&
                        lastSelectionVisibleIndex != null &&
                        currentVisiblePos >= 0
                    ) {
                        const start = Math.min(lastSelectionVisibleIndex, currentVisiblePos);
                        const end = Math.max(lastSelectionVisibleIndex, currentVisiblePos);
                        for (let i = start; i <= end; i++) {
                            const idx = visibleIndexes[i];
                            if (checked) {
                                selectedRowIndexesSet.add(idx);
                            } else {
                                selectedRowIndexesSet.delete(idx);
                            }
                        }
                    } else {
                        if (checked) {
                            selectedRowIndexesSet.add(rowIndex);
                        } else {
                            selectedRowIndexesSet.delete(rowIndex);
                        }
                    }

                    lastSelectionVisibleIndex =
                        currentVisiblePos >= 0 ? currentVisiblePos : null;
                    publishSelection(table);
                    table.draw(false);
                });
            }

            function addSummaryActionsListener(table: any) {
                const summaryRow = containerElem.querySelector("tfoot tr.ux-summary-row");
                if (!summaryRow) return;
                summaryRow.addEventListener("click", function (event: Event) {
                    const target = event.target as HTMLElement;
                    const button = target.closest(
                        ".ux-select-visible-btn",
                    ) as HTMLButtonElement | null;
                    if (!button) return;

                    const visibleIndexes = getFilteredRowIndexes(table);
                    const allVisibleSelected =
                        visibleIndexes.length > 0 &&
                        visibleIndexes.every((idx: number) => selectedRowIndexesSet.has(idx));
                    if (allVisibleSelected) {
                        visibleIndexes.forEach((idx: number) =>
                            selectedRowIndexesSet.delete(idx),
                        );
                    } else {
                        visibleIndexes.forEach((idx: number) => selectedRowIndexesSet.add(idx));
                    }
                    publishSelection(table);
                    table.draw(false);
                });
            }

            setupColumnManager(table);
            addRowDetailsListener(tableElem, table);
            addRowSelectionListener(tableElem, table);
            addSummaryActionsListener(table);
            publishSelection(table);
            tableElem.classList.remove("d-none");
            table.columns.adjust().draw(false);
        });
    });
}

export function setupContainer(
    container: HTMLElement,
    data: TableDataSet,
    deps: TableAdapterDeps,
): HTMLTableElement {
    container.innerHTML = "";
    addTable(container, deps.uuidv4(), deps);
    const table = container.getElementsByTagName("table")[0] as HTMLTableElement;
    setupTable(container, table, data, deps);
    return table;
}
