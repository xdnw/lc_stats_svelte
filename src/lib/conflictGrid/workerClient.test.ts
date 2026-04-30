import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeConflictCustomColumn } from "../conflictCustomColumns";

const requestWorkerRpc = vi.fn();

vi.mock("../workerRpc", () => ({
    requestWorkerRpc,
}));

class WorkerStub {
    terminate = vi.fn();
}

describe("warmConflictGridWorkerDataset", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal("Worker", WorkerStub as unknown as typeof Worker);

        requestWorkerRpc.mockImplementation(
            async (
                _worker: Worker,
                payload: { action: string; layout?: number },
            ) => {
                if (payload.action === "bootstrap") {
                    return {
                        datasetKey: "conflict-grid:123:v1",
                        meta: {
                            conflictId: "123",
                            name: "Test Conflict",
                            wiki: "Test_Conflict",
                            start: 0,
                            end: 0,
                            cb: "CB",
                            status: "Active",
                            posts: {},
                            updateMs: 0,
                            coalitions: [],
                        },
                        layout: payload.layout ?? 0,
                        grid: {
                            columns: [],
                            rowCount: 2,
                        },
                        presetMetrics: {
                            coalitionSummary: null,
                            totalDamage: null,
                            warsTracked: null,
                            damageGap: null,
                            leadingCoalition: null,
                            offWarsPerNationStats: null,
                        },
                        timings: {
                            datasetCreateMs: 10,
                            layoutBootstrapMs: 5,
                        },
                    };
                }

                if (payload.action === "prewarm") {
                    return {
                        datasetKey: "conflict-grid:123:v1",
                        warmedLayouts: [0],
                        metricVectorsWarmed: 3,
                        elapsedMs: 12,
                    };
                }

                throw new Error(`Unexpected action: ${payload.action}`);
            },
        );
    });

    it("uses bootstrap for non-aggressive layout warm and lets the route reuse that promise", async () => {
        const workerClient = await import("./workerClient");
        const { ConflictGridLayout } = await import("./rowIds");

        await workerClient.warmConflictGridWorkerDataset({
            conflictId: "123",
            version: "v1",
            layouts: [ConflictGridLayout.COALITION],
        });

        const client = workerClient.createConflictGridWorkerClient({
            conflictId: "123",
            version: "v1",
        });
        const payload = await client.bootstrap(ConflictGridLayout.COALITION);

        const bootstrapCalls = requestWorkerRpc.mock.calls.filter(
            ([, payload]) => payload.action === "bootstrap",
        );
        const prewarmCalls = requestWorkerRpc.mock.calls.filter(
            ([, payload]) => payload.action === "prewarm",
        );

        expect(bootstrapCalls).toHaveLength(1);
        expect(prewarmCalls).toHaveLength(0);
        expect(payload.timings).toEqual({
            datasetCreateMs: 0,
            layoutBootstrapMs: 0,
        });
    });

    it("keeps aggressive warms on the heavier prewarm path", async () => {
        const workerClient = await import("./workerClient");
        const { ConflictGridLayout } = await import("./rowIds");

        await workerClient.warmConflictGridWorkerDataset({
            conflictId: "123",
            version: "v1",
            layouts: [ConflictGridLayout.COALITION],
            aggressive: true,
        });

        const bootstrapCalls = requestWorkerRpc.mock.calls.filter(
            ([, payload]) => payload.action === "bootstrap",
        );
        const prewarmCalls = requestWorkerRpc.mock.calls.filter(
            ([, payload]) => payload.action === "prewarm",
        );

        expect(bootstrapCalls).toHaveLength(0);
        expect(prewarmCalls).toHaveLength(1);
    });

    it("keys bootstrap reuse by layout plus custom-column view hash", async () => {
        const workerClient = await import("./workerClient");
        const { ConflictGridLayout } = await import("./rowIds");

        const client = workerClient.createConflictGridWorkerClient({
            conflictId: "123",
            version: "v1",
        });

        const firstView = {
            customColumns: [
                sanitizeConflictCustomColumn({
                    kind: "member-rollup",
                    label: "Count of nations with off:wars > 5",
                    reducer: "count",
                    display: "number",
                    expr: {
                        kind: "compare",
                        op: "gt",
                        left: { kind: "metric", metric: "off:wars" },
                        right: { kind: "value", value: 5 },
                    },
                })!,
            ],
        };
        const secondView = {
            customColumns: [
                sanitizeConflictCustomColumn({
                    kind: "member-rollup",
                    label: "Share of nations with both:wars = 0",
                    reducer: "share",
                    display: "percent",
                    expr: {
                        kind: "compare",
                        op: "eq",
                        left: { kind: "metric", metric: "both:wars" },
                        right: { kind: "value", value: 0 },
                    },
                })!,
            ],
        };

        await client.bootstrap(ConflictGridLayout.COALITION, firstView);
        await client.bootstrap(ConflictGridLayout.COALITION, firstView);
        await client.bootstrap(ConflictGridLayout.COALITION, secondView);

        const bootstrapCalls = requestWorkerRpc.mock.calls.filter(
            ([, payload]) => payload.action === "bootstrap",
        );

        expect(bootstrapCalls).toHaveLength(2);
        expect(bootstrapCalls[0]?.[1]).toMatchObject({
            layout: ConflictGridLayout.COALITION,
            viewConfig: {
                customColumns: [
                    expect.objectContaining({
                        id: expect.stringMatching(/^cc-/),
                        kind: "member-rollup",
                        label: "Count of nations with off:wars > 5",
                        reducer: "count",
                        display: "number",
                        expr: {
                            kind: "compare",
                            op: "gt",
                            left: { kind: "metric", metric: "off:wars" },
                            right: { kind: "value", value: 5 },
                        },
                    }),
                ],
            },
        });
        expect(bootstrapCalls[1]?.[1]).toMatchObject({
            layout: ConflictGridLayout.COALITION,
            viewConfig: {
                customColumns: [
                    expect.objectContaining({
                        id: expect.stringMatching(/^cc-/),
                        kind: "member-rollup",
                        label: "Share of nations with both:wars = 0",
                        reducer: "share",
                        display: "percent",
                        expr: {
                            kind: "compare",
                            op: "eq",
                            left: { kind: "metric", metric: "both:wars" },
                            right: { kind: "value", value: 0 },
                        },
                    }),
                ],
            },
        });
    });
});