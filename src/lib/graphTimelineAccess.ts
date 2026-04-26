import type { GraphCoalitionData } from "./types";

type GraphFrame = Array<number | null>;
type GraphTimeline = GraphFrame[];
type GraphTimelineRoot = GraphCoalitionData["turn"] | GraphCoalitionData["day"];

type TimelineCursor = {
    cityCount: number;
    cursor: number;
    snapshot: Array<number | null>;
    hasSnapshot: boolean;
    lastFrame: number[];
};

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

function applyTimelineFrame(
    cursor: TimelineCursor,
    frame: GraphFrame | undefined,
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

function advanceTimelineCursor(
    cursor: TimelineCursor,
    timeline: GraphTimeline,
    timeIndex: number,
): number[] | undefined {
    if (timeline.length === 0) {
        return undefined;
    }

    const targetIndex = Math.min(timeIndex, timeline.length - 1);
    while (cursor.cursor < targetIndex) {
        cursor.cursor += 1;
        cursor.lastFrame = applyTimelineFrame(cursor, timeline[cursor.cursor]);
    }

    return cursor.lastFrame;
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
    const endOffset = resolveTimelineEndOffset(timelineRoot, allianceIndex);
    if (endOffset != null && timeIndex > endOffset) {
        return getZeroFrame(coalition.cities.length);
    }

    const timeline = timelineRoot.data[metricIndex]?.[allianceIndex];
    if (!timeline) {
        return undefined;
    }

    const cursor = getTimelineCursor(timeline, coalition.cities.length);
    if (timeIndex < cursor.cursor) {
        resetTimelineCursor(cursor, coalition.cities.length);
    }

    return advanceTimelineCursor(cursor, timeline, timeIndex);
}
