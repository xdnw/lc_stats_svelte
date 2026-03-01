import { browser } from "$app/environment";
import {
    warmConflictGraphPayload,
    warmConflictTableArtifact,
    warmTieringDefaultArtifact,
} from "$lib/prefetchArtifacts";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    warmConflictGraphPayload(conflictId, {
        priority: "high",
        reason: "route-tiering-load-graph-payload",
        routeTarget: "/tiering",
        intentStrength: "load",
    });
    warmTieringDefaultArtifact(conflictId, {
        priority: "high",
        reason: "route-tiering-load-default-dataset",
        routeTarget: "/tiering",
        intentStrength: "load",
    });
    warmConflictTableArtifact(conflictId, {
        priority: "idle",
        reason: "route-tiering-load-backpath-table",
        routeTarget: "/conflict",
        intentStrength: "idle",
    });

    return {};
};
