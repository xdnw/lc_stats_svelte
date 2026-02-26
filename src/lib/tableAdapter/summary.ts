type CreateSummaryRendererParams = {
    containerElem: HTMLElement;
    getFilteredRowIndexes: (tableApi: any) => number[];
    isDataColumnNumeric: (dataColIndex: number) => boolean;
    isDataColumnMoney: (dataColIndex: number) => boolean;
    formatSummaryValue: (value: number, isMoney: boolean) => string;
    isSelected: (rowIndex: number) => boolean;
};

export function createSummaryRenderer(params: CreateSummaryRendererParams) {
    const {
        containerElem,
        getFilteredRowIndexes,
        isDataColumnNumeric,
        isDataColumnMoney,
        formatSummaryValue,
        isSelected,
    } = params;

    return function renderSummaryRow(tableApi: any): void {
        const filteredIndexes = getFilteredRowIndexes(tableApi);
        const selectedIndexes = filteredIndexes.filter((idx: number) => isSelected(idx));
        const activeIndexes = selectedIndexes.length > 0 ? selectedIndexes : filteredIndexes;

        const allVisibleSelected =
            filteredIndexes.length > 0 &&
            filteredIndexes.every((idx: number) => isSelected(idx));
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
                icon.className = allVisibleSelected ? "bi bi-check2-square" : "bi bi-square";
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
            const summaryCell = summaryRow.children[summaryCellPos] as HTMLElement | undefined;
            summaryCellPos++;
            if (!summaryCell) continue;

            const dataColIndex = colIndex - 1;
            if (!isDataColumnNumeric(dataColIndex)) {
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
            const extraCell = summaryRow.children[summaryCellPos] as HTMLElement | undefined;
            summaryCellPos++;
            if (!extraCell) continue;
            extraCell.textContent = "";
        }
    };
}
