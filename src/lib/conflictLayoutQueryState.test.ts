import { describe, expect, it } from "vitest";
import {
    parseConflictLayoutQuery,
    serializeConflictLayoutQuery,
} from "./conflictLayoutQueryState";

const DEFAULTS = {
    layout: 0 as const,
    sort: "off:wars",
    order: "desc" as const,
    columns: ["name", "net:damage", "off:wars"],
};

describe("conflictLayoutQueryState", () => {
    it("restores the required name column for legacy alliance links", () => {
        const query = new URLSearchParams({
            layout: "alliance",
            columns: "loss:missile.loss:nuke.loss:infra.off:wars",
        });

        expect(parseConflictLayoutQuery(query, DEFAULTS)).toEqual({
            layout: 1,
            sort: "off:wars",
            order: "desc",
            columns: [
                "name",
                "loss:missile",
                "loss:nuke",
                "loss:infra",
                "off:wars",
            ],
        });
    });

    it("restores the required alliance and name columns for nation layout", () => {
        const query = new URLSearchParams({
            layout: "nation",
            sort: "net:damage",
            order: "asc",
            columns: "name.net:damage.off:wars",
        });

        expect(parseConflictLayoutQuery(query, DEFAULTS)).toEqual({
            layout: 2,
            sort: "net:damage",
            order: "asc",
            columns: ["alliance", "name", "net:damage", "off:wars"],
        });
    });

    it("serializes normalized layout state without changing query shape", () => {
        expect(
            serializeConflictLayoutQuery({
                layout: 1,
                sort: "off:wars",
                order: "desc",
                columns: ["name", "loss:infra", "off:wars"],
            }),
        ).toEqual({
            layout: "alliance",
            sort: "off:wars",
            order: "desc",
            columns: "name.loss:infra.off:wars",
        });
    });
});
