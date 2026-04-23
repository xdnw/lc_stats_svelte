import { inflateGzipBytes, readResponseBytes } from '../lib/compressedBytes';
import { createAppUnpackr } from '../lib/msgpack';

const extUnpackr = createAppUnpackr();

export type DecompressUrlRequest = {
    id: number;
    url: string;
    mode?: 'value' | 'bytes';
};

export type DecompressInflateBytesRequest = {
    id: number;
    mode: 'inflate-bytes';
    compressedBytes: ArrayBuffer;
};

export type DecompressRequest = DecompressUrlRequest | DecompressInflateBytesRequest;

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
    const { id, mode } = event.data;
    try {
        if (mode === 'inflate-bytes') {
            const bytes = await inflateGzipBytes(
                new Uint8Array(event.data.compressedBytes),
            );
            const successResponse: DecompressSuccessResponse = {
                id,
                ok: true,
                result: bytes,
            };
            const postMessageWithTransfer = (globalThis as unknown as {
                postMessage: (message: unknown, transfer: Transferable[]) => void;
            }).postMessage;
            postMessageWithTransfer(successResponse, [bytes.buffer]);
            return;
        }

        const { url } = event.data;
        const ds = new DecompressionStream('gzip');
        const response = await fetch(url);
        if (!response.body) {
            throw new Error('Response body is null');
        }
        const decompressed = response.body.pipeThrough(ds);
        const bytes = await readResponseBytes(new Response(decompressed));
        if (mode === 'bytes') {
            const successResponse: DecompressSuccessResponse = {
                id,
                ok: true,
                result: bytes,
            };
            const postMessageWithTransfer = (globalThis as unknown as {
                postMessage: (message: unknown, transfer: Transferable[]) => void;
            }).postMessage;
            postMessageWithTransfer(successResponse, [bytes.buffer]);
            return;
        }
        const result = extUnpackr.unpack(bytes);
        const successResponse: DecompressSuccessResponse = { id, ok: true, result };
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