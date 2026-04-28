import { createAppUnpackr } from "./msgpack";
import type { CacheType } from "./apitypes";

export type QueryParams = Record<string, string | string[]>;
export type QueryParamInput = Record<string, string | string[] | undefined>;
export type FetchLike = typeof fetch;

export type EndpointCallOptions = {
    baseUrl?: string;
    fetchFn?: FetchLike;
    credentials?: RequestCredentials;
    signal?: AbortSignal;
};

export type EndpointClientCallOptions = {
    cacheTtlMs?: number | false;
    useBatch?: boolean;
    batchWindowMs?: number;
    signal?: AbortSignal;
};

export type EndpointClientOptions = {
    baseUrl: string;
    batchEndpointPath?: string;
    batchWindowMs?: number;
    maxBatchSize?: number;
    fetchFn?: FetchLike;
    credentials?: RequestCredentials;
};

type BatchQueueEntry<T> = {
    endpoint: ApiEndpoint<T>;
    params: QueryParamInput;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (error: unknown) => void;
};

export type EndpointArgument = {
    name?: string;
    optional?: boolean;
    flag?: string;
    type?: string;
    [key: string]: unknown;
};

const unpackr = createAppUnpackr();

function isAbsoluteUrl(value: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function joinUrl(baseUrl: string, path: string): string {
    if (isAbsoluteUrl(path)) {
        return path;
    }

    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const trimmedPath = path.replace(/^\/+/, "");
    return `${trimmedBase}/${trimmedPath}`;
}

function normalizeQuery(query: QueryParamInput): QueryParamInput {
    const normalized: QueryParamInput = {};
    for (const [key, value] of Object.entries(query)) {
        if (value == null) {
            continue;
        }
        normalized[key] = Array.isArray(value) ? [...value] : value;
    }
    return normalized;
}

function stableSerialize(value: unknown): string {
    if (value == null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function createRequestCacheKey(endpointUrl: string, params: QueryParamInput): string {
    return `${endpointUrl}?${stableSerialize(normalizeQuery(params))}`;
}

function encodeFormBody(query: QueryParamInput): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                params.append(key, item);
            }
            continue;
        }
        params.append(key, value);
    }
    return params.toString();
}

function appendQuery(url: string, query: QueryParamInput): string {
    const body = encodeFormBody(query);
    if (!body) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${body}`;
}

async function decodeResponse<T>(
    response: Response,
    cast: (data: unknown) => T,
): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(
            `Failed to fetch ${response.url}: ${response.status} ${message || response.statusText}`,
        );
    }

    let data: unknown;
    if (contentType.includes("application/msgpack")) {
        data = unpackr.unpack(new Uint8Array(await response.arrayBuffer()));
    } else if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    return cast(data);
}

export class ApiEndpoint<T> {
    readonly name: string;
    readonly url: string;
    readonly args: Record<string, EndpointArgument>;
    readonly cast: (data: unknown) => T;
    readonly cache_duration: number;
    readonly cache_type: CacheType;
    readonly typeName: string;
    readonly desc: string;
    readonly argsLower: Record<string, string>;
    readonly isPost: boolean;

    constructor(
        name: string,
        url: string,
        args: Record<string, EndpointArgument>,
        cast: (data: unknown) => T,
        cacheDuration: number,
        cacheType: CacheType,
        typeName: string,
        desc: string,
        isPost: boolean,
    ) {
        this.name = name;
        this.url = url;
        this.args = { ...args };
        this.cast = cast;
        this.cache_duration = cacheDuration;
        this.cache_type = cacheType;
        this.typeName = typeName;
        this.desc = desc;
        this.isPost = isPost;
        this.argsLower = {};
        for (const key of Object.keys(args)) {
            this.argsLower[key.toLowerCase()] = key;
        }
    }

    async call(params: QueryParamInput = {}, options: EndpointCallOptions = {}): Promise<T> {
        const headers = {
            Accept: "application/msgpack, application/json",
        };

        const fetchFn = options.fetchFn ?? fetch;
        const endpointUrl = options.baseUrl ? joinUrl(options.baseUrl, this.url) : this.url;

        const response = this.isPost
            ? await fetchFn(endpointUrl, {
                  method: "POST",
                  headers: {
                      ...headers,
                      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                  },
                  body: encodeFormBody(params),
                  credentials: options.credentials,
                  signal: options.signal,
              })
            : await fetchFn(appendQuery(endpointUrl, params), {
                  method: "GET",
                  headers,
                  credentials: options.credentials,
                  signal: options.signal,
              });

        return decodeResponse(response, this.cast);
    }
}

export class EndpointClient {
    private readonly baseUrl: string;
    private readonly batchEndpointPath: string;
    private readonly batchWindowMs: number;
    private readonly maxBatchSize: number;
    private readonly fetchFn: FetchLike;
    private readonly credentials: RequestCredentials;
    private readonly responseCache = new Map<string, { expiresAt: number; value: unknown }>();
    private readonly inflightRequests = new Map<string, Promise<unknown>>();
    private readonly batchQueue: BatchQueueEntry<any>[] = [];
    private batchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: EndpointClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.batchEndpointPath = options.batchEndpointPath ?? "query";
        this.batchWindowMs = options.batchWindowMs ?? 12;
        this.maxBatchSize = options.maxBatchSize ?? 16;
        this.fetchFn = options.fetchFn ?? fetch;
        this.credentials = options.credentials ?? "include";
    }

    async call<T>(
        endpointRef: CommonEndpoint<T, QueryParamInput, QueryParamInput> | ApiEndpoint<T>,
        params: QueryParamInput = {},
        options: EndpointClientCallOptions = {},
    ): Promise<T> {
        const endpoint = endpointRef instanceof ApiEndpoint ? endpointRef : endpointRef.endpoint;
        const normalizedParams = normalizeQuery(params);
        const cacheKey = createRequestCacheKey(endpoint.url, normalizedParams);
        const canShareInflightRequest = options.signal == null;
        const cached = this.getCachedValue<T>(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        if (canShareInflightRequest) {
            const inFlight = this.inflightRequests.get(cacheKey) as Promise<T> | undefined;
            if (inFlight) {
                return inFlight;
            }
        }

        const shouldBatch = (options.useBatch ?? !endpoint.isPost) && options.signal == null;

        const request = shouldBatch
            ? this.enqueueBatchRequest(endpoint, normalizedParams, options)
            : endpoint.call(normalizedParams, {
                  baseUrl: this.baseUrl,
                  fetchFn: this.fetchFn,
                  credentials: this.credentials,
                  signal: options.signal,
              });

        const trackedRequest = request
            .then((result) => {
                this.setCachedValue(cacheKey, result, options.cacheTtlMs);
                return result;
            })
            .finally(() => {
                this.inflightRequests.delete(cacheKey);
            });

        if (canShareInflightRequest) {
            this.inflightRequests.set(cacheKey, trackedRequest);
        }
        return trackedRequest;
    }

    clearCache(): void {
        this.responseCache.clear();
    }

    private getCachedValue<T>(cacheKey: string): T | undefined {
        const cached = this.responseCache.get(cacheKey);
        if (!cached) {
            return undefined;
        }
        if (cached.expiresAt <= Date.now()) {
            this.responseCache.delete(cacheKey);
            return undefined;
        }
        return cached.value as T;
    }

    private setCachedValue<T>(cacheKey: string, value: T, cacheTtlMs: number | false | undefined): void {
        if (cacheTtlMs === false) {
            return;
        }

        const ttlMs = cacheTtlMs ?? 30_000;
        if (ttlMs <= 0) {
            return;
        }

        this.responseCache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            value,
        });
    }

    private enqueueBatchRequest<T>(
        endpoint: ApiEndpoint<T>,
        params: QueryParamInput,
        options: EndpointClientCallOptions,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.batchQueue.push({ endpoint, params, resolve, reject });

            if (this.batchQueue.length >= this.maxBatchSize) {
                this.flushBatchQueue();
                return;
            }

            if (this.batchTimer != null) {
                return;
            }

            const waitMs = options.batchWindowMs ?? this.batchWindowMs;
            this.batchTimer = setTimeout(() => {
                this.batchTimer = null;
                this.flushBatchQueue();
            }, waitMs);
        });
    }

    private flushBatchQueue(): void {
        if (this.batchTimer != null) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (!this.batchQueue.length) {
            return;
        }

        const queue = this.batchQueue.splice(0, this.maxBatchSize);
        void this.runBatch(queue);

        if (this.batchQueue.length) {
            this.batchTimer = setTimeout(() => {
                this.batchTimer = null;
                this.flushBatchQueue();
            }, this.batchWindowMs);
        }
    }

    private async runBatch(queue: BatchQueueEntry<any>[]): Promise<void> {
        try {
            const response = await this.fetchFn(joinUrl(this.baseUrl, this.batchEndpointPath), {
                method: "POST",
                headers: {
                    Accept: "application/msgpack, application/json",
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                },
                credentials: this.credentials,
                body: encodeFormBody({
                    queries: JSON.stringify(
                        queue.map(({ endpoint, params }) => [endpoint.url, normalizeQuery(params)]),
                    ),
                }),
            });
            const bulkResult = await decodeResponse<{ results: unknown[] }>(response, (data) => {
                if (!data || typeof data !== "object" || !Array.isArray((data as { results?: unknown[] }).results)) {
                    throw new Error("Batch query response did not include a results array");
                }
                return { results: (data as { results: unknown[] }).results };
            });

            if (bulkResult.results.length !== queue.length) {
                throw new Error(
                    `Batch query returned ${bulkResult.results.length} results for ${queue.length} requests`,
                );
            }

            for (let index = 0; index < queue.length; index += 1) {
                const entry = queue[index];
                try {
                    entry.resolve(entry.endpoint.cast(bulkResult.results[index]));
                } catch (error) {
                    entry.reject(error);
                }
            }
        } catch (error) {
            for (const entry of queue) {
                entry.reject(error);
            }
        }
    }
}

export type CommonEndpoint<
    T,
    U extends QueryParamInput,
    V extends QueryParamInput,
> = {
    endpoint: ApiEndpoint<T>;
    __inputTypes?: {
        args: U;
        optionalArgs: V;
    };
};