import { describe, expect, it } from "vitest";
import {
    detectConflictTableLayoutPresetKey,
    isConflictTableDefaultPresetState,
} from "./conflictTablePresets";

describe("conflictTablePresets", () => {
    it("treats custom-column layouts as custom even when native columns match a preset", () => {
        const state = {
            layout: 0 as const,
            sort: "off:wars",
            order: "desc" as const,
            columns: ["name", "net:damage", "off:wars", "cc-abc123"],
            customColumns: [
                {
                    id: "cc-abc123",
                    kind: "member-rollup" as const,
                    label: "War-heavy nations",
                    reducer: "count" as const,
                    display: "number" as const,
                    expr: {
                        kind: "compare" as const,
                        op: "gt" as const,
                        left: { kind: "metric" as const, metric: "off:wars" },
                        right: { kind: "value" as const, value: 5 },
                    },
                },
            ],
        };

        expect(detectConflictTableLayoutPresetKey(state)).toBeNull();
        expect(isConflictTableDefaultPresetState(state)).toBe(false);
    });
});