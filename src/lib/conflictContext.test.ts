import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conflict } from "./types";
import type { ConflictRouteContext } from "./routeBootstrap";

const mocks = vi.hoisted(() => ({
    resolveCompositeContextInWorker: vi.fn(),
    getOrLoadCompositeContext: vi.fn(),
    makeCompositeContextCacheKey: vi.fn(),
    mergeCompositeConflict: vi.fn(),
    deriveAavaCapability: vi.fn(),
    decompressBson: vi.fn(),
    getConflictDataUrl: vi.fn(),
    startPerfSpan: vi.fn(),
}));

vi.mock("./compositeContextWorker", () => ({
    resolveCompositeContextInWorker: mocks.resolveCompositeContextInWorker,
}));

vi.mock("./compositeContextCache", () => ({
    getOrLoadCompositeContext: mocks.getOrLoadCompositeContext,
    makeCompositeContextCacheKey: mocks.makeCompositeContextCacheKey,
}));

vi.mock("./compositeMerge", () => ({
    mergeCompositeConflict: mocks.mergeCompositeConflict,
}));

vi.mock("./aava", () => ({
    deriveAavaCapability: mocks.deriveAavaCapability,
}));

vi.mock("./binary", () => ({
    decompressBson: mocks.decompressBson,
}));

vi.mock("./runtime", () => ({
    getConflictDataUrl: mocks.getConflictDataUrl,
}));

vi.mock("./perf", () => ({
    startPerfSpan: mocks.startPerfSpan,
}));

import { loadConflictContext } from "./conflictContext";

const CONTEXT: Extract<ConflictRouteContext, { mode: "composite" }> = {
    mode: "composite",
    conflictId: null,
    conflictSignature: "1,2",
    compositeIds: ["1", "2"],
    selectedAllianceId: 42,
};

const MERGED_CONFLICT = {
    name: "Composite",
    wiki: "",
    start: 1,
    end: -1,
    cb: "Composite merge",
    status: "Composite",
    posts: {},
    coalitions: [],
    damage_header: [],
    header_type: [],
    war_web: {
        headers: ["wars"],
        data: [],
    },
} as unknown as Conflict;

const MERGE_DIAGNOSTICS = {
    mergedConflictIds: ["1", "2"],
    selectedAllianceId: 42,
    selectedAllianceName: "Rose",
    warnings: ["warning"],
    compatibilityNotes: [],
    headerReconciliationWarnings: [],
    warWebReconciliationWarnings: [],
    sideOverlapAllianceIds: [],
    aavaCapable: true,
    aavaIncompatibilities: [],
};

const WORKER_RESULT = {
    mode: "composite" as const,
    conflict: MERGED_CONFLICT,
    conflictId: null,
    signature: CONTEXT.conflictSignature,
    sourceConflictIds: ["1", "2"],
    selectedAllianceId: CONTEXT.selectedAllianceId,
    diagnostics: MERGE_DIAGNOSTICS,
    warnings: ["warning"],
    aavaCapable: true,
    aavaIncompatibilities: [],
};

function createConflict(id: string): Conflict {
    return {
        ...MERGED_CONFLICT,
        name: `Conflict ${id}`,
    };
}

describe("loadConflictContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getOrLoadCompositeContext.mockImplementation(
            async (_key: string, _signature: string, _aid: number, load: () => Promise<unknown>) =>
                await load(),
        );
        mocks.makeCompositeContextCacheKey.mockReturnValue("composite-cache-key");
        mocks.mergeCompositeConflict.mockReturnValue({
            conflict: MERGED_CONFLICT,
            diagnostics: MERGE_DIAGNOSTICS,
        });
        mocks.deriveAavaCapability.mockReturnValue({
            capable: true,
            reasons: [],
        });
        mocks.getConflictDataUrl.mockImplementation(
            (id: string, version: string | number) => `https://example.test/${id}?v=${String(version)}`,
        );
        mocks.startPerfSpan.mockReturnValue(() => {});
    });

    it("uses the composite worker when conflictContext owns payload loading", async () => {
        mocks.resolveCompositeContextInWorker.mockResolvedValue(WORKER_RESULT);

        const resolved = await loadConflictContext(CONTEXT, "v1");

        expect(mocks.resolveCompositeContextInWorker).toHaveBeenCalledWith({
            signature: CONTEXT.conflictSignature,
            conflictIds: CONTEXT.compositeIds,
            conflictDataVersion: "v1",
            selectedAllianceId: CONTEXT.selectedAllianceId,
        });
        expect(mocks.mergeCompositeConflict).not.toHaveBeenCalled();
        expect(mocks.decompressBson).not.toHaveBeenCalled();
        expect(resolved).toEqual(WORKER_RESULT);
    });

    it("keeps merge local when the caller already owns loaded payloads", async () => {
        const loadConflict = vi.fn(async (id: string) => createConflict(id));

        const resolved = await loadConflictContext(CONTEXT, "v1", {
            loadConflict,
        });

        expect(loadConflict).toHaveBeenCalledTimes(2);
        expect(mocks.resolveCompositeContextInWorker).not.toHaveBeenCalled();
        expect(mocks.mergeCompositeConflict).toHaveBeenCalledWith(
            [
                { id: "1", data: createConflict("1") },
                { id: "2", data: createConflict("2") },
            ],
            CONTEXT.selectedAllianceId,
        );
        expect(resolved.conflict).toBe(MERGED_CONFLICT);
        expect(resolved.aavaCapable).toBe(true);
    });

    it("falls back to local load and merge on worker transport failure", async () => {
        mocks.resolveCompositeContextInWorker.mockRejectedValue(
            Object.assign(new Error("worker transport failed"), {
                kind: "transport",
            }),
        );
        mocks.decompressBson.mockImplementation(async (url: string) => createConflict(url));

        const resolved = await loadConflictContext(CONTEXT, 7);

        expect(mocks.resolveCompositeContextInWorker).toHaveBeenCalledOnce();
        expect(mocks.getConflictDataUrl).toHaveBeenNthCalledWith(1, "1", 7);
        expect(mocks.getConflictDataUrl).toHaveBeenNthCalledWith(2, "2", 7);
        expect(mocks.decompressBson).toHaveBeenCalledTimes(2);
        expect(mocks.mergeCompositeConflict).toHaveBeenCalledOnce();
        expect(resolved.conflict).toBe(MERGED_CONFLICT);
    });
});
