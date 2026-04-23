import { describe, expect, it } from "vitest";
import {
    buildAllianceSelectionItems,
    buildCoalitionAllianceItems,
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
});
