import { decompressBson } from "./binary";
import { mergeCompositeConflict, type CompositeMergeDiagnostics } from "./compositeMerge";
import { getConflictDataUrl } from "./runtime";
import type { Conflict } from "./types";
import type { ConflictRouteContext } from "./routeBootstrap";

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

export async function loadConflictContext(
    context: ConflictRouteContext,
    conflictDataVersion: string | number,
): Promise<ResolvedConflictContext> {
    if (context.mode === "single") {
        const payload = (await decompressBson(
            getConflictDataUrl(context.conflictId, conflictDataVersion),
        )) as Conflict;

        return {
            mode: "single",
            conflict: payload,
            conflictId: context.conflictId,
            signature: context.conflictSignature,
            sourceConflictIds: [context.conflictId],
            selectedAllianceId: null,
            diagnostics: null,
            warnings: [],
            aavaCapable:
                Array.isArray(payload.war_web?.headers) &&
                payload.war_web.headers.length > 0 &&
                Array.isArray(payload.war_web?.data) &&
                payload.war_web.data.length > 0,
            aavaIncompatibilities: [],
        };
    }

    const loaded = await Promise.all(
        context.compositeIds.map(async (id) => {
            const data = (await decompressBson(
                getConflictDataUrl(id, conflictDataVersion),
            )) as Conflict;
            return { id, data };
        }),
    );

    const merged = mergeCompositeConflict(loaded, context.selectedAllianceId);

    return {
        mode: "composite",
        conflict: merged.conflict,
        conflictId: null,
        signature: context.conflictSignature,
        sourceConflictIds: merged.diagnostics.mergedConflictIds,
        selectedAllianceId: context.selectedAllianceId,
        diagnostics: merged.diagnostics,
        warnings: [...merged.diagnostics.warnings],
        aavaCapable: merged.diagnostics.aavaCapable,
        aavaIncompatibilities: [...merged.diagnostics.aavaIncompatibilities],
    };
}
