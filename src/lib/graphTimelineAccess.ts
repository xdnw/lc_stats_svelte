import type {
    DenseGraphFrame,
    DenseGraphTimeline,
    GraphCoalitionData,
    GraphTimeline,
    GraphTimelineRoot,
    IndexedGraphPatchFrame,
    IndexedGraphPatchTimeline,
} from "./types";

type TimelineCursor = {
    cityCount: number;
    cursor: number;
    snapshot: Array<number | null>;
    hasSnapshot: boolean;
    lastFrame: number[];
    lastAppliedTimeIndex: number;
};

const PATCH_MASK_BITS = 30;
const EMPTY_FRAME: number[] = [];
const zeroFrameByCityCount = new Map<number, number[]>();
const timelineCursorCache = new WeakMap<GraphTimeline, TimelineCursor>();

function getZeroFrame(cityCount: number): number[] {
    let frame = zeroFrameByCityCount.get(cityCount);
    if (!frame) {
        frame = Array.from({ length: cityCount }, () => 0);
        zeroFrameByCityCount.set(cityCount, frame);
    }
    return frame;
}

function resetTimelineCursor(
    cursor: TimelineCursor,
    cityCount: number,
): void {
    cursor.cityCount = cityCount;
    cursor.cursor = -1;
    cursor.snapshot = Array.from({ length: cityCount }, () => null);
    cursor.hasSnapshot = false;
    cursor.lastFrame = EMPTY_FRAME;
    cursor.lastAppliedTimeIndex = -1;
}

function getTimelineCursor(
    timeline: GraphTimeline,
    cityCount: number,
): TimelineCursor {
    let cursor = timelineCursorCache.get(timeline);
    if (!cursor) {
        cursor = {
            cityCount,
            cursor: -1,
            snapshot: [],
            hasSnapshot: false,
            lastFrame: EMPTY_FRAME,
            lastAppliedTimeIndex: -1,
        };
        resetTimelineCursor(cursor, cityCount);
        timelineCursorCache.set(timeline, cursor);
        return cursor;
    }

    if (cursor.cityCount !== cityCount) {
        resetTimelineCursor(cursor, cityCount);
    }

    return cursor;
}

function applyDenseTimelineFrame(
    cursor: TimelineCursor,
    frame: DenseGraphFrame | undefined,
): number[] {
    if (!Array.isArray(frame) || frame.length === 0) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    let nextSnapshot = cursor.snapshot;
    let hasFrameValue = false;
    for (let cityIndex = 0; cityIndex < cursor.cityCount; cityIndex += 1) {
        const value = frame[cityIndex];
        if (value === null || value === undefined) {
            continue;
        }

        if (!hasFrameValue) {
            nextSnapshot = [...cursor.snapshot];
            hasFrameValue = true;
        }
        nextSnapshot[cityIndex] = value;
    }

    if (!hasFrameValue) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    cursor.snapshot = nextSnapshot;
    cursor.hasSnapshot = true;
    return nextSnapshot as number[];
}

function advanceDenseTimelineCursor(
    cursor: TimelineCursor,
    timeline: DenseGraphTimeline,
    timeIndex: number,
): number[] | undefined {
    if (timeline.length === 0) {
        return undefined;
    }

    const targetIndex = Math.min(timeIndex, timeline.length - 1);
    while (cursor.cursor < targetIndex) {
        cursor.cursor += 1;
        cursor.lastFrame = applyDenseTimelineFrame(cursor, timeline[cursor.cursor]);
        cursor.lastAppliedTimeIndex = cursor.cursor;
    }

    return cursor.lastFrame;
}

function resolveIndexedFrameTimeOffset(
    frame: IndexedGraphPatchFrame | undefined,
): number | null {
    if (!Array.isArray(frame) || frame.length === 0) {
        return null;
    }

    const rawOffset = frame[0];
    if (!Number.isFinite(rawOffset)) {
        return null;
    }

    return Math.trunc(rawOffset);
}

function applyIndexedPatchFrame(
    cursor: TimelineCursor,
    frame: IndexedGraphPatchFrame | undefined,
): number[] {
    if (!Array.isArray(frame) || frame.length < 3) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    const patchMode = Math.trunc(frame[1] ?? Number.NaN);
    if (Number.isFinite(patchMode) && patchMode < 0) {
        return applyMaskedPatchFrame(cursor, frame, -patchMode);
    }

    let nextSnapshot = cursor.snapshot;
    let hasFrameValue = false;
    for (let patchIndex = 1; patchIndex + 1 < frame.length; patchIndex += 2) {
        const cityIndex = Math.trunc(frame[patchIndex] ?? Number.NaN);
        const value = Number(frame[patchIndex + 1]);
        if (
            !Number.isFinite(cityIndex) ||
            cityIndex < 0 ||
            cityIndex >= cursor.cityCount ||
            !Number.isFinite(value)
        ) {
            continue;
        }

        if (!hasFrameValue) {
            nextSnapshot = [...cursor.snapshot];
            hasFrameValue = true;
        }
        nextSnapshot[cityIndex] = value;
    }

    if (!hasFrameValue) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    cursor.snapshot = nextSnapshot;
    cursor.hasSnapshot = true;
    return nextSnapshot as number[];
}

function applyMaskedPatchFrame(
    cursor: TimelineCursor,
    frame: IndexedGraphPatchFrame,
    maskWordCount: number,
): number[] {
    if (maskWordCount <= 0) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    const maskStart = 2;
    const valueStart = maskStart + maskWordCount;
    if (frame.length <= valueStart) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    let nextSnapshot = cursor.snapshot;
    let hasFrameValue = false;
    let valueIndex = valueStart;

    for (let wordIndex = 0; wordIndex < maskWordCount; wordIndex += 1) {
        let maskWord = Math.trunc(Number(frame[maskStart + wordIndex] ?? Number.NaN));
        if (!Number.isFinite(maskWord) || maskWord <= 0) {
            continue;
        }

        const cityBase = wordIndex * PATCH_MASK_BITS;
        while (maskWord !== 0 && valueIndex < frame.length) {
            const lowestBit = maskWord & -maskWord;
            const bitIndex = 31 - Math.clz32(lowestBit);
            const cityIndex = cityBase + bitIndex;
            const value = Number(frame[valueIndex]);

            if (
                Number.isFinite(value) &&
                cityIndex >= 0 &&
                cityIndex < cursor.cityCount
            ) {
                if (!hasFrameValue) {
                    nextSnapshot = [...cursor.snapshot];
                    hasFrameValue = true;
                }
                nextSnapshot[cityIndex] = value;
            }

            maskWord &= maskWord - 1;
            valueIndex += 1;
        }
    }

    if (!hasFrameValue) {
        return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
    }

    cursor.snapshot = nextSnapshot;
    cursor.hasSnapshot = true;
    return nextSnapshot as number[];
}

function advanceIndexedTimelineCursor(
    cursor: TimelineCursor,
    timeline: IndexedGraphPatchTimeline,
    timeIndex: number,
): number[] | undefined {
    if (timeline.length === 0) {
        return undefined;
    }

    while (cursor.cursor + 1 < timeline.length) {
        const nextFrame = timeline[cursor.cursor + 1];
        const nextFrameTimeOffset = resolveIndexedFrameTimeOffset(nextFrame);
        if (nextFrameTimeOffset == null || nextFrameTimeOffset > timeIndex) {
            break;
        }

        cursor.cursor += 1;
        cursor.lastFrame = applyIndexedPatchFrame(cursor, nextFrame);
        cursor.lastAppliedTimeIndex = nextFrameTimeOffset;
    }

    return cursor.hasSnapshot ? (cursor.snapshot as number[]) : EMPTY_FRAME;
}

function resolveTimelineStartOffset(
    timelineRoot: GraphTimelineRoot,
    allianceIndex: number,
): number | null {
    const rawOffset = timelineRoot.start_offsets?.[allianceIndex];
    if (rawOffset == null || !Number.isFinite(rawOffset)) {
        return null;
    }

    return Math.trunc(rawOffset);
}

function resolveTimelineEndOffset(
    timelineRoot: GraphTimelineRoot,
    allianceIndex: number,
): number | null {
    const rawOffset = timelineRoot.end_offsets?.[allianceIndex];
    if (rawOffset == null || !Number.isFinite(rawOffset)) {
        return null;
    }

    return Math.trunc(rawOffset);
}

function usesIndexedPatchEncoding(timelineRoot: GraphTimelineRoot): boolean {
    return (
        timelineRoot.encoding === "indexed_patch_v2" ||
        timelineRoot.encoding === "sparse_patch_v3"
    );
}

export function readGraphTimelineSnapshot(options: {
    coalition: GraphCoalitionData;
    isTurnMetric: boolean;
    metricIndex: number;
    allianceIndex: number;
    timeIndex: number;
}): number[] | undefined {
    const { coalition, isTurnMetric, metricIndex, allianceIndex, timeIndex } = options;
    if (timeIndex < 0) {
        return undefined;
    }

    const timelineRoot = isTurnMetric ? coalition.turn : coalition.day;
    const startOffset = resolveTimelineStartOffset(timelineRoot, allianceIndex);
    if (startOffset != null && timeIndex < startOffset) {
        return undefined;
    }

    const endOffset = resolveTimelineEndOffset(timelineRoot, allianceIndex);
    if (endOffset != null && timeIndex > endOffset) {
        return getZeroFrame(coalition.cities.length);
    }

    const timeline = timelineRoot.data[metricIndex]?.[allianceIndex];
    if (!timeline) {
        return undefined;
    }

    const cursor = getTimelineCursor(timeline, coalition.cities.length);
    if (usesIndexedPatchEncoding(timelineRoot)) {
        if (timeIndex < cursor.lastAppliedTimeIndex) {
            resetTimelineCursor(cursor, coalition.cities.length);
        }

        return advanceIndexedTimelineCursor(
            cursor,
            timeline as IndexedGraphPatchTimeline,
            timeIndex,
        );
    }

    const localTimeIndex = startOffset != null ? timeIndex - startOffset : timeIndex;
    if (localTimeIndex < 0) {
        return undefined;
    }

    if (localTimeIndex < cursor.lastAppliedTimeIndex) {
        resetTimelineCursor(cursor, coalition.cities.length);
    }

    return advanceDenseTimelineCursor(
        cursor,
        timeline as DenseGraphTimeline,
        localTimeIndex,
    );
}
