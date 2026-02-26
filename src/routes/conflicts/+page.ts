import { browser } from "$app/environment";
import { queueUrlPrefetch } from "$lib/prefetchCoordinator";
import { appConfig as config } from "$lib/appConfig";
import { getConflictsIndexUrl } from "$lib/runtime";

export const load = () => {
    if (!browser) return {};

    const url = getConflictsIndexUrl(config.version.conflicts);
    queueUrlPrefetch(url, { priority: "high", crossRoute: false });
    return {};
};
