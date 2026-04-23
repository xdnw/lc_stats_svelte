import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createLocalCompositeConflictGridSession: vi.fn(),
    createWorkerCompositeConflictGridSession: vi.fn(),
    shouldFallbackCompositeConflictGridWorker: vi.fn(),
}));

vi.mock("./localSession", () => ({
    createLocalCompositeConflictGridSession: mocks.createLocalCompositeConflictGridSession,
}));

vi.mock("./workerSession", () => ({
    createWorkerCompositeConflictGridSession: mocks.createWorkerCompositeConflictGridSession,
    shouldFallbackCompositeConflictGridWorker: mocks.shouldFallbackCompositeConflictGridWorker,
}));

import { createCompositeConflictGridSession } from "./session";
import { ConflictGridLayout } from "../conflictGrid/rowIds";
import type { CompositeConflictGridClient, CompositeConflictGridSession } from "./types";

function createClient(label: string, overrides?: Partial<CompositeConflictGridClient>): CompositeConflictGridClient {
    return {
        conflictId: label,
        datasetRef: {
            datasetKey: `${label}-dataset`,
            signature: label,
            conflicts: [],
            selectedAllianceId: 1,
            version: "v1",
        },
        bootstrap: vi.fn(async () => ({
            datasetKey: `${label}-dataset`,
            meta: {} as never,
            layout: ConflictGridLayout.COALITION,
            grid: { columns: [], rowCount: 0 },
            presetMetrics: {} as never,
            timings: { datasetCreateMs: 0, layoutBootstrapMs: 0 },
            composite: {
                diagnostics: {} as never,
                warnings: [],
                resolvedConflictIds: [],
                failedConflictIds: [],
                selectedAllianceId: 1,
            },
        })),
        query: vi.fn(async () => ({ rows: [], filteredRowCount: 0, totalRowCount: 0 } as never)),
        querySummary: vi.fn(async () => ({})),
        getRowDetails: vi.fn(async () => null),
        getFilteredRowIds: vi.fn(async () => []),
        exportRows: vi.fn(async () => ({ columns: [], rows: [] } as never)),
        prewarmLayouts: vi.fn(async () => ({
            datasetKey: `${label}-dataset`,
            warmedLayouts: [],
            metricVectorsWarmed: 0,
            elapsedMs: 0,
        })),
        destroy: vi.fn(),
        ...overrides,
    };
}

function createSession(label: string, overrides?: {
    resolve?: CompositeConflictGridSession["resolve"];
    createClient?: CompositeConflictGridSession["createClient"];
    destroy?: CompositeConflictGridSession["destroy"];
}): CompositeConflictGridSession {
    return {
        resolve: overrides?.resolve ?? vi.fn(async () => ({
            signature: label,
            resolvedConflictIds: [label],
            failedConflictIds: [],
            allianceOptions: [],
            defaultAllianceId: 1,
            noCommonAllianceDetails: [],
        })),
        createClient: overrides?.createClient ?? vi.fn(() => createClient(label)),
        destroy: overrides?.destroy ?? vi.fn(),
    };
}

describe("createCompositeConflictGridSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.shouldFallbackCompositeConflictGridWorker.mockImplementation(
            (error: unknown) => (error as { kind?: string } | undefined)?.kind === "worker-unavailable" ||
                (error as { kind?: string } | undefined)?.kind === "transport" ||
                (error as { kind?: string } | undefined)?.kind === "runtime",
        );
    });

    it("falls back to the local session when worker session creation fails", async () => {
        const fallbackSession = createSession("local");
        mocks.createWorkerCompositeConflictGridSession.mockImplementation(() => {
            throw Object.assign(new Error("no worker"), { kind: "worker-unavailable" });
        });
        mocks.createLocalCompositeConflictGridSession.mockReturnValue(fallbackSession);

        const session = createCompositeConflictGridSession({
            signature: "sig",
            conflictIds: ["1", "2"],
            version: "v1",
        });

        await expect(session.resolve()).resolves.toEqual({
            signature: "local",
            resolvedConflictIds: ["local"],
            failedConflictIds: [],
            allianceOptions: [],
            defaultAllianceId: 1,
            noCommonAllianceDetails: [],
        });

        session.destroy();

        expect(mocks.createLocalCompositeConflictGridSession).toHaveBeenCalledOnce();
        expect(fallbackSession.destroy).toHaveBeenCalledOnce();
    });

    it("switches a client call to the local session after a fallback-eligible worker failure", async () => {
        const workerClient = createClient("worker", {
            bootstrap: vi.fn(async () => {
                throw Object.assign(new Error("transport"), { kind: "transport" });
            }),
        });
        const localClient = createClient("local");
        const workerSession = createSession("worker", {
            createClient: vi.fn(() => workerClient),
        });
        const fallbackSession = createSession("local", {
            createClient: vi.fn(() => localClient),
        });

        mocks.createWorkerCompositeConflictGridSession.mockReturnValue(workerSession);
        mocks.createLocalCompositeConflictGridSession.mockReturnValue(fallbackSession);

        const session = createCompositeConflictGridSession({
            signature: "sig",
            conflictIds: ["1", "2"],
            version: "v1",
        });
        const client = session.createClient(1);

        const result = await client.bootstrap(ConflictGridLayout.COALITION);

        expect(workerSession.destroy).toHaveBeenCalledOnce();
        expect(workerClient.destroy).toHaveBeenCalledOnce();
        expect(result.datasetKey).toBe("local-dataset");
    });
});
