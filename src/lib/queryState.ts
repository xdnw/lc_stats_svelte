import { pushState, replaceState } from "$app/navigation";
import LZString from "lz-string";
import { saveCurrentQueryParams } from "./queryStorage";

export type QueryParamValue = string | number | boolean | null | undefined;

type QueryParamCodec = {
    encode: (value: string) => string | null;
    decode: (value: string) => string | null;
};

const COMPRESSED_QUERY_PREFIX = "lz:";

function createCompressedQueryCodec(): QueryParamCodec {
    return {
        encode: (value: string) => {
            const compressed = LZString.compressToEncodedURIComponent(value);
            if (!compressed) return null;
            return `${COMPRESSED_QUERY_PREFIX}${compressed}`;
        },
        decode: (value: string) => {
            if (!value.startsWith(COMPRESSED_QUERY_PREFIX)) {
                return value;
            }

            const decompressed = LZString.decompressFromEncodedURIComponent(
                value.slice(COMPRESSED_QUERY_PREFIX.length),
            );
            return decompressed ?? null;
        },
    };
}

const queryParamCodecs: Record<string, QueryParamCodec> = {
    kpiw: createCompressedQueryCodec(),
    grid: createCompressedQueryCodec(),
};

export type SetQueryParamOptions = {
    replace?: boolean;
    defaultValue?: QueryParamValue;
};

export type SetQueryParamsOptions = {
    replace?: boolean;
    defaults?: Record<string, QueryParamValue>;
};

function applyQueryParamValue(
    searchParams: URLSearchParams,
    param: string,
    value: QueryParamValue,
    defaultValue?: QueryParamValue,
): void {
    const nextValue = normalizeQueryValue(value);
    const normalizedDefault = normalizeQueryValue(defaultValue);

    if (
        nextValue == null ||
        (normalizedDefault != null && nextValue === normalizedDefault)
    ) {
        searchParams.delete(param);
        return;
    }

    const encodedValue = encodeQueryParamValue(param, nextValue);
    if (encodedValue == null) {
        searchParams.delete(param);
        return;
    }

    searchParams.set(param, encodedValue);
}

function commitQueryUrl(url: URL, replace = false): void {
    const oldUrl = window.location.href;
    const newUrl = url.toString();
    if (oldUrl === newUrl) return;

    const pageState =
        window.history.state && typeof window.history.state === "object"
            ? (window.history.state as App.PageState)
            : {};

    if (replace) {
        replaceState(newUrl, pageState);
    } else {
        pushState(newUrl, pageState);
    }
}

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
    applyQueryParamValue(url.searchParams, param, value, options?.defaultValue);
    commitQueryUrl(url, options?.replace);
}

export function setQueryParams(
    values: Record<string, QueryParamValue>,
    options?: SetQueryParamsOptions,
): void {
    const url = new URL(window.location.href);

    for (const [param, value] of Object.entries(values)) {
        applyQueryParamValue(
            url.searchParams,
            param,
            value,
            options?.defaults?.[param],
        );
    }

    commitQueryUrl(url, options?.replace);
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

    const pageState =
        window.history.state && typeof window.history.state === "object"
            ? (window.history.state as App.PageState)
            : {};
    replaceState(url.toString(), pageState);
    saveCurrentQueryParams();

    for (const required of requiredKeys) {
        if (requiredSnapshot[required] != null) {
            setQueryParam(required, requiredSnapshot[required], {
                replace: true,
            });
        }
    }
}
