import { inflateGzipBytes } from './compressedBytes';
import { createAppUnpackr } from './msgpack';
import { incrementPerfCounter, startPerfSpan } from './perf';
import { requestWorkerRpc } from './workerRpc';
import type {
    DecompressInflateBytesRequest,
    DecompressUrlRequest,
} from '../workers/decompressWorker';

const extUnpackr = createAppUnpackr();

type DecompressedCacheEntry = {
    promise: Promise<any>;
    settled: boolean;
};

type FetchLike = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>;

type GlobalWithPrimedCompressedPayloads = typeof globalThis & {
    __lcPrimedCompressedPayloads?: Record<string, Promise<ArrayBuffer>>;
};

export type DecompressStrategy = 'worker' | 'main' | 'worker-bytes';

type DecompressOptions = {
    forceRefresh?: boolean;
    strategy?: DecompressStrategy;
};

const DECOMPRESSED_CACHE_MAX_ENTRIES = 48;
const decompressedCache = new Map<string, DecompressedCacheEntry>();

function touchDecompressedCacheEntry(
    url: string,
    entry: DecompressedCacheEntry,
): void {
    if (decompressedCache.get(url) !== entry) return;
    decompressedCache.delete(url);
    decompressedCache.set(url, entry);
}

function enforceDecompressedCacheLimit(): void {
    if (decompressedCache.size <= DECOMPRESSED_CACHE_MAX_ENTRIES) {
        return;
    }

    while (decompressedCache.size > DECOMPRESSED_CACHE_MAX_ENTRIES) {
        let evicted = false;
        for (const [url, entry] of decompressedCache) {
            if (!entry.settled) continue;
            decompressedCache.delete(url);
            incrementPerfCounter('decompress.cache.eviction');
            evicted = true;
            break;
        }

        // Keep in-flight promises alive for dedupe even if that means a temporary overflow.
        if (!evicted) {
            break;
        }
    }
}

function getPrimedCompressedPayload(
    url: string,
    options?: { consume?: boolean },
): Promise<ArrayBuffer> | null {
    const globalWithPrimedPayloads = globalThis as GlobalWithPrimedCompressedPayloads;
    const primed = globalWithPrimedPayloads.__lcPrimedCompressedPayloads?.[url] ?? null;
    if (!primed) {
        return null;
    }

    if (options?.consume !== false) {
        delete globalWithPrimedPayloads.__lcPrimedCompressedPayloads?.[url];
    }

    return primed;
}

function setPrimedCompressedPayload(
    url: string,
    promise: Promise<ArrayBuffer>,
): Promise<ArrayBuffer> {
    const globalWithPrimedPayloads = globalThis as GlobalWithPrimedCompressedPayloads;
    const primed =
        globalWithPrimedPayloads.__lcPrimedCompressedPayloads ??
        (globalWithPrimedPayloads.__lcPrimedCompressedPayloads = Object.create(null));

    primed[url] = promise;
    const clearIfCurrent = () => {
        if (primed[url] === promise) {
            delete primed[url];
        }
    };
    promise.catch(() => {
        clearIfCurrent();
    });
    setTimeout(clearIfCurrent, 30_000);
    return promise;
}

function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
    return buffer.slice(0);
}

export function primeCompressedPayload(
    url: string,
    options?: { fetcher?: FetchLike },
): Promise<ArrayBuffer> {
    const existing = getPrimedCompressedPayload(url, { consume: false });
    if (existing) {
        return existing;
    }

    const fetcher = options?.fetcher ?? fetch;

    return setPrimedCompressedPayload(
        url,
        fetcher(url).then(async (response) => response.arrayBuffer()),
    );
}

export async function loadCompressedPayloadBuffer(
    url: string,
    options?: { spanName?: string },
): Promise<ArrayBuffer> {
    const spanName = options?.spanName ?? 'decompress.compressed.fetch';
    const finishFetchSpan = startPerfSpan(spanName, { url });
    try {
        const primed = getPrimedCompressedPayload(url);
        if (primed) {
            incrementPerfCounter('decompress.prime.hit');
            try {
                return cloneArrayBuffer(await primed);
            } catch {
                incrementPerfCounter('decompress.prime.fallback');
            }
        } else {
            incrementPerfCounter('decompress.prime.miss');
        }

        const response = await fetch(url);
        return response.arrayBuffer();
    } finally {
        finishFetchSpan();
    }
}

async function fetchCompressedBytes(
    url: string,
    spanName: string,
): Promise<Uint8Array> {
    return new Uint8Array(await loadCompressedPayloadBuffer(url, { spanName }));
}

async function inflateCompressedBytesOnMainThread(
    compressedBytes: Uint8Array,
    url: string,
): Promise<Uint8Array> {
    const finishInflateSpan = startPerfSpan('decompress.main.inflate', { url });
    try {
        return inflateGzipBytes(compressedBytes);
    } finally {
        finishInflateSpan();
    }
}

export function hasDecompressedPayload(url: string): boolean {
    return decompressedCache.has(url);
}

export function getDecompressedPayloadCacheSize(): number {
    return decompressedCache.size;
}

export function clearDecompressedPayloadCache(): void {
    decompressedCache.clear();
}

// ---------- worker-based decompression ----------
let decompressWorker: Worker | null = null;
let decompressWorkerFailed = false;

function getDecompressWorker(): Worker | null {
    if (decompressWorkerFailed) return null;
    if (decompressWorker) return decompressWorker;
    try {
        decompressWorker = new Worker(
            new URL('../workers/decompressWorker.ts', import.meta.url),
            { type: 'module' },
        );
        incrementPerfCounter('decompress.worker.created');
        return decompressWorker;
    } catch {
        decompressWorkerFailed = true;
        incrementPerfCounter('decompress.worker.unavailable');
        return null;
    }
}

function decompressViaWorker(url: string): Promise<any> {
    const finishSpan = startPerfSpan('decompress.worker.total', { url });
    const worker = getDecompressWorker();
    if (!worker) {
        finishSpan();
        incrementPerfCounter('decompress.worker.fallback', 1, {
            reason: 'worker-unavailable',
        });
        return decompressMainThread(url);
    }
    return new Promise<any>((resolve, reject) => {
        requestWorkerRpc<DecompressUrlRequest, any>(
            worker,
            { url },
            {
                timeoutMs: 45_000,
                operation: 'decompress',
            },
        ).then(resolve).catch(reject);
    })
        .then((result) => {
            incrementPerfCounter('decompress.worker.success');
            return result;
        })
        .catch((error) => {
            // Fallback to main-thread on worker failure.
            console.warn('Decompress worker failed, falling back to main thread', error);
            incrementPerfCounter('decompress.worker.fallback', 1, {
                reason: 'worker-error',
            });
            return decompressMainThread(url);
        })
        .finally(() => {
            finishSpan();
        });
}

async function decompressViaWorkerBytes(url: string): Promise<any> {
    const finishSpan = startPerfSpan('decompress.worker.bytes.total', { url });
    const worker = getDecompressWorker();
    if (!worker) {
        finishSpan();
        incrementPerfCounter('decompress.worker.bytes.fallback', 1, {
            reason: 'worker-unavailable',
        });
        return decompressMainThread(url);
    }

    try {
        const compressedBytes = await fetchCompressedBytes(
            url,
            'decompress.worker.bytes.fetch',
        );
        const finishInflateSpan = startPerfSpan('decompress.worker.bytes.inflate', {
            url,
        });
        const bytes = await requestWorkerRpc<DecompressInflateBytesRequest, Uint8Array>(
            worker,
            {
                mode: 'inflate-bytes',
                compressedBytes: compressedBytes.buffer as ArrayBuffer,
            },
            {
                timeoutMs: 45_000,
                operation: 'decompress-bytes',
                transfer: [compressedBytes.buffer as ArrayBuffer],
            },
        );
        finishInflateSpan();
        const finishUnpackSpan = startPerfSpan('decompress.worker.bytes.unpack', { url });
        const result = extUnpackr.unpack(bytes);
        finishUnpackSpan();
        incrementPerfCounter('decompress.worker.bytes.success');
        return result;
    } catch (error) {
        console.warn('Decompress byte worker failed, falling back to main thread', error);
        incrementPerfCounter('decompress.worker.bytes.fallback', 1, {
            reason: 'worker-error',
        });
        return decompressMainThread(url);
    } finally {
        finishSpan();
    }
}

async function decompressMainThread(url: string): Promise<any> {
    const finishSpan = startPerfSpan('decompress.main.total', { url });
    try {
        const compressedBytes = await fetchCompressedBytes(url, 'decompress.main.fetch');
        const bytes = await inflateCompressedBytesOnMainThread(compressedBytes, url);
        const finishUnpackSpan = startPerfSpan('decompress.main.unpack', { url });
        const result = extUnpackr.unpack(bytes);
        finishUnpackSpan();
        incrementPerfCounter('decompress.main.success');
        return result;
    } finally {
        finishSpan();
    }
}

function decompressByStrategy(
    url: string,
    strategy: DecompressStrategy,
): Promise<any> {
    if (strategy === 'main') {
        incrementPerfCounter('decompress.strategy.main');
        return decompressMainThread(url);
    }

    if (strategy === 'worker-bytes') {
        incrementPerfCounter('decompress.strategy.worker-bytes');
        return decompressViaWorkerBytes(url);
    }

    incrementPerfCounter('decompress.strategy.worker');
    return decompressViaWorker(url);
}

export const decompressBson = async (
    url: string,
    options?: DecompressOptions,
) => {
    const strategy = options?.strategy ?? 'worker';
    const finishSpan = startPerfSpan('decompress.request', {
        url,
        forceRefresh: !!options?.forceRefresh,
        strategy,
    });
    if (options?.forceRefresh) {
        decompressedCache.delete(url);
        incrementPerfCounter('decompress.cache.invalidate');
    }

    const cachedEntry = decompressedCache.get(url);
    if (!cachedEntry) {
        incrementPerfCounter('decompress.cache.miss');
        const entry: DecompressedCacheEntry = {
            promise: Promise.resolve(undefined),
            settled: false,
        };

        entry.promise = decompressByStrategy(url, strategy)
            .catch((error) => {
                // Failed requests should not poison future calls.
                decompressedCache.delete(url);
                throw error;
            })
            .finally(() => {
                entry.settled = true;
                enforceDecompressedCacheLimit();
            });

        decompressedCache.set(url, entry);
        enforceDecompressedCacheLimit();

        return entry.promise.finally(() => {
            finishSpan();
        });
    } else {
        incrementPerfCounter('decompress.cache.hit');
        touchDecompressedCacheEntry(url, cachedEntry);
    }

    return cachedEntry.promise.finally(() => {
        finishSpan();
    });
};