import { browser } from "$app/environment";
import { queueUrlPrefetch } from "$lib/prefetchCoordinator";
import { appConfig as config } from "$lib/appConfig";
import { getConflictGraphDataUrl } from "$lib/runtime";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};

    const conflictId = url.searchParams.get("id");
    if (!conflictId) return {};

    queueUrlPrefetch(getConflictGraphDataUrl(conflictId, config.version.graph_data), {
        priority: "high",
        crossRoute: false,
    });

    return {};
};
