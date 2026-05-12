import { describe, expect, it } from "vitest";
import {
    buildAavaSelectionRowsFromSource,
    createAavaSelectionSource,
    type AavaSelectionSnapshot,
} from "./aavaSelection";
import { createAavaSelectionEngine } from "./aavaSelectionEngine";
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

const snapshot: AavaSelectionSnapshot = {
    header: "wars",
    primaryIds: [101, 102],
    vsIds: [201, 202],
    primaryCoalitionIndex: 0,
};

describe("createAavaSelectionEngine", () => {
    const secondSnapshot: AavaSelectionSnapshot = {
        ...snapshot,
        header: "damage",
    };

    it("uses the local engine for the first uncached build", async () => {
        const source = createAavaSelectionSource(createConflict());
        const expectedLocalRows = buildAavaSelectionRowsFromSource(source, snapshot);

        const engine = createAavaSelectionEngine({
            dataKey: "test-key",
            source,
        });

        await expect(engine.buildRows(snapshot)).resolves.toEqual(expectedLocalRows);

        engine.destroy();
    });

    it("caches locally built rows for later requests", async () => {
        const source = createAavaSelectionSource(createConflict());
        const expectedRows = buildAavaSelectionRowsFromSource(source, secondSnapshot);

        const engine = createAavaSelectionEngine({
            dataKey: "test-key",
            source,
        });

        await expect(engine.buildRows(snapshot)).resolves.toEqual(
            buildAavaSelectionRowsFromSource(source, snapshot),
        );

        await expect(engine.buildRows(secondSnapshot)).resolves.toEqual(expectedRows);
        await expect(engine.buildRows(secondSnapshot)).resolves.toEqual(expectedRows);

        engine.destroy();
    });

    it("caps the local row cache", async () => {
        const source = createAavaSelectionSource(createConflict());
        const engine = createAavaSelectionEngine({
            dataKey: "test-key",
            source,
        });

        await engine.buildRows(snapshot);
        expect(engine.peekRows(snapshot)).not.toBeNull();

        for (let index = 0; index < 16; index++) {
            await engine.buildRows({
                ...snapshot,
                primaryIds: [10_000 + index],
            });
        }

        expect(engine.peekRows(snapshot)).toBeNull();

        engine.destroy();
    });
});
