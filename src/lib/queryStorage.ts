import { getCompositeConflictSignature } from "./conflictIds";

export function getPageStorageKey(pathname?: string): string {
    const path = pathname ?? window.location.pathname;
    return `lc_stats:view:${path}`;
}

function normalizeStorageScope(scope: string | null | undefined): string | null {
    if (scope == null) return null;
    const trimmed = scope.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getScopedPageStorageKey(
    pathname?: string,
    entityScope?: string | null,
): string {
    const baseKey = getPageStorageKey(pathname);
    const normalizedScope = normalizeStorageScope(entityScope);
    if (!normalizedScope) return baseKey;
    return `${baseKey}::${normalizedScope}`;
}

export function getCompositeContextStorageScope(
    conflictIds: string[],
    selectedAllianceId: number | string | null | undefined,
): string {
    const signature = getCompositeConflictSignature(conflictIds);
    const aid =
        typeof selectedAllianceId === "number"
            ? selectedAllianceId
            : Number.parseInt(String(selectedAllianceId ?? ""), 10);
    const normalizedAid = Number.isFinite(aid) && aid > 0 ? aid : "none";
    return `composite=${signature}:aid=${normalizedAid}`;
}

export function saveCurrentQueryParams(
    storageKey?: string,
    includeEmpty = false,
): void {
    try {
        const key = storageKey ?? getPageStorageKey();
        const params = new URLSearchParams(window.location.search);
        const data: Record<string, string> = {};
        params.forEach((value, paramKey) => {
            if (includeEmpty || value !== "") {
                data[paramKey] = value;
            }
        });
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.warn("Failed to save view preset", error);
    }
}

function readSavedQueryParams(storageKey?: string): Record<string, string> {
    try {
        const key = storageKey ?? getPageStorageKey();
        const value = localStorage.getItem(key);
        if (!value) return {};
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed as Record<string, string>;
    } catch (error) {
        console.warn("Failed to read view preset", error);
        return {};
    }
}

export function applySavedQueryParamsIfMissing(
    keys: string[],
    requiredKeys: string[] = [],
    storageKey?: string,
): boolean {
    const saved = readSavedQueryParams(storageKey);
    if (Object.keys(saved).length === 0) return false;

    const url = new URL(window.location.href);
    for (const required of requiredKeys) {
        if (!url.searchParams.get(required)) {
            return false;
        }
    }

    let changed = false;
    for (const key of keys) {
        const hasInUrl = url.searchParams.has(key);
        const hasSaved = Object.prototype.hasOwnProperty.call(saved, key);

        if (!hasInUrl && hasSaved) {
            const value = saved[key];
            if (value == null || value === "") {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, value);
            }
            changed = true;
        }
    }

    if (changed) {
        window.history.replaceState({}, "", url.toString());
    }

    return changed;
}
