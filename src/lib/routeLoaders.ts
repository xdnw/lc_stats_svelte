import { browser } from "$app/environment";
import { queueUrlPrefetch } from "$lib/prefetchCoordinator";

type PrefetchOptions = {
    priority?: "high" | "idle";
    crossRoute?: boolean;
};

type UrlLoadInput = {
    url: URL;
};

export function createIdPrefetchLoader(
    resolveUrl: (id: string) => string,
    options?: PrefetchOptions,
): ({ url }: UrlLoadInput) => Record<string, never> {
    return ({ url }: UrlLoadInput) => {
        if (!browser) return {};

        const conflictId = url.searchParams.get("id")?.trim();
        if (!conflictId) return {};

        queueUrlPrefetch(resolveUrl(conflictId), {
            priority: options?.priority ?? "high",
            crossRoute: options?.crossRoute ?? false,
        });

        return {};
    };
}

export function createStaticPrefetchLoader(
    resolveUrl: () => string,
    options?: PrefetchOptions,
): () => Record<string, never> {
    return () => {
        if (!browser) return {};

        queueUrlPrefetch(resolveUrl(), {
            priority: options?.priority ?? "high",
            crossRoute: options?.crossRoute ?? false,
        });

        return {};
    };
}

