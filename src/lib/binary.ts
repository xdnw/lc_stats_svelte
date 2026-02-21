import { Unpackr } from 'msgpackr';
import type {
    DecompressRequest,
    DecompressSuccessResponse,
    DecompressErrorResponse,
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
let workerRequestId = 0;

function getDecompressWorker(): Worker | null {
    if (decompressWorkerFailed) return null;
    if (decompressWorker) return decompressWorker;
    try {
        decompressWorker = new Worker(
            new URL('../workers/decompressWorker.ts', import.meta.url),
            { type: 'module' },
        );
        return decompressWorker;
    } catch {
        decompressWorkerFailed = true;
        return null;
    }
}

function decompressViaWorker(url: string): Promise<any> {
    const worker = getDecompressWorker();
    if (!worker) {
        return decompressMainThread(url);
    }
    return new Promise<any>((resolve, reject) => {
        const requestId = ++workerRequestId;
        const onMessage = (event: MessageEvent<DecompressSuccessResponse | DecompressErrorResponse>) => {
            const response = event.data;
            if (!response || response.id !== requestId) return;
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            if (response.ok) {
                resolve(response.result);
            } else {
                reject(new Error(response.error));
            }
        };
        const onError = (event: ErrorEvent) => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            reject(event.error ?? new Error(event.message));
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError, { once: true });
        const payload: DecompressRequest = { id: requestId, url };
        worker.postMessage(payload);
    }).catch((error) => {
        // Fallback to main-thread on worker failure.
        console.warn('Decompress worker failed, falling back to main thread', error);
        return decompressMainThread(url);
    });
}

async function decompressMainThread(url: string): Promise<any> {
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    if (!response.body) {
        throw new Error('Response body is null');
    }
    const decompressed = response.body.pipeThrough(ds);
    const arrayBuffer = await new Response(decompressed).arrayBuffer();
    return extUnpackr.unpack(new Uint8Array(arrayBuffer));
}

export const decompressBson = async (
    url: string,
    options?: { forceRefresh?: boolean },
) => {
    if (options?.forceRefresh) {
        decompressedCache.delete(url);
    }

    let cached = decompressedCache.get(url);
    if (!cached) {
        cached = decompressViaWorker(url).catch((error) => {
            // Failed requests should not poison future calls.
            decompressedCache.delete(url);
            throw error;
        });
        decompressedCache.set(url, cached);
    }

    return cached;
};
