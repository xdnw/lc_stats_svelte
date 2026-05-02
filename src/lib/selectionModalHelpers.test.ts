import { describe, expect, it } from "vitest";
import {
    buildAllianceSelectionItems,
    buildCoalitionAllianceItems,
    buildCoalitionQuickActions,
} from "./selectionModalHelpers";

function formatAllianceLabel(name: string, id: number): string {
    return `${name || "AA"} (${id})`;
}

describe("selection modal helpers", () => {
    it("builds flat alliance items from root id/name arrays", () => {
        expect(
            buildAllianceSelectionItems(
                [101, 202],
                ["Rose", "Syndicate"],
                formatAllianceLabel,
            ),
        ).toEqual([
            { id: 101, label: "Rose (101)" },
            { id: 202, label: "Syndicate (202)" },
        ]);
    });

    it("builds coalition alliance items with side-aware group tones", () => {
        expect(
            buildCoalitionAllianceItems(
                [
                    {
                        name: "Coalition Two",
                        alliance_ids: [202],
                        alliance_names: ["Syndicate"],
                    },
                ],
                formatAllianceLabel,
                { startCoalitionIndex: 1 },
            ),
        ).toEqual([
            {
                id: 202,
                label: "Syndicate (202)",
                group: "Coalition Two",
                groupTone: "coalition2",
            },
        ]);
    });

    it("builds coalition quick actions using coalition names", () => {
        expect(
            buildCoalitionQuickActions([
                {
                    name: "Alpha",
                    alliance_ids: [11, "22", 11],
                },
                {
                    alliance_ids: [33],
                },
            ]),
        ).toEqual([
            { label: "Alpha", ids: [11, 22] },
            { label: "Coalition 2", ids: [33] },
        ]);
    });

    it("deduplicates duplicate coalition quick-action labels", () => {
        expect(
            buildCoalitionQuickActions([
                {
                    name: "Blue",
                    alliance_ids: [101],
                },
                {
                    name: "Blue",
                    alliance_ids: [202],
                },
            ]),
        ).toEqual([
            { label: "Blue", ids: [101] },
            { label: "Blue (2)", ids: [202] },
        ]);
    });

    it("keeps coalition order for quick-action rendering", () => {
        expect(
            buildCoalitionQuickActions([
                {
                    name: "Red Side",
                    alliance_ids: [1],
                },
                {
                    name: "Blue Side",
                    alliance_ids: [2],
                },
            ]).map((action) => action.label),
        ).toEqual(["Red Side", "Blue Side"]);
    });
});
