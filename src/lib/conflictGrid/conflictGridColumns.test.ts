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
});