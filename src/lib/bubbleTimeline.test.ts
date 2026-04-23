import { describe, expect, it } from "vitest";
import {
    buildBubbleTimelineTickIndices,
    buildBubbleTimelineTicks,
} from "./bubbleTimeline";

describe("buildBubbleTimelineTickIndices", () => {
    it("returns no ticks for empty frame sets", () => {
        expect(buildBubbleTimelineTickIndices(0)).toEqual([]);
    });

    it("always includes the endpoints", () => {
        expect(buildBubbleTimelineTickIndices(2)).toEqual([0, 1]);
        expect(buildBubbleTimelineTickIndices(5, 3)).toEqual([0, 2, 4]);
    });

    it("returns unique sorted indices for larger frame counts", () => {
        expect(buildBubbleTimelineTickIndices(25, 5)).toEqual([0, 6, 12, 18, 24]);
    });
});

describe("buildBubbleTimelineTicks", () => {
    it("returns no ticks for empty labels", () => {
        expect(buildBubbleTimelineTicks([])).toEqual([]);
    });

    it("anchors the first and last ticks to the rail edges", () => {
        expect(
            buildBubbleTimelineTicks(
                ["a", "b", "c", "d", "e"],
                3,
            ),
        ).toEqual([
            { index: 0, label: "a", percent: 0, anchor: "start" },
            { index: 2, label: "c", percent: 50, anchor: "center" },
            { index: 4, label: "e", percent: 100, anchor: "end" },
        ]);
    });

    it("centers the single-frame timeline", () => {
        expect(buildBubbleTimelineTicks(["only"])).toEqual([
            { index: 0, label: "only", percent: 50, anchor: "center" },
        ]);
    });
});