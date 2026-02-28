import { appConfig as config } from "$lib/appConfig";
import { getConflictDataUrl } from "$lib/runtime";
import { createIdPrefetchLoader } from "$lib/routeLoaders";

export const load = createIdPrefetchLoader((conflictId) =>
    getConflictDataUrl(conflictId, config.version.conflict_data),
);
