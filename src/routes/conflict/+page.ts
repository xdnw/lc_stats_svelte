import { browser } from "$app/environment";
import {
    warmRuntimeArtifact,
} from "$lib/prefetchArtifacts";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    warmRuntimeArtifact("plotly", {
        priority: "idle",
        reason: "route-conflict-load-sibling-plotly-runtime",
        routeTarget: "/bubble",
        intentStrength: "idle",
    });

    return {};
};
