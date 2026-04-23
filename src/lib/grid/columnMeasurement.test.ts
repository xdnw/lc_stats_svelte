// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { prepareGridTableForWidthMeasurement } from "./columnMeasurement";

describe("grid column width measurement", () => {
    it("removes the filter row before measuring table widths", () => {
        const table = document.createElement("table");
        table.className = "ux-grid-table ux-grid-table-expand";
        table.innerHTML = `
            <colgroup>
                <col style="width: 12rem;" />
            </colgroup>
            <thead>
                <tr>
                    <th scope="col">#</th>
                    <th scope="col">Name</th>
                    <th scope="col" class="ux-grid-filler-column"></th>
                </tr>
                <tr class="ux-grid-filter-row">
                    <th scope="col"><input class="form-control" type="search" value="wide filter" /></th>
                </tr>
            </thead>
        `;

        const measurementTable = prepareGridTableForWidthMeasurement(table);

        expect(measurementTable).not.toBe(table);
        expect(measurementTable.querySelector("colgroup")).toBeNull();
        expect(measurementTable.querySelector(".ux-grid-filler-column")).toBeNull();
        expect(measurementTable.querySelector(".ux-grid-filter-row")).toBeNull();
        expect(measurementTable.querySelectorAll("thead tr:first-child th")).toHaveLength(2);
        expect(table.querySelector(".ux-grid-filter-row")).not.toBeNull();
    });
});