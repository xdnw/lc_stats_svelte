import type { GridPageSize, GridViewport } from "./types";

export const GRID_VIRTUAL_MIN_ROWS = 48;

const GRID_VIRTUAL_VISIBLE_ROW_MULTIPLIER = 2;
const GRID_VIRTUAL_COMPACT_VISIBLE_ROW_MULTIPLIER = 4;
const GRID_VIRTUAL_WINDOW_CHUNK_COUNT = 2;
const GRID_VIRTUAL_COMPACT_WINDOW_CHUNK_COUNT = 3;

export type GridRowWindow = {
    start: number;
    end: number;
};

export type GridVirtualWindow = GridRowWindow & {
    paddingTop: number;
    paddingBottom: number;
};

export type GridRowHeightEstimateResult = {
    estimate: number;
    seeded: boolean;
};

function clampInt(value: number, min: number, max: number): number {
    const normalized = Number.isFinite(value) ? Math.floor(value) : min;
    return Math.min(max, Math.max(min, normalized));
}

function clampSize(value: number, minimum = 1): number {
    return Math.max(minimum, Number.isFinite(value) ? value : minimum);
}

function getAllRowsFallbackEnd(totalRows: number, fallbackRowCount?: number): number {
    if (totalRows <= 0) return 0;
    return Math.min(
        totalRows,
        Math.max(1, Math.floor(fallbackRowCount ?? GRID_VIRTUAL_MIN_ROWS)),
    );
}

export function resolveGridVirtualMinimumRows(options: {
    containerHeight: number;
    rowHeight: number;
    baseMinimumRows?: number;
    compactViewport?: boolean;
    coarsePointer?: boolean;
}): number {
    const baseMinimumRows = Math.max(
        1,
        Math.floor(options.baseMinimumRows ?? GRID_VIRTUAL_MIN_ROWS),
    );
    const rowHeight = clampSize(options.rowHeight);
    const containerHeight = clampSize(options.containerHeight);
    const visibleRows = Math.max(1, Math.ceil(containerHeight / rowHeight));
    const visibleRowMultiplier = options.compactViewport || options.coarsePointer
        ? GRID_VIRTUAL_COMPACT_VISIBLE_ROW_MULTIPLIER
        : GRID_VIRTUAL_VISIBLE_ROW_MULTIPLIER;

    return Math.max(baseMinimumRows, visibleRows * visibleRowMultiplier);
}

export function resolveGridVirtualWindowChunkCount(options: {
    compactViewport?: boolean;
    coarsePointer?: boolean;
}): number {
    return options.compactViewport || options.coarsePointer
        ? GRID_VIRTUAL_COMPACT_WINDOW_CHUNK_COUNT
        : GRID_VIRTUAL_WINDOW_CHUNK_COUNT;
}

export function resolveGridRowHeightEstimate(options: {
    measuredHeights: number[];
    currentEstimate: number;
    pageSize: GridPageSize;
    seeded: boolean;
    minimumRowHeight?: number;
}): GridRowHeightEstimateResult {
    const heights = options.measuredHeights.filter(
        (value) => Number.isFinite(value) && value > 0,
    );
    if (heights.length === 0) {
        return {
            estimate: options.currentEstimate,
            seeded: options.pageSize === "all" ? options.seeded : false,
        };
    }

    if (options.pageSize === "all" && options.seeded) {
        return {
            estimate: options.currentEstimate,
            seeded: true,
        };
    }

    const minimumRowHeight = Math.max(
        1,
        Math.floor(options.minimumRowHeight ?? 18),
    );
    const nextEstimate = Math.max(
        minimumRowHeight,
        Math.round(
            (heights.reduce((sum, value) => sum + value, 0) / heights.length) * 100,
        ) / 100,
    );
    const estimate = Math.abs(nextEstimate - options.currentEstimate) < 0.5
        ? options.currentEstimate
        : nextEstimate;

    return {
        estimate,
        seeded: options.pageSize === "all",
    };
}

export function resolveGridRowWindow(options: {
    pageIndex: number;
    pageSize: GridPageSize;
    viewport?: GridViewport;
    totalRows: number;
    fallbackRowCount?: number;
}): GridRowWindow {
    const totalRows = Math.max(0, Math.floor(options.totalRows));
    if (options.pageSize !== "all") {
        const safePageSize = Math.max(1, Math.floor(options.pageSize));
        const start = Math.max(0, Math.floor(options.pageIndex)) * safePageSize;
        const end = Math.min(totalRows, start + safePageSize);
        return { start, end };
    }

    const fallbackEnd = getAllRowsFallbackEnd(totalRows, options.fallbackRowCount);
    if (!options.viewport) {
        return { start: 0, end: fallbackEnd };
    }

    const start = clampInt(options.viewport.start, 0, totalRows);
    const end = clampInt(options.viewport.end, start, totalRows);
    if (end > start) {
        return { start, end };
    }

    return { start: 0, end: fallbackEnd };
}

export function getGridInitialViewport(options: {
    totalRows: number;
    containerHeight: number;
    rowHeight: number;
    minimumRows?: number;
}): GridRowWindow {
    const totalRows = Math.max(0, Math.floor(options.totalRows));
    if (totalRows === 0) return { start: 0, end: 0 };

    const rowHeight = clampSize(options.rowHeight);
    const containerHeight = clampSize(options.containerHeight);
    const visibleRows = Math.max(1, Math.ceil(containerHeight / rowHeight));
    const end = Math.min(
        totalRows,
        Math.max(visibleRows * 2, Math.floor(options.minimumRows ?? GRID_VIRTUAL_MIN_ROWS)),
    );
    return { start: 0, end };
}

export function getGridVisibleRange(options: {
    scrollTop: number;
    containerHeight: number;
    rowHeight: number;
    totalRows: number;
}): GridRowWindow {
    const totalRows = Math.max(0, Math.floor(options.totalRows));
    if (totalRows === 0) return { start: 0, end: 0 };

    const rowHeight = clampSize(options.rowHeight);
    const containerHeight = clampSize(options.containerHeight);
    const visibleRows = Math.max(1, Math.ceil(containerHeight / rowHeight));
    const start = clampInt(
        options.scrollTop / rowHeight,
        0,
        Math.max(0, totalRows - 1),
    );
    const end = Math.min(totalRows, start + visibleRows);
    return { start, end };
}

export function getGridBufferedWindow(options: {
    scrollTop: number;
    containerHeight: number;
    rowHeight: number;
    totalRows: number;
    minimumRows?: number;
}): GridRowWindow {
    const visible = getGridVisibleRange(options);
    const totalRows = Math.max(0, Math.floor(options.totalRows));
    if (totalRows === 0) return { start: 0, end: 0 };

    const rowHeight = clampSize(options.rowHeight);
    const containerHeight = clampSize(options.containerHeight);
    const visibleRows = Math.max(1, Math.ceil(containerHeight / rowHeight));
    const targetWindowRows = Math.min(
        totalRows,
        Math.max(
            Math.floor(options.minimumRows ?? GRID_VIRTUAL_MIN_ROWS) * 2,
            visibleRows * 4,
        ),
    );
    const visibleCount = Math.max(1, visible.end - visible.start);
    const leadingRows = Math.max(
        0,
        Math.floor((targetWindowRows - visibleCount) / 2),
    );
    let start = Math.max(0, visible.start - leadingRows);
    let end = Math.min(totalRows, start + targetWindowRows);
    start = Math.max(0, end - targetWindowRows);
    return { start, end };
}

export function isGridRangeWithinWindow(options: {
    range: GridRowWindow;
    window: GridRowWindow;
    marginRows: number;
}): boolean {
    const marginRows = Math.max(0, Math.floor(options.marginRows));
    return options.range.start >= options.window.start + marginRows &&
        options.range.end <= options.window.end - marginRows;
}

export function getGridVirtualWindow(options: {
    scrollTop: number;
    containerHeight: number;
    rowHeight: number;
    totalRows: number;
    minimumRows?: number;
    windowChunkCount?: number;
}): GridVirtualWindow {
    const totalRows = Math.max(0, Math.floor(options.totalRows));
    if (totalRows === 0) {
        return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };
    }

    const rowHeight = clampSize(options.rowHeight);
    const containerHeight = clampSize(options.containerHeight);
    const visibleRows = Math.max(1, Math.ceil(containerHeight / rowHeight));
    const chunkRows = Math.max(
        visibleRows * 2,
        Math.floor(options.minimumRows ?? GRID_VIRTUAL_MIN_ROWS),
    );
    const windowChunkCount = Math.max(
        1,
        Math.floor(options.windowChunkCount ?? GRID_VIRTUAL_WINDOW_CHUNK_COUNT),
    );
    const visibleStart = clampInt(
        options.scrollTop / rowHeight,
        0,
        Math.max(0, totalRows - 1),
    );
    const start = Math.min(
        totalRows,
        Math.floor(visibleStart / chunkRows) * chunkRows,
    );
    const end = Math.min(
        totalRows,
        Math.max(start + visibleRows, start + chunkRows * windowChunkCount),
    );

    return {
        start,
        end,
        paddingTop: start * rowHeight,
        paddingBottom: Math.max(0, (totalRows - end) * rowHeight),
    };
}
