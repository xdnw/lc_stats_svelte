import { describe, expect, it } from "vitest";
import { mergeCompositeConflict, type CompositeConflictInput } from "./compositeMerge";
import type { Conflict } from "./types";

function createConflict(
    id: string,
    enemyAllianceId: number,
    friendlyDealt: unknown,
    enemyTaken: unknown,
    warWebValue: unknown,
): CompositeConflictInput {
    const selectedAllianceId = 100;
    return {
        id,
        data: {
            name: `Conflict ${id}`,
            start: 1,
            end: 2,
            coalitions: [
                {
                    name: "Friendly",
                    alliance_ids: [selectedAllianceId],
                    alliance_names: ["Selected"],
                    nation_ids: [],
                    nation_names: [],
                    nation_aa: [],
                    damage: [
                        [0],
                        [friendlyDealt],
                        [0],
                        [friendlyDealt],
                    ],
                },
                {
                    name: "Enemy",
                    alliance_ids: [enemyAllianceId],
                    alliance_names: [`Enemy ${enemyAllianceId}`],
                    nation_ids: [],
                    nation_names: [],
                    nation_aa: [],
                    damage: [
                        [enemyTaken],
                        [0],
                        [enemyTaken],
                        [0],
                    ],
                },
            ],
            damage_header: ["damage"],
            header_type: [0],
            war_web: {
                headers: ["damage"],
                data: [
                    [
                        [0, warWebValue],
                        [enemyTaken, 0],
                    ],
                ],
            },
        } as unknown as Conflict,
    };
}

describe("compositeMerge", () => {
    it("merges damage and war-web values while preserving numeric fallback behavior", () => {
        const result = mergeCompositeConflict(
            [
                createConflict("1", 201, 10, 10, 10),
                createConflict("2", 202, "7", Number.NaN, "7"),
            ],
            100,
        );

        expect(result.conflict.coalitions[0].damage[1]).toEqual([17]);
        expect(result.conflict.coalitions[1].damage[0]).toEqual([10]);
        expect(result.conflict.war_web.headers).toEqual(["damage"]);
        expect(result.conflict.war_web.data[0]).toEqual([
            [0, 10, 7],
            [10, 0, 0],
            [0, 0, 0],
        ]);
    });
});
