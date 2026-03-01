import { warmConflictsIndexPayload } from "$lib/prefetchArtifacts";

export const load = () => {
    warmConflictsIndexPayload({
        priority: "high",
        reason: "route-conflicts-load-index",
        intentStrength: "load",
    });
    return {};
};
