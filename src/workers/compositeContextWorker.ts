import {
    isCompositeMergeError,
    mergeCompositeConflict,
    type CompositeMergeDiagnostics,
} from "../lib/compositeMerge";
import { createAppUnpackr } from "../lib/msgpack";
import type { Conflict } from "../lib/types";

const unpackr = createAppUnpackr();

export type CompositeContextWorkerResult = {
    mode: "composite";
    conflict: Conflict;
    conflictId: null;
    signature: string;
    sourceConflictIds: string[];
    selectedAllianceId: number;
    diagnostics: CompositeMergeDiagnostics;
    warnings: string[];
    aavaCapable: boolean;
    aavaIncompatibilities: string[];
};

type FetchAndMergeRequest = {
    id: number;
    action: "fetchAndMerge";
    signature: string;
    conflicts: Array<{ id: string; url: string }>;
    selectedAllianceId: number;
};

export type CompositeContextWorkerRequest = FetchAndMergeRequest;

type WorkerSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerFailure = {
    id: number;
    ok: false;
    error: string;
    details?: string[];
    kind?: "domain" | "runtime";
};

async function fetchConflict(
    url: string,
): Promise<Conflict> {
    const response = await fetch(url);
    if (!response.body) {
        throw new Error("Response body is null");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return unpackr.unpack(new Uint8Array(arrayBuffer)) as Conflict;
}

async function loadConflicts(
    conflicts: Array<{ id: string; url: string }>,
): Promise<Array<{ id: string; data: Conflict }>> {
    return Promise.all(
        conflicts.map(async (conflict) => ({
            id: conflict.id,
            data: await fetchConflict(conflict.url),
        })),
    );
}

function resolveCompositeContext(
    signature: string,
    selectedAllianceId: number,
    conflicts: Array<{ id: string; data: Conflict }>,
): CompositeContextWorkerResult {
    const merged = mergeCompositeConflict(conflicts, selectedAllianceId);
    return {
        mode: "composite",
        conflict: merged.conflict,
        conflictId: null,
        signature,
        sourceConflictIds: [...merged.diagnostics.mergedConflictIds],
        selectedAllianceId,
        diagnostics: merged.diagnostics,
        warnings: [...merged.diagnostics.warnings],
        aavaCapable: merged.diagnostics.aavaCapable,
        aavaIncompatibilities: [...merged.diagnostics.aavaIncompatibilities],
    };
}

async function handleRequest(
    request: CompositeContextWorkerRequest,
): Promise<CompositeContextWorkerResult> {
    const loadedConflicts = await loadConflicts(request.conflicts);
    return resolveCompositeContext(
        request.signature,
        request.selectedAllianceId,
        loadedConflicts,
    );
}

self.onmessage = async (event: MessageEvent<CompositeContextWorkerRequest>) => {
    const request = event.data;
    try {
        const result = await handleRequest(request);
        const response: WorkerSuccess<CompositeContextWorkerResult> = {
            id: request.id,
            ok: true,
            result,
        };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerFailure = {
            id: request.id,
            ok: false,
            error: error instanceof Error
                ? error.message
                : "Composite context worker failed",
            details: isCompositeMergeError(error) ? error.details : undefined,
            kind: isCompositeMergeError(error) ? "domain" : "runtime",
        };
        self.postMessage(response);
    }
};
