import { Unpackr } from 'msgpackr';
import { incrementPerfCounter, startPerfSpan } from './perf';
import { requestWorkerRpc } from './workerRpc';
import type {
    DecompressRequest,
} from '../workers/decompressWorker';

const extUnpackr = new Unpackr({
    largeBigIntToFloat: true,
    mapsAsObjects: true,
    bundleStrings: true,
    int64AsType: 'number',
});

const decompressedCache = new Map<string, Promise<any>>();

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
        requestWorkerRpc<DecompressRequest, any>(
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

async function decompressMainThread(url: string): Promise<any> {
    const finishSpan = startPerfSpan('decompress.main.total', { url });
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    if (!response.body) {
        finishSpan();
        throw new Error('Response body is null');
    }
    const decompressed = response.body.pipeThrough(ds);
    const arrayBuffer = await new Response(decompressed).arrayBuffer();
    const result = extUnpackr.unpack(new Uint8Array(arrayBuffer));
    console.log(`Decompression successful for url ${url}`, result);
    finishSpan();
    incrementPerfCounter('decompress.main.success');
    return result;
}

export const decompressBson = async (
    url: string,
    options?: { forceRefresh?: boolean },
) => {
    const finishSpan = startPerfSpan('decompress.request', {
        url,
        forceRefresh: !!options?.forceRefresh,
    });
    if (options?.forceRefresh) {
        decompressedCache.delete(url);
        incrementPerfCounter('decompress.cache.invalidate');
    }

    let cached = decompressedCache.get(url);
    if (!cached) {
        incrementPerfCounter('decompress.cache.miss');
        cached = decompressViaWorker(url).catch((error) => {
            // Failed requests should not poison future calls.
            decompressedCache.delete(url);
            throw error;
        });
        decompressedCache.set(url, cached);
    } else {
        incrementPerfCounter('decompress.cache.hit');
    }

    return cached.finally(() => {
        finishSpan();
    });
};
