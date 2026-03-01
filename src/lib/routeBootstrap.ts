import {
    getCurrentQueryParams,
} from "./queryState";
import { applySavedQueryParamsIfMissing } from "./queryStorage";
import {
    getCompositeConflictSignature,
    parseCompositeSelectionIds,
} from "./conflictIds";

export type IdRouteOptions = {
    restoreParams?: string[];
    preserveParams?: string[];
    storageKey?: string | ((query: URLSearchParams) => string | undefined);
    onBeforeResolve?: (query: URLSearchParams) => void;
    onMissingId: () => void;
    onResolvedId: (id: string, query: URLSearchParams) => void | Promise<void>;
};

export type ConflictRouteContext =
    | {
          mode: "single";
          conflictId: string;
          conflictSignature: string;
          compositeIds: null;
          selectedAllianceId: null;
      }
    | {
          mode: "composite";
          conflictId: null;
          conflictSignature: string;
          compositeIds: string[];
          selectedAllianceId: number;
      };

export type ConflictRouteLifecycleOptions = {
    restoreParams?: string[];
    preserveParams?: string[];
    storageKey?: string | ((query: URLSearchParams) => string | undefined);
    onBeforeResolve?: (query: URLSearchParams) => void;
    onMissingContext: () => void;
    onResolvedContext: (
        context: ConflictRouteContext,
        query: URLSearchParams,
    ) => void | Promise<void>;
};

type RouteBootstrapOptions<T> = {
    restoreParams?: string[];
    preserveParams?: string[];
    storageKey?: string | ((query: URLSearchParams) => string | undefined);
    beforeResolve?: (query: URLSearchParams) => void;
    resolveFromQuery: (query: URLSearchParams) => T | null;
    validateResolved?: (value: T, query: URLSearchParams) => T | null;
    onMissing: () => void;
    onResolved: (value: T, query: URLSearchParams) => void | Promise<void>;
};

function bootstrapRoute<T>(options: RouteBootstrapOptions<T>): void {
    const initialQuery = getCurrentQueryParams();
    const storageKey =
        typeof options.storageKey === "function"
            ? options.storageKey(initialQuery)
            : options.storageKey;

    applySavedQueryParamsIfMissing(
        options.restoreParams ?? [],
        options.preserveParams,
        storageKey,
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

export function bootstrapIdRouteLifecycle(
    options: IdRouteOptions,
): void {
    bootstrapRoute<string>({
        restoreParams: options.restoreParams,
        preserveParams: options.preserveParams,
        storageKey: options.storageKey,
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

function resolveConflictRouteContext(
    query: URLSearchParams,
): ConflictRouteContext | null {
    const rawId = (query.get("id") ?? "").trim();
    if (rawId.length > 0) {
        return {
            mode: "single",
            conflictId: rawId,
            conflictSignature: rawId,
            compositeIds: null,
            selectedAllianceId: null,
        };
    }

    const parsed = parseCompositeSelectionIds(query.get("ids"));
    const rawAid = (query.get("aid") ?? "").trim();
    const selectedAllianceId = /^\d+$/.test(rawAid)
        ? Number.parseInt(rawAid, 10)
        : Number.NaN;

    if (parsed.ids.length < 2 || !Number.isFinite(selectedAllianceId) || selectedAllianceId <= 0) {
        return null;
    }

    return {
        mode: "composite",
        conflictId: null,
        conflictSignature: getCompositeConflictSignature(parsed.ids),
        compositeIds: parsed.ids,
        selectedAllianceId,
    };
}

export function bootstrapConflictRouteLifecycle(
    options: ConflictRouteLifecycleOptions,
): void {
    bootstrapRoute<ConflictRouteContext>({
        restoreParams: options.restoreParams,
        preserveParams: options.preserveParams,
        storageKey: options.storageKey,
        beforeResolve: (query) => {
            options.onBeforeResolve?.(query);
        },
        resolveFromQuery: resolveConflictRouteContext,
        onMissing: options.onMissingContext,
        onResolved: options.onResolvedContext,
    });
}

