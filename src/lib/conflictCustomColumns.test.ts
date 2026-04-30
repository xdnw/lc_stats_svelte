import { describe, expect, it } from "vitest";

import {
    buildConflictCustomColumnSentencePreview,
    filterConflictCustomColumnsForLayout,
    getConflictCustomColumnIdsForLayout,
    sanitizeConflictCustomColumn,
    sanitizeConflictCustomColumns,
    parseConflictCustomColumnsFromQuery,
    serializeConflictCustomColumnsForQuery,
} from "./conflictCustomColumns";
import {
    buildConflictCustomMetricOptions,
    deleteConflictCustomColumnState,
    upsertConflictCustomColumnState,
} from "./conflictCustomColumnAuthoring";

const VALID_METRICS = [
    "off:wars",
    "def:wars",
    "dealt:damage",
    "loss:damage",
    "net:damage",
    "both:wars",
];

describe("conflictCustomColumns", () => {
    it("sanitizes valid row formulas and keeps ids stable across label edits", () => {
        const initial = sanitizeConflictCustomColumn(
            {
                kind: "row-formula",
                label: "Net damage delta",
                formula: {
                    kind: "numeric",
                    display: "money",
                    expr: {
                        kind: "binary",
                        op: "sub",
                        left: { kind: "metric", metric: "dealt:damage" },
                        right: { kind: "metric", metric: "loss:damage" },
                    },
                },
            },
            VALID_METRICS,
        );
        const renamed = sanitizeConflictCustomColumn(
            {
                kind: "row-formula",
                label: "Custom label",
                formula: {
                    kind: "numeric",
                    display: "money",
                    expr: {
                        kind: "binary",
                        op: "sub",
                        left: { kind: "metric", metric: "dealt:damage" },
                        right: { kind: "metric", metric: "loss:damage" },
                    },
                },
            },
            VALID_METRICS,
        );

        expect(initial?.id).toBe(renamed?.id);
        expect(initial?.label).toBe("Net damage delta");
        expect(renamed?.label).toBe("Custom label");
    });

    it("defaults blank labels from the sentence preview", () => {
        const config = sanitizeConflictCustomColumn(
            {
                kind: "member-rollup",
                label: "   ",
                reducer: "share",
                display: "percent",
                expr: {
                    kind: "compare",
                    op: "gte",
                    left: { kind: "metric", metric: "net:damage" },
                    right: { kind: "metric", metric: "loss:damage" },
                },
            },
            VALID_METRICS,
        );

        expect(config?.label).toBe(
            buildConflictCustomColumnSentencePreview({
                kind: "member-rollup",
                reducer: "share",
                display: "percent",
                expr: {
                    kind: "compare",
                    op: "gte",
                    left: { kind: "metric", metric: "net:damage" },
                    right: { kind: "metric", metric: "loss:damage" },
                },
            }),
        );
    });

    it("rejects invalid display-unit combinations and expression depth over the limit", () => {
        expect(
            sanitizeConflictCustomColumn(
                {
                    kind: "row-formula",
                    label: "Bad money",
                    formula: {
                        kind: "numeric",
                        display: "money",
                        expr: {
                            kind: "binary",
                            op: "div",
                            left: { kind: "metric", metric: "dealt:damage" },
                            right: { kind: "value", value: 2 },
                        },
                    },
                },
                VALID_METRICS,
            ),
        ).toBeNull();

        expect(
            sanitizeConflictCustomColumn(
                {
                    kind: "row-formula",
                    label: "Too deep",
                    formula: {
                        kind: "numeric",
                        display: "number",
                        expr: {
                            kind: "binary",
                            op: "add",
                            left: {
                                kind: "binary",
                                op: "add",
                                left: {
                                    kind: "binary",
                                    op: "add",
                                    left: {
                                        kind: "binary",
                                        op: "add",
                                        left: {
                                            kind: "binary",
                                            op: "add",
                                            left: { kind: "metric", metric: "off:wars" },
                                            right: { kind: "value", value: 1 },
                                        },
                                        right: { kind: "value", value: 1 },
                                    },
                                    right: { kind: "value", value: 1 },
                                },
                                right: { kind: "value", value: 1 },
                            },
                            right: { kind: "value", value: 1 },
                        },
                    },
                },
                VALID_METRICS,
            ),
        ).toBeNull();
    });

    it("dedupes semantic duplicates and caps the collection", () => {
        const duplicate = {
            kind: "member-rollup",
            label: "Share of active members",
            reducer: "share",
            display: "percent",
            expr: {
                kind: "compare",
                op: "gt",
                left: { kind: "metric", metric: "off:wars" },
                right: { kind: "value", value: 0 },
            },
        };

        const sanitized = sanitizeConflictCustomColumns(
            Array.from({ length: 25 }, (_, index) => ({
                ...duplicate,
                label: `Label ${index}`,
            })),
            VALID_METRICS,
        );

        expect(sanitized).toHaveLength(1);
    });

    it("round-trips compact query payloads", () => {
        const serialized = serializeConflictCustomColumnsForQuery([
            {
                kind: "member-rollup",
                label: "War-heavy share",
                reducer: "share",
                display: "percent",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 5 },
                },
            },
        ]);

        expect(parseConflictCustomColumnsFromQuery(serialized, VALID_METRICS)).toEqual([
            expect.objectContaining({
                kind: "member-rollup",
                reducer: "share",
                display: "percent",
            }),
        ]);
    });

    it("builds metric options and drops duplicates", () => {
        expect(
            buildConflictCustomMetricOptions([
                { key: "name", title: "Name" },
                { key: "net:damage", title: "Net Damage" },
                { key: "off:wars", title: "Off Wars" },
                { key: "net:damage", title: "Duplicate" },
            ]),
        ).toEqual([
            { value: "net:damage", label: "Net Damage", unit: "money" },
            { value: "off:wars", label: "Off Wars", unit: "number" },
        ]);
    });

    it("filters member rollups off nation layout ids", () => {
        const rowFormula = sanitizeConflictCustomColumn(
            {
                kind: "row-formula",
                label: "Flag",
                formula: {
                    kind: "flag",
                    display: "flag",
                    expr: {
                        kind: "compare",
                        op: "gt",
                        left: { kind: "metric", metric: "off:wars" },
                        right: { kind: "metric", metric: "def:wars" },
                    },
                },
            },
            VALID_METRICS,
        );
        const memberRollup = sanitizeConflictCustomColumn(
            {
                kind: "member-rollup",
                label: "Count heavy members",
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 5 },
                },
            },
            VALID_METRICS,
        );

        const filtered = filterConflictCustomColumnsForLayout(2, [rowFormula!, memberRollup!]);
        expect(filtered).toEqual([rowFormula]);
        expect(getConflictCustomColumnIdsForLayout(2, [rowFormula!, memberRollup!])).toEqual([
            rowFormula!.id,
        ]);
    });

    it("upserts and deletes custom-column state while keeping visible ids in sync", () => {
        const created = upsertConflictCustomColumnState(
            {
                layout: 1,
                columns: ["name", "net:damage"],
                customColumns: [],
            },
            {
                config: {
                    kind: "member-rollup",
                    label: "War-heavy share",
                    reducer: "share",
                    display: "percent",
                    expr: {
                        kind: "compare",
                        op: "gt",
                        left: { kind: "metric", metric: "off:wars" },
                        right: { kind: "value", value: 5 },
                    },
                },
                validMetricKeys: VALID_METRICS,
            },
        );

        expect(created).not.toBeNull();
        expect(created?.columns).toContain(created?.customColumns[0]?.id ?? "");

        const previousId = created!.customColumns[0].id;
        const edited = upsertConflictCustomColumnState(created!, {
            previousId,
            config: {
                kind: "member-rollup",
                label: "Heavy defenders",
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gte",
                    left: { kind: "metric", metric: "def:wars" },
                    right: { kind: "value", value: 2 },
                },
            },
            validMetricKeys: VALID_METRICS,
        });

        expect(edited).not.toBeNull();
        expect(edited?.customColumns[0].id).not.toBe(previousId);
        expect(edited?.columns).not.toContain(previousId);
        expect(edited?.columns).toContain(edited?.customColumns[0].id ?? "");

        const deleted = deleteConflictCustomColumnState(edited!, edited!.customColumns[0].id);
        expect(deleted.customColumns).toEqual([]);
        expect(deleted.columns).toEqual(["name", "net:damage"]);
    });
});