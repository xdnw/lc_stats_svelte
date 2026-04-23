import { describe, expect, it } from "vitest";
import {
    buildNoCommonCompositeAllianceDetails,
    collectCompositeAllianceCandidates,
    selectDefaultCompositeAllianceId,
    type LoadedCompositeConflict,
} from "./compositeConflictSelection";
import type { Conflict } from "./types";

function createConflict(options: {
    id: string;
    name: string;
    coalitionA: Array<[number, string]>;
    coalitionB: Array<[number, string]>;
}): LoadedCompositeConflict {
    return {
        id: options.id,
        data: {
            name: options.name,
            coalitions: [
                {
                    name: "A",
                    alliance_ids: options.coalitionA.map(([id]) => id),
                    alliance_names: options.coalitionA.map(([, name]) => name),
                },
                {
                    name: "B",
                    alliance_ids: options.coalitionB.map(([id]) => id),
                    alliance_names: options.coalitionB.map(([, name]) => name),
                },
            ],
        } as unknown as Conflict,
    };
}

describe("compositeConflictSelection", () => {
    it("collects and orders only alliances present in every loaded conflict", () => {
        const loaded = [
            createConflict({
                id: "c1",
                name: "One",
                coalitionA: [[10, "Rose"], [20, "Syndi"]],
                coalitionB: [[30, "Cataclysm"]],
            }),
            createConflict({
                id: "c2",
                name: "Two",
                coalitionA: [[20, "Syndi"], [10, "Rose"]],
                coalitionB: [[40, "Aurora"]],
            }),
            createConflict({
                id: "c3",
                name: "Three",
                coalitionA: [[10, "Rose"]],
                coalitionB: [[20, "Syndi"], [50, "Oblivion"]],
            }),
        ];

        const options = collectCompositeAllianceCandidates(loaded, ["c2", "c1", "c3"]);

        expect(options).toEqual([
            { id: 20, name: "Syndi" },
            { id: 10, name: "Rose" },
        ]);
        expect(selectDefaultCompositeAllianceId(options, loaded, ["c2", "c1", "c3"]))
            .toBe(20);
    });

    it("describes near-matches when no alliance is common across every conflict", () => {
        const loaded = [
            createConflict({
                id: "c1",
                name: "One",
                coalitionA: [[10, "Rose"]],
                coalitionB: [[20, "Syndi"]],
            }),
            createConflict({
                id: "c2",
                name: "Two",
                coalitionA: [[20, "Syndi"]],
                coalitionB: [[30, "Aurora"]],
            }),
            createConflict({
                id: "c3",
                name: "Three",
                coalitionA: [[30, "Aurora"]],
                coalitionB: [[40, "Oblivion"]],
            }),
        ];

        expect(collectCompositeAllianceCandidates(loaded, ["c1", "c2", "c3"]))
            .toEqual([]);

        const details = buildNoCommonCompositeAllianceDetails(loaded);

        expect(details[0]).toContain("Selected conflicts: c1 (One), c2 (Two), c3 (Three)");
        expect(details[1]).toContain("Closest overlaps across 3 conflicts:");
        expect(details[2]).toContain("Aurora (30) appears in 2/3");
        expect(details[3]).toContain("Syndi (20) appears in 2/3");
    });
});
