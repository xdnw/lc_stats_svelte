import { browser } from "$app/environment";
import {
    warmBubbleDefaultArtifact,
    warmConflictGraphPayload,
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
    return {};
};
