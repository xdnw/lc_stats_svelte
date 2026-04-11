import { describe, expect, it } from "vitest";
import {
    getGridBufferedWindow,
    getGridInitialViewport,
    getGridVisibleRange,
    getGridVirtualWindow,
    isGridRangeWithinWindow,
    resolveGridVirtualMinimumRows,
    resolveGridRowHeightEstimate,
    resolveGridRowWindow,
} from "./virtualization";

describe("grid virtualization", () => {
    it("uses a bounded initial viewport for all-rows mode", () => {
        expect(
            getGridInitialViewport({
                totalRows: 300,
                containerHeight: 560,
                rowHeight: 40,
            }),
        ).toEqual({ start: 0, end: 48 });
    });

    it("keeps scroll windows chunked instead of shifting every row", () => {
        const firstWindow = getGridVirtualWindow({
            scrollTop: 0,
            containerHeight: 560,
            rowHeight: 40,
            totalRows: 300,
        });
        const nearbyWindow = getGridVirtualWindow({
            scrollTop: 40 * 10,
            containerHeight: 560,
            rowHeight: 40,
            totalRows: 300,
        });
        const laterWindow = getGridVirtualWindow({
            scrollTop: 40 * 55,
            containerHeight: 560,
            rowHeight: 40,
            totalRows: 300,
        });

        expect(nearbyWindow.start).toBe(firstWindow.start);
        expect(nearbyWindow.end).toBe(firstWindow.end);
        expect(laterWindow.start).toBeGreaterThan(firstWindow.start);
        expect(laterWindow.end).toBeGreaterThan(firstWindow.end);
    });

    it("expands the virtual row budget for compact or coarse all-mode viewports", () => {
        expect(
            resolveGridVirtualMinimumRows({
                containerHeight: 560,
                rowHeight: 22,
                baseMinimumRows: 48,
            }),
        ).toBe(52);

        expect(
            resolveGridVirtualMinimumRows({
                containerHeight: 560,
                rowHeight: 22,
                baseMinimumRows: 48,
                compactViewport: true,
            }),
        ).toBe(104);

        expect(
            resolveGridVirtualMinimumRows({
                containerHeight: 560,
                rowHeight: 22,
                baseMinimumRows: 48,
                coarsePointer: true,
            }),
        ).toBe(104);
    });

    it("builds a buffered window around the visible range", () => {
        const visibleRange = getGridVisibleRange({
            scrollTop: 22 * 140,
            containerHeight: 560,
            rowHeight: 22,
            totalRows: 500,
        });
        const bufferedWindow = getGridBufferedWindow({
            scrollTop: 22 * 140,
            containerHeight: 560,
            rowHeight: 22,
            totalRows: 500,
            minimumRows: 96,
        });

        expect(bufferedWindow.start).toBeLessThanOrEqual(visibleRange.start);
        expect(bufferedWindow.end).toBeGreaterThanOrEqual(visibleRange.end);
        expect(bufferedWindow.end - bufferedWindow.start).toBeGreaterThan(visibleRange.end - visibleRange.start);
    });

    it("detects when the visible range is still safely inside the rendered window", () => {
        expect(
            isGridRangeWithinWindow({
                range: { start: 120, end: 146 },
                window: { start: 96, end: 224 },
                marginRows: 24,
            }),
        ).toBe(true);

        expect(
            isGridRangeWithinWindow({
                range: { start: 108, end: 134 },
                window: { start: 96, end: 224 },
                marginRows: 24,
            }),
        ).toBe(false);
    });

    it("bounds provider row windows to the current viewport", () => {
        expect(
            resolveGridRowWindow({
                pageIndex: 0,
                pageSize: "all",
                viewport: { start: 120, end: 145 },
                totalRows: 300,
            }),
        ).toEqual({ start: 120, end: 145 });

        expect(
            resolveGridRowWindow({
                pageIndex: 2,
                pageSize: 25,
                totalRows: 300,
            }),
        ).toEqual({ start: 50, end: 75 });
    });

    it("seeds all-mode row height once and ignores later tall slabs", () => {
        const seeded = resolveGridRowHeightEstimate({
            measuredHeights: [28, 29, 30, 29],
            currentEstimate: 22,
            pageSize: "all",
            seeded: false,
        });

        expect(seeded).toEqual({ estimate: 29, seeded: true });

        expect(
            resolveGridRowHeightEstimate({
                measuredHeights: [52, 51, 49, 53],
                currentEstimate: seeded.estimate,
                pageSize: "all",
                seeded: seeded.seeded,
            }),
        ).toEqual({ estimate: 29, seeded: true });
    });

    it("keeps paged mode row height adaptive", () => {
        expect(
            resolveGridRowHeightEstimate({
                measuredHeights: [30, 31, 32, 31],
                currentEstimate: 22,
                pageSize: 25,
                seeded: false,
            }),
        ).toEqual({ estimate: 31, seeded: false });
    });
});
