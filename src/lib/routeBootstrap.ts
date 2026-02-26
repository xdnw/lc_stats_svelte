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

export function bootstrapIdRoute(options: IdRouteBootstrapOptions): void {
    applySavedQueryParamsIfMissing(
        options.restoreParams ?? [],
        options.preserveParams,
    );

    options.beforeResolveId?.();

    const query = getCurrentQueryParams();
    const id = query.get("id");
    if (!id) {
        options.onMissingId();
        return;
    }

    void options.onResolvedId(id, query);
}