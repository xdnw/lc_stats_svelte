import { appConfig as config } from "$lib/appConfig";
import { getConflictsIndexUrl } from "$lib/runtime";
import { createStaticPrefetchLoader } from "$lib/routeLoaders";

export const load = createStaticPrefetchLoader(() =>
    getConflictsIndexUrl(config.version.conflicts),
);
