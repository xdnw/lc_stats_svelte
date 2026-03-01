import { browser } from "$app/environment";
import { queueUrlPrefetch } from "$lib/prefetchCoordinator";

type PrefetchOptions = {
    priority?: "high" | "idle";
    crossRoute?: boolean;
};

type UrlLoadInput = {
    url: URL;
};

function queuePrefetchIfBrowser(
    url: string,
    options?: PrefetchOptions,
): Record<string, never> {
    if (!browser) return {};

    queueUrlPrefetch(url, {
        priority: options?.priority ?? "high",
        crossRoute: options?.crossRoute ?? false,
    });

    return {};
}

export function createIdPrefetchLoader(
    resolveUrl: (id: string) => string,
    options?: PrefetchOptions,
): ({ url }: UrlLoadInput) => Record<string, never> {
    return ({ url }: UrlLoadInput) => {
        const conflictId = url.searchParams.get("id")?.trim();
        if (!conflictId) return {};
        return queuePrefetchIfBrowser(resolveUrl(conflictId), options);
    };
}

export function createStaticPrefetchLoader(
    resolveUrl: () => string,
    options?: PrefetchOptions,
): () => Record<string, never> {
    return () => {
        return queuePrefetchIfBrowser(resolveUrl(), options);
    };
}

