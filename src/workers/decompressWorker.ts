import { inflateGzipBytes, readStreamBytes } from '../lib/compressedBytes';
import { createAppUnpackr } from '../lib/msgpack';

const extUnpackr = createAppUnpackr();

export type DecompressUrlRequest = {
    id: number;
    url: string;
    mode?: 'value' | 'bytes';
    detailed?: boolean;
};

export type DecompressInflateBytesRequest = {
    id: number;
    mode: 'inflate-bytes';
    compressedBytes: ArrayBuffer;
    detailed?: boolean;
};

export type DecompressRequest = DecompressUrlRequest | DecompressInflateBytesRequest;

export type DecompressWorkerTimingBreakdown = {
    responseMs?: number;
    readMs?: number;
    inflateMs?: number;
    unpackMs?: number;
    totalMs: number;
};

export type DetailedDecompressWorkerResult<T> = {
    value: T;
    timings: DecompressWorkerTimingBreakdown;
};

export type DecompressSuccessResponse = {
    id: number;
    ok: true;
    result: any;
};

export type DecompressErrorResponse = {
    id: number;
    ok: false;
    error: string;
};

self.onmessage = async (event: MessageEvent<DecompressRequest>) => {
    const { id, mode, detailed } = event.data;
    try {
        if (mode === 'inflate-bytes') {
            const totalStartedAt = performance.now();
            const inflateStartedAt = performance.now();
            const bytes = await inflateGzipBytes(event.data.compressedBytes);
            const timings: DecompressWorkerTimingBreakdown = {
                inflateMs: performance.now() - inflateStartedAt,
                totalMs: performance.now() - totalStartedAt,
            };
            const successResponse: DecompressSuccessResponse = {
                id,
                ok: true,
                result: detailed
                    ? {
                        value: bytes,
                        timings,
                    } satisfies DetailedDecompressWorkerResult<Uint8Array>
                    : bytes,
            };
            const postMessageWithTransfer = (globalThis as unknown as {
                postMessage: (message: unknown, transfer: Transferable[]) => void;
            }).postMessage;
            postMessageWithTransfer(successResponse, [bytes.buffer]);
            return;
        }

        const { url } = event.data;
        const totalStartedAt = performance.now();
        const ds = new DecompressionStream('gzip');
        const responseStartedAt = performance.now();
        const response = await fetch(url);
        const responseMs = performance.now() - responseStartedAt;
        if (!response.body) {
            throw new Error('Response body is null');
        }
        const decompressed = response.body.pipeThrough(ds);
        const readStartedAt = performance.now();
        const bytes = await readStreamBytes(decompressed);
        const readMs = performance.now() - readStartedAt;
        if (mode === 'bytes') {
            const timings: DecompressWorkerTimingBreakdown = {
                responseMs,
                readMs,
                totalMs: performance.now() - totalStartedAt,
            };
            const successResponse: DecompressSuccessResponse = {
                id,
                ok: true,
                result: detailed
                    ? {
                        value: bytes,
                        timings,
                    } satisfies DetailedDecompressWorkerResult<Uint8Array>
                    : bytes,
            };
            const postMessageWithTransfer = (globalThis as unknown as {
                postMessage: (message: unknown, transfer: Transferable[]) => void;
            }).postMessage;
            postMessageWithTransfer(successResponse, [bytes.buffer]);
            return;
        }
        const unpackStartedAt = performance.now();
        const result = extUnpackr.unpack(bytes);
        const timings: DecompressWorkerTimingBreakdown = {
            responseMs,
            readMs,
            unpackMs: performance.now() - unpackStartedAt,
            totalMs: performance.now() - totalStartedAt,
        };
        const successResponse: DecompressSuccessResponse = {
            id,
            ok: true,
            result: detailed
                ? {
                    value: result,
                    timings,
                } satisfies DetailedDecompressWorkerResult<unknown>
                : result,
        };
        self.postMessage(successResponse);
    } catch (error) {
        const errorResponse: DecompressErrorResponse = {
            id,
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown decompression error',
        };
        self.postMessage(errorResponse);
    }
};
