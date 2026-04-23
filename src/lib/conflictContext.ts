import { decompressBson } from "./binary";
import { mergeCompositeConflict, type CompositeMergeDiagnostics } from "./compositeMerge";
import { getConflictDataUrl } from "./runtime";
import type { Conflict } from "./types";
import type { ConflictRouteContext } from "./routeBootstrap";
import { deriveAavaCapability } from "./aava";
import {
    resolveCompositeContextInWorker,
} from "./compositeContextWorker";
import { startPerfSpan } from "./perf";
import {
    getOrLoadCompositeContext,
    makeCompositeContextCacheKey,
} from "./compositeContextCache";
import type { WorkerRpcError } from "./workerRpc";

export type ResolvedConflictContext = {
    mode: "single" | "composite";
    conflict: Conflict;
    conflictId: string | null;
    signature: string;
    sourceConflictIds: string[];
    selectedAllianceId: number | null;
    diagnostics: CompositeMergeDiagnostics | null;
    warnings: string[];
    aavaCapable: boolean;
    aavaIncompatibilities: string[];
};

type LoadConflictContextOptions = {
    loadConflict?: (id: string, conflictDataVersion: string | number) => Promise<Conflict>;
};

type LoadedConflictPayload = {
    id: string;
    data: Conflict;
};

async function loadConflictById(
    id: string,
    conflictDataVersion: string | number,
): Promise<Conflict> {
    return (await decompressBson(
        getConflictDataUrl(id, conflictDataVersion),
    )) as Conflict;
}

function resolveSingleConflictContext(
    context: Extract<ConflictRouteContext, { mode: "single" }>,
    conflict: Conflict,
): ResolvedConflictContext {
    const capability = deriveAavaCapability(conflict, null);

    return {
        mode: "single",
        conflict,
        conflictId: context.conflictId,
        signature: context.conflictSignature,
        sourceConflictIds: [context.conflictId],
        selectedAllianceId: null,
        diagnostics: null,
        warnings: [],
        aavaCapable: capability.capable,
        aavaIncompatibilities: [],
    };
}

function resolveCompositeConflictContext(
    context: Extract<ConflictRouteContext, { mode: "composite" }>,
    loaded: LoadedConflictPayload[],
): ResolvedConflictContext {
    const finishMergeSpan = startPerfSpan("mergeCompositeConflict", {
        conflictCount: loaded.length,
        selectedAllianceId: context.selectedAllianceId,
    });
    const merged = mergeCompositeConflict(loaded, context.selectedAllianceId);
    finishMergeSpan();
    const capability = deriveAavaCapability(
        merged.conflict,
        merged.diagnostics,
    );

    return {
        mode: "composite",
        conflict: merged.conflict,
        conflictId: null,
        signature: context.conflictSignature,
        sourceConflictIds: merged.diagnostics.mergedConflictIds,
        selectedAllianceId: context.selectedAllianceId,
        diagnostics: merged.diagnostics,
        warnings: [...merged.diagnostics.warnings],
        aavaCapable: capability.capable,
        aavaIncompatibilities: [...capability.reasons],
    };
}

async function loadCompositePayloads(
    context: Extract<ConflictRouteContext, { mode: "composite" }>,
    conflictDataVersion: string | number,
    loadConflict: (id: string, conflictDataVersion: string | number) => Promise<Conflict>,
): Promise<LoadedConflictPayload[]> {
    const finishCompositePayloadSpan = startPerfSpan(
        "conflictContext.load.compositePayloads",
        {
            conflictCount: context.compositeIds.length,
        },
    );

    try {
        return await Promise.all(
            context.compositeIds.map(async (id) => {
                const data = await loadConflict(id, conflictDataVersion);
                return { id, data };
            }),
        );
    } finally {
        finishCompositePayloadSpan();
    }
}

function shouldFallbackCompositeWorker(error: unknown): boolean {
    const kind = (error as WorkerRpcError | undefined)?.kind;
    return kind === "worker-unavailable" || kind === "transport" || kind === "runtime";
}

export async function loadConflictContext(
    context: ConflictRouteContext,
    conflictDataVersion: string | number,
    options?: LoadConflictContextOptions,
): Promise<ResolvedConflictContext> {
    const finishContextSpan = startPerfSpan("conflictContext.load", {
        mode: context.mode,
    });
    try {
        const loadConflict = options?.loadConflict ?? loadConflictById;

        if (context.mode === "single") {
            const finishSingleSpan = startPerfSpan("conflictContext.load.single", {
                conflictId: context.conflictId,
            });
            try {
                const conflict = await loadConflict(context.conflictId, conflictDataVersion);
                return resolveSingleConflictContext(context, conflict);
            } finally {
                finishSingleSpan();
            }
        }

        const cacheKey = makeCompositeContextCacheKey(
            context.conflictSignature,
            context.selectedAllianceId,
            conflictDataVersion,
        );

        return await getOrLoadCompositeContext(
            cacheKey,
            context.conflictSignature,
            context.selectedAllianceId,
            async () => {
                if (options?.loadConflict) {
                    const loaded = await loadCompositePayloads(
                        context,
                        conflictDataVersion,
                        loadConflict,
                    );
                    return resolveCompositeConflictContext(context, loaded);
                }

                try {
                    return await resolveCompositeContextInWorker({
                        signature: context.conflictSignature,
                        conflictIds: context.compositeIds,
                        conflictDataVersion,
                        selectedAllianceId: context.selectedAllianceId,
                    });
                } catch (error) {
                    if (!shouldFallbackCompositeWorker(error)) {
                        throw error;
                    }

                    const loaded = await loadCompositePayloads(
                        context,
                        conflictDataVersion,
                        loadConflict,
                    );
                    return resolveCompositeConflictContext(context, loaded);
                }
            },
        );
    } finally {
        finishContextSpan();
    }
}
