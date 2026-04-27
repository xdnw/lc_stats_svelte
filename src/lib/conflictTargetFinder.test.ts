import { describe, expect, it } from "vitest";

import {
    buildAllianceSelector,
    buildConflictTargetFinderUrl,
    hasConflictTargetFinderCoalitions,
    type ConflictTargetFinderCoalition,
    resolveConflictTargetFinderSelection,
} from "./conflictTargetFinder";

describe("conflict target finder urls", () => {
    it("formats alliance ids in Locutus selector syntax", () => {
        expect(buildAllianceSelector([1234, 5678, 1234, 0, -1, Number.NaN])).toBe(
            "AA:1234,AA:5678",
        );
    });

    it("uses the chosen side as allies and the opposing side as selector for wars", () => {
        expect(
            buildConflictTargetFinderUrl({
                mode: "war",
                sideAllianceIds: [1234, 5678],
                enemyAllianceIds: [999, 111],
            }),
        ).toBe(
            "https://www.locutus.link/#/war?selector=AA:999,AA:111&allies=AA:1234,AA:5678",
        );
    });

    it("uses only the enemy selector for raid and damage pages", () => {
        expect(
            buildConflictTargetFinderUrl({
                mode: "raid",
                sideAllianceIds: [1234, 5678],
                enemyAllianceIds: [999, 111],
            }),
        ).toBe("https://www.locutus.link/#/raid?selector=AA:999,AA:111");

        expect(
            buildConflictTargetFinderUrl({
                mode: "damage",
                sideAllianceIds: [1234, 5678],
                enemyAllianceIds: [999, 111],
            }),
        ).toBe("https://www.locutus.link/#/damage?selector=AA:999,AA:111");
    });

    it("uses the same normalized readiness rule for cards and modal links", () => {
        const validCoalitions: [
            ConflictTargetFinderCoalition,
            ConflictTargetFinderCoalition,
        ] = [
            {
                label: "C1",
                name: "Alpha",
                alliances: [
                    { id: 1, name: "Alliance One" },
                    { id: 2, name: "Alliance Two" },
                    { id: 2, name: "Alliance Two" },
                ],
            },
            {
                label: "C2",
                name: "Beta",
                alliances: [
                    { id: 9, name: "Alliance Nine" },
                    { id: 10, name: "Alliance Ten" },
                ],
            },
        ];

        expect(hasConflictTargetFinderCoalitions(validCoalitions)).toBe(true);
        expect(resolveConflictTargetFinderSelection(validCoalitions, 1)).toMatchObject({
            sideSelector: "AA:9,AA:10",
            enemySelector: "AA:1,AA:2",
        });

        const invalidCoalitions: [
            ConflictTargetFinderCoalition,
            ConflictTargetFinderCoalition,
        ] = [
            {
                label: "C1",
                name: "Alpha",
                alliances: [
                    { id: 0, name: "zero" },
                    { id: -1, name: "neg" },
                    { id: Number.NaN, name: "nan" },
                ],
            },
            {
                label: "C2",
                name: "Beta",
                alliances: [
                    { id: 9, name: "Alliance Nine" },
                    { id: 10, name: "Alliance Ten" },
                ],
            },
        ];

        expect(hasConflictTargetFinderCoalitions(invalidCoalitions)).toBe(false);
        expect(resolveConflictTargetFinderSelection(invalidCoalitions, 0)).toBeNull();
    });
});
