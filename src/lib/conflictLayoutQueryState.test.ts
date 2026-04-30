import { describe, expect, it } from "vitest";
import {
    parseConflictLayoutQuery,
    serializeConflictLayoutQuery,
} from "./conflictLayoutQueryState";
import {
    parseConflictCustomColumnsFromQuery,
    serializeConflictCustomColumnsForQuery,
} from "./conflictCustomColumns";

const DEFAULTS = {
    layout: 0 as const,
    sort: "off:wars",
    order: "desc" as const,
    columns: ["name", "net:damage", "off:wars"],
    customColumns: [],
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
            customColumns: [],
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
            customColumns: [],
        });
    });

    it("drops stale custom column ids when cc is missing", () => {
        const query = new URLSearchParams({
            layout: "alliance",
            columns: "name.cc-stale.loss:infra.off:wars",
        });

        expect(parseConflictLayoutQuery(query, DEFAULTS)).toEqual({
            layout: 1,
            sort: "off:wars",
            order: "desc",
            columns: ["name", "loss:infra", "off:wars"],
            customColumns: [],
        });
    });

    it("round-trips cc query state before columns normalization", () => {
        const cc = serializeConflictCustomColumnsForQuery([
            {
                kind: "member-rollup",
                label: "War-heavy nations",
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 5 },
                },
            },
        ]);
        const parsedCustomColumns = parseConflictCustomColumnsFromQuery(cc);
        const query = new URLSearchParams({
            layout: "alliance",
            columns: `name.${parsedCustomColumns[0]?.id ?? "cc-missing"}.loss:infra.off:wars.cc-stale`,
            cc: cc ?? "",
        });

        const parsed = parseConflictLayoutQuery(query, DEFAULTS);
        expect(parsed.customColumns).toEqual(parsedCustomColumns);
        expect(parsed.columns).toEqual([
            "name",
            parsed.customColumns[0].id,
            "loss:infra",
            "off:wars",
        ]);
    });

    it("serializes normalized layout state without changing query shape", () => {
        expect(
            serializeConflictLayoutQuery({
                layout: 1,
                sort: "off:wars",
                order: "desc",
                columns: ["name", "loss:infra", "off:wars"],
                customColumns: [],
            }),
        ).toEqual({
            layout: "alliance",
            sort: "off:wars",
            order: "desc",
            columns: "name.loss:infra.off:wars",
            cc: null,
        });
    });

    it("drops member-rollup ids from nation layout normalization", () => {
        const cc = serializeConflictCustomColumnsForQuery([
            {
                kind: "member-rollup",
                label: "War-heavy nations",
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 5 },
                },
            },
        ]);
        const parsedCustomColumns = parseConflictCustomColumnsFromQuery(cc);
        const query = new URLSearchParams({
            layout: "nation",
            columns: `alliance.name.${parsedCustomColumns[0]?.id ?? "cc-missing"}.off:wars`,
            cc: cc ?? "",
        });

        const parsed = parseConflictLayoutQuery(query, DEFAULTS);
        expect(parsed.customColumns).toEqual(parsedCustomColumns);
        expect(parsed.columns).toEqual(["alliance", "name", "off:wars"]);
    });
});
