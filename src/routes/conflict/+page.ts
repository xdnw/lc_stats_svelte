import { browser } from "$app/environment";
import {
    warmConflictPayload,
    warmConflictTableArtifact,
    warmRuntimeArtifact,
} from "$lib/prefetchArtifacts";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    warmConflictPayload(conflictId, {
        priority: "high",
        reason: "route-conflict-load-payload",
        routeTarget: "/conflict",
        intentStrength: "load",
    });
    warmConflictTableArtifact(conflictId, {
        priority: "high",
        reason: "route-conflict-load-default-table",
        routeTarget: "/conflict",
        intentStrength: "load",
    });
    warmRuntimeArtifact("table", {
        priority: "high",
        reason: "route-conflict-load-runtime",
        routeTarget: "/conflict",
        intentStrength: "load",
    });
    warmRuntimeArtifact("plotly", {
        priority: "idle",
        reason: "route-conflict-load-sibling-plotly-runtime",
        routeTarget: "/bubble",
        intentStrength: "idle",
    });

    return {};
};
