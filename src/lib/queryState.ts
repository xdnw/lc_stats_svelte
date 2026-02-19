export type QueryParamValue = string | number | boolean | null | undefined;

export function setQueryParam(
    param: string,
    value: QueryParamValue,
    options?: { replace?: boolean },
): void {
    const url = new URL(window.location.href);
    const oldUrl = url.toString();

    if (value == null) {
        url.searchParams.delete(param);
    } else {
        url.searchParams.set(param, String(value));
    }

    const newUrl = url.toString();
    if (oldUrl !== newUrl) {
        if (options?.replace) {
            window.history.replaceState({}, "", newUrl);
        } else {
            window.history.pushState({}, "", newUrl);
        }
    }
}

export function getPageStorageKey(pathname?: string): string {
    const path = pathname ?? window.location.pathname;
    return `lc_stats:view:${path}`;
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

export function readSavedQueryParams(storageKey?: string): Record<string, string> {
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

export function resetQueryParams(
    keysToClear: string[],
    requiredKeys: string[] = [],
): void {
    const url = new URL(window.location.href);
    for (const key of keysToClear) {
        url.searchParams.delete(key);
    }

    const requiredSnapshot: Record<string, string> = {};
    for (const required of requiredKeys) {
        const value = url.searchParams.get(required);
        if (value != null) {
            requiredSnapshot[required] = value;
        }
    }

    window.history.replaceState({}, "", url.toString());
    saveCurrentQueryParams();

    for (const required of requiredKeys) {
        if (requiredSnapshot[required] != null) {
            setQueryParam(required, requiredSnapshot[required], {
                replace: true,
            });
        }
    }
}
