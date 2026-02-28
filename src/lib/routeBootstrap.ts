import {
    applySavedQueryParamsIfMissing,
    getCurrentQueryParams,
} from "./queryState";

export type IdRouteBootstrapOptions = {
    restoreParams?: string[];
    preserveParams?: string[];
    beforeResolveId?: () => void;
    onMissingId: () => void;
    onResolvedId: (id: string, query: URLSearchParams) => void | Promise<void>;
};

export type IdRouteLifecycleOptions = {
    restoreParams?: string[];
    preserveParams?: string[];
    onBeforeResolve?: (query: URLSearchParams) => void;
    onMissingId: () => void;
    onResolvedId: (id: string, query: URLSearchParams) => void | Promise<void>;
};

type RouteBootstrapOptions<T> = {
    restoreParams?: string[];
    preserveParams?: string[];
    beforeResolve?: (query: URLSearchParams) => void;
    resolveFromQuery: (query: URLSearchParams) => T | null;
    validateResolved?: (value: T, query: URLSearchParams) => T | null;
    onMissing: () => void;
    onResolved: (value: T, query: URLSearchParams) => void | Promise<void>;
};

function bootstrapRoute<T>(options: RouteBootstrapOptions<T>): void {
    applySavedQueryParamsIfMissing(
        options.restoreParams ?? [],
        options.preserveParams,
    );

    const query = getCurrentQueryParams();
    options.beforeResolve?.(query);

    const resolved = options.resolveFromQuery(query);
    if (resolved == null) {
        options.onMissing();
        return;
    }

    const validated = options.validateResolved
        ? options.validateResolved(resolved, query)
        : resolved;

    if (validated == null) {
        options.onMissing();
        return;
    }

    void options.onResolved(validated, query);
}

export function bootstrapIdRoute(options: IdRouteBootstrapOptions): void {
    bootstrapRoute<string>({
        restoreParams: options.restoreParams,
        preserveParams: options.preserveParams,
        beforeResolve: () => {
            options.beforeResolveId?.();
        },
        resolveFromQuery: (query) => query.get("id"),
        validateResolved: (id) => {
            const trimmed = id.trim();
            return trimmed.length > 0 ? trimmed : null;
        },
        onMissing: options.onMissingId,
        onResolved: options.onResolvedId,
    });
}

export function bootstrapIdRouteLifecycle(
    options: IdRouteLifecycleOptions,
): void {
    bootstrapRoute<string>({
        restoreParams: options.restoreParams,
        preserveParams: options.preserveParams,
        beforeResolve: (query) => {
            options.onBeforeResolve?.(query);
        },
        resolveFromQuery: (query) => query.get("id"),
        validateResolved: (id) => {
            const trimmed = id.trim();
            return trimmed.length > 0 ? trimmed : null;
        },
        onMissing: options.onMissingId,
        onResolved: options.onResolvedId,
    });
}

