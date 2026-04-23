import { describe, expect, it } from "vitest";
import {
    buildAavaSelectionRows,
    buildAavaSelectionRowsFromSource,
    createAavaSelectionSource,
} from "./aavaSelection";
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
            headers: ["wars", "damage"],
            data: [
                [
                    [0, 0, 5, 2],
                    [0, 0, 3, 7],
                    [4, 6, 0, 0],
                    [1, 8, 0, 0],
                ],
                [
                    [0, 0, 50, 20],
                    [0, 0, 30, 70],
                    [40, 60, 0, 0],
                    [10, 80, 0, 0],
                ],
            ],
        },
    } as unknown as Conflict;
}

describe("aavaSelection source path", () => {
    it("builds the same rows from a serialized source as from the conflict object", () => {
        const conflict = createConflict();
        const snapshot = {
            header: "wars",
            primaryIds: [101, 102],
            vsIds: [201, 202],
            primaryCoalitionIndex: 0 as const,
        };

        const directRows = buildAavaSelectionRows(conflict, snapshot);
        const sourceRows = buildAavaSelectionRowsFromSource(
            createAavaSelectionSource(conflict),
            snapshot,
        );

        expect(sourceRows).toEqual(directRows);
        expect(sourceRows).toEqual([
            {
                alliance: ["Beta One", 201],
                primary_to_row: 8,
                row_to_primary: 10,
                net: -2,
                total: 18,
                primary_share_pct: 47.05882352941176,
                row_share_pct: 52.63157894736842,
                abs_net: 2,
            },
            {
                alliance: ["Beta Two", 202],
                primary_to_row: 9,
                row_to_primary: 9,
                net: 0,
                total: 18,
                primary_share_pct: 52.94117647058824,
                row_share_pct: 47.368421052631575,
                abs_net: 0,
            },
        ]);
    });
});
