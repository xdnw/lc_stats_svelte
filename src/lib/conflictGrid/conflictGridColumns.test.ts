import { describe, expect, it } from "vitest";
import { buildConflictGridColumnSpecs } from "./conflictGridColumns";

describe("buildConflictGridColumnSpecs", () => {
    it("dedupes metric columns when legacy loss header aliases normalize to one key", () => {
        const conflict = {
            damage_header: ["consume_gas_loss", "loss_consume_gas"],
            header_type: [0, 0],
        } as never;

        const columns = buildConflictGridColumnSpecs(conflict);
        const keys = columns.map((column) => column.key);

        expect(keys).toEqual([
            "name",
            "alliance",
            "loss:consume gas",
            "dealt:consume gas",
            "net:consume gas",
        ]);
    });

    it("marks only native metric columns as KPI-eligible", () => {
        const conflict = {
            damage_header: ["loss_value", "wars"],
            header_type: [0, 1],
        } as never;

        const columns = buildConflictGridColumnSpecs(conflict);

        expect(columns.find((column) => column.key === "name")).toMatchObject({
            metricEligible: false,
        });
        expect(columns.find((column) => column.key === "alliance")).toMatchObject({
            metricEligible: false,
        });
        expect(columns.find((column) => column.key === "dealt:damage")).toMatchObject({
            metricEligible: true,
        });
        expect(columns.find((column) => column.key === "off:wars")).toMatchObject({
            metricEligible: true,
        });
    });
});