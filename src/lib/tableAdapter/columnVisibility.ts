type SetupColumnVisibilityParams = {
    containerElem: HTMLElement;
    tableApi: any;
    dataColumns: string[];
    setQueryParam: (param: string, value: string | null) => void;
};

function syncVisibleColumnsToQuery(
    tableApi: any,
    dataColumns: string[],
    setQueryParam: (param: string, value: string | null) => void,
): void {
    const visibleColumns = tableApi
        .columns()
        .indexes()
        .filter((idx: number) => idx > 0 && tableApi.column(idx).visible())
        .map((idx: number) => dataColumns[idx - 1])
        .toArray();
    setQueryParam("columns", visibleColumns.join("."));
}

export function setupColumnVisibilityController(
    params: SetupColumnVisibilityParams,
): void {
    const { containerElem, tableApi, dataColumns, setQueryParam } = params;

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
                syncVisibleColumnsToQuery(tableApi, dataColumns, setQueryParam);
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
        syncVisibleColumnsToQuery(tableApi, dataColumns, setQueryParam);
        tableApi.columns.adjust().draw(false);
        renderColumnManagerList();
    });
    hideAllBtnEl.addEventListener("click", () => {
        for (let i = 1; i < dataColumns.length; i++) {
            tableApi.column(i + 1).visible(false, false);
        }
        syncVisibleColumnsToQuery(tableApi, dataColumns, setQueryParam);
        tableApi.columns.adjust().draw(false);
        renderColumnManagerList();
    });

    renderColumnManagerList();
    tableApi.on("column-visibility", renderColumnManagerList);
}
