import { describe, expect, it } from "vitest";
import { rankWarWebAllianceIdsByTotalMetric } from "./warWeb";
import type { Conflict } from "./types";

function createConflict(): Conflict {
    return {
        name: "Test conflict",
        coalitions: [
            {
                name: "Alpha",
                alliance_ids: [101, 102],
                alliance_names: ["Alpha One", "Alpha Two"],
            },
            {
                name: "Beta",
                alliance_ids: [201, 202],
                alliance_names: ["Beta One", "Beta Two"],
            },
        ],
        war_web: {
            headers: ["wars"],
            data: [
                [
                    [0, 0, 5, 2],
                    [0, 0, 3, 7],
                    [4, 6, 0, -5],
                    [1, Number.NaN, 0, 0],
                ],
            ],
        },
    } as unknown as Conflict;
}

describe("rankWarWebAllianceIdsByTotalMetric", () => {
    it("ranks each coalition by total outgoing plus incoming metric value", () => {
        const conflict = createConflict();

        expect(rankWarWebAllianceIdsByTotalMetric(conflict, "wars")).toEqual([
            [102, 101],
            [201, 202],
        ]);
    });

    it("falls back to coalition order when the header is missing", () => {
        const conflict = createConflict();

        expect(rankWarWebAllianceIdsByTotalMetric(conflict, "damage")).toEqual([
            [101, 102],
            [201, 202],
        ]);
    });
});
