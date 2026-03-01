import { browser } from "$app/environment";
import {
    warmBubbleDefaultArtifact,
    warmConflictGraphPayload,
    warmConflictTableArtifact,
} from "$lib/prefetchArtifacts";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    warmConflictGraphPayload(conflictId, {
        priority: "high",
        reason: "route-bubble-load-graph-payload",
        routeTarget: "/bubble",
        intentStrength: "load",
    });
    warmBubbleDefaultArtifact(conflictId, {
        priority: "high",
        reason: "route-bubble-load-default-trace",
        routeTarget: "/bubble",
        intentStrength: "load",
    });
    warmConflictTableArtifact(conflictId, {
        priority: "idle",
        reason: "route-bubble-load-backpath-table",
        routeTarget: "/conflict",
        intentStrength: "idle",
    });

    return {};
};
