import { browser } from "$app/environment";
import { queueUrlPrefetch } from "$lib/prefetchCoordinator";
import { appConfig as config } from "$lib/appConfig";
import { getConflictDataUrl } from "$lib/runtime";

export const load = ({ url }: { url: URL }) => {
    if (!browser) return {};

    const conflictId = url.searchParams.get("id");
    if (!conflictId) return {};

    queueUrlPrefetch(getConflictDataUrl(conflictId, config.version.conflict_data), {
        priority: "high",
        crossRoute: false,
    });

    return {};
};
