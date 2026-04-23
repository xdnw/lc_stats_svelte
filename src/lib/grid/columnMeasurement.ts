export function prepareGridTableForWidthMeasurement(
    tableElement: HTMLTableElement,
): HTMLTableElement {
    const measurementTable = tableElement.cloneNode(true) as HTMLTableElement;
    measurementTable.querySelectorAll("colgroup").forEach((node) => node.remove());
    measurementTable.querySelectorAll(".ux-grid-filler-column").forEach((node) => node.remove());
    measurementTable.querySelectorAll(".ux-grid-filter-row").forEach((node) => node.remove());
    measurementTable.classList.remove("ux-grid-table-expand");
    return measurementTable;
}