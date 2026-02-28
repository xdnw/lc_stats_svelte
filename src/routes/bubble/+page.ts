import { appConfig as config } from "$lib/appConfig";
import { getConflictGraphDataUrl } from "$lib/runtime";
import { createIdPrefetchLoader } from "$lib/routeLoaders";

export const load = createIdPrefetchLoader((conflictId) =>
    getConflictGraphDataUrl(conflictId, config.version.graph_data),
);
