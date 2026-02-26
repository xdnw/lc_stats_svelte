type ColumnInfo = {
    visible?: boolean;
};

type BuildFiltersParams = {
    containerElem: HTMLElement;
    columnsInfo: ColumnInfo[];
    dataColumns: string[];
    searchableColumns: number[];
    visibleColumns: number[];
    getColumnToneClass: (title: string | null | undefined) => string;
    getTableApi: () => any;
};

export function buildFiltersAndSummaryScaffold(
    params: BuildFiltersParams,
): void {
    const {
        containerElem,
        columnsInfo,
        dataColumns,
        searchableColumns,
        visibleColumns,
        getColumnToneClass,
        getTableApi,
    } = params;

    const thead = containerElem.querySelector("thead tr");
    const tfoot = containerElem.querySelector("tfoot tr");

    function handleSearch(input: HTMLInputElement): void {
        const th = input.closest("th");
        const tableApi = getTableApi();
        if (!th || !tableApi) return;
        const column = tableApi.column(th as any);
        if (column.search() !== input.value) {
            column.search(input.value).draw();
        }
    }

    if (!thead || !tfoot) return;

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
        columnInfo.visible = visibleColumns.includes(i);

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

            if (searchableColumns.includes(i)) {
                const input = document.createElement("input");
                input.type = "text";
                input.placeholder = title;
                input.style.width = "100%";
                input.addEventListener("keyup", () => handleSearch(input));
                input.addEventListener("change", () => handleSearch(input));
                input.addEventListener("clear", () => handleSearch(input));
                input.addEventListener("click", (event) => event.stopPropagation());
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
