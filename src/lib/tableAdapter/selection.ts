type SelectionChangePayload = {
    selectedRowIndexes: number[];
    selectedRows: any[][];
};

type CreateSelectionControllerParams = {
    containerElem: HTMLElement;
    onSelectionChange?: ((selection: SelectionChangePayload) => void) | undefined;
};

export function createSelectionController(params: CreateSelectionControllerParams) {
    const { containerElem, onSelectionChange } = params;
    const selectedRowIndexesSet = new Set<number>();
    let lastSelectionVisibleIndex: number | null = null;

    function getFilteredRowIndexes(tableApi: any): number[] {
        return tableApi.rows({ search: "applied" }).indexes().toArray();
    }

    function getVisiblePageRowIndexes(tableApi: any): number[] {
        return tableApi
            .rows({ search: "applied", page: "current" })
            .indexes()
            .toArray();
    }

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

    function addRowSelectionListener(
        tableElem: HTMLElement,
        tableApi: any,
        renderSummaryRow: (tableApi: any) => void,
    ): void {
        tableElem.querySelector("tbody")?.addEventListener("click", (event: Event) => {
            const target = event.target as HTMLElement;
            if (!target.classList.contains("ux-row-select")) return;
            const tr = target.closest("tr");
            if (!tr) return;

            const rowIndex = tableApi.row(tr).index();
            const checkbox = target as HTMLInputElement;
            const checked = checkbox.checked;

            const visibleIndexes = getVisiblePageRowIndexes(tableApi);
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
                    if (checked) selectedRowIndexesSet.add(idx);
                    else selectedRowIndexesSet.delete(idx);
                }
            } else {
                if (checked) selectedRowIndexesSet.add(rowIndex);
                else selectedRowIndexesSet.delete(rowIndex);
            }

            lastSelectionVisibleIndex = currentVisiblePos >= 0 ? currentVisiblePos : null;
            publishSelection(tableApi);
            renderSummaryRow(tableApi);
            tableApi.draw(false);
        });
    }

    function addSummarySelectionListener(
        tableApi: any,
        renderSummaryRow: (tableApi: any) => void,
    ): void {
        const summaryRow = containerElem.querySelector("tfoot tr.ux-summary-row");
        if (!summaryRow) return;
        summaryRow.addEventListener("click", (event: Event) => {
            const target = event.target as HTMLElement;
            const button = target.closest(".ux-select-visible-btn") as HTMLButtonElement | null;
            if (!button) return;

            const visibleIndexes = getFilteredRowIndexes(tableApi);
            const allVisibleSelected =
                visibleIndexes.length > 0 &&
                visibleIndexes.every((idx: number) => selectedRowIndexesSet.has(idx));
            if (allVisibleSelected) {
                visibleIndexes.forEach((idx: number) => selectedRowIndexesSet.delete(idx));
            } else {
                visibleIndexes.forEach((idx: number) => selectedRowIndexesSet.add(idx));
            }
            publishSelection(tableApi);
            renderSummaryRow(tableApi);
            tableApi.draw(false);
        });
    }

    function resetSelection(tableApi: any): void {
        selectedRowIndexesSet.clear();
        lastSelectionVisibleIndex = null;
        publishSelection(tableApi);
    }

    return {
        selectedRowIndexesSet,
        isSelected: (idx: number) => selectedRowIndexesSet.has(idx),
        getFilteredRowIndexes,
        publishSelection,
        resetSelection,
        addRowSelectionListener,
        addSummarySelectionListener,
    };
}
