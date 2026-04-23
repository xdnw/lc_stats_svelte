import { browser } from "$app/environment";
import {
    primeConflictGraphPayloadBytes,
} from "$lib/conflictGraphPayload";
import { appConfig as config } from "$lib/appConfig";

export const load = ({
    url,
    fetch,
}: {
    url: URL;
    fetch: typeof globalThis.fetch;
}) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    void primeConflictGraphPayloadBytes({
        conflictId,
        version: config.version.graph_data,
        fetcher: fetch,
    }).catch(() => {
        // The page-owned bootstrap path will surface failures if the prime is not usable.
    });
    return {};
};
