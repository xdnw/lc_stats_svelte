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
        const activeRowsData = activeIndexes
            .map((rowIdx: number) => tableApi.row(rowIdx).data())
            .filter((rowData: unknown) => rowData != null) as any[];

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

            if (activeRowsData.length === 0) {
                summaryCell.textContent = "";
                continue;
            }

            let sum = 0;
            for (const rowData of activeRowsData) {
                const value = rowData[dataColIndex];
                sum += typeof value === "number" ? value : Number(value) || 0;
            }
            const avg = sum / activeRowsData.length;
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
