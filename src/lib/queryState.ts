import LZString from "lz-string";

export type QueryParamValue = string | number | boolean | null | undefined;

type QueryParamCodec = {
    encode: (value: string) => string | null;
    decode: (value: string) => string | null;
};

const KPIW_PREFIX = "lz:";

const queryParamCodecs: Record<string, QueryParamCodec> = {
    kpiw: {
        encode: (value: string) => {
            const compressed = LZString.compressToEncodedURIComponent(value);
            if (!compressed) return null;
            return `${KPIW_PREFIX}${compressed}`;
        },
        decode: (value: string) => {
            if (value.startsWith(KPIW_PREFIX)) {
                const decompressed = LZString.decompressFromEncodedURIComponent(
                    value.slice(KPIW_PREFIX.length),
                );
                return decompressed ?? null;
            }

            return value;
        },
    },
};

export type SetQueryParamOptions = {
    replace?: boolean;
    defaultValue?: QueryParamValue;
};

export type SetQueryParamsOptions = {
    replace?: boolean;
    defaults?: Record<string, QueryParamValue>;
};

function normalizeQueryValue(value: QueryParamValue): string | null {
    if (value == null) return null;
    return String(value);
}

export function encodeQueryParamValue(
    param: string,
    value: QueryParamValue,
): string | null {
    const normalized = normalizeQueryValue(value);
    if (normalized == null) return null;
    const codec = queryParamCodecs[param];
    if (!codec) return normalized;
    return codec.encode(normalized);
}

export function decodeQueryParamValue(
    param: string,
    value: string | null,
): string | null {
    if (value == null) return null;
    const codec = queryParamCodecs[param];
    if (!codec) return value;
    return codec.decode(value);
}

export function getCurrentQueryParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
}

export function getQueryParam(param: string): string | null {
    const rawValue = getCurrentQueryParams().get(param);
    return decodeQueryParamValue(param, rawValue);
}

export function setQueryParam(
    param: string,
    value: QueryParamValue,
    options?: SetQueryParamOptions,
): void {
    const url = new URL(window.location.href);
    const oldUrl = url.toString();

    const nextValue = normalizeQueryValue(value);
    const defaultValue = normalizeQueryValue(options?.defaultValue);

    if (nextValue == null || (defaultValue != null && nextValue === defaultValue)) {
        url.searchParams.delete(param);
    } else {
        const encodedValue = encodeQueryParamValue(param, nextValue);
        if (encodedValue == null) {
            url.searchParams.delete(param);
        } else {
            url.searchParams.set(param, encodedValue);
        }
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

export function setQueryParams(
    values: Record<string, QueryParamValue>,
    options?: SetQueryParamsOptions,
): void {
    const url = new URL(window.location.href);
    const oldUrl = url.toString();

    for (const [param, value] of Object.entries(values)) {
        const nextValue = normalizeQueryValue(value);
        const defaultValue = normalizeQueryValue(options?.defaults?.[param]);
        if (
            nextValue == null ||
            (defaultValue != null && nextValue === defaultValue)
        ) {
            url.searchParams.delete(param);
        } else {
            const encodedValue = encodeQueryParamValue(param, nextValue);
            if (encodedValue == null) {
                url.searchParams.delete(param);
            } else {
                url.searchParams.set(param, encodedValue);
            }
        }
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
