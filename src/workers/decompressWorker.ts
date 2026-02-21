import { Unpackr } from 'msgpackr';

const extUnpackr = new Unpackr({
    largeBigIntToFloat: true,
    mapsAsObjects: true,
    bundleStrings: true,
    int64AsType: 'number',
});

export type DecompressRequest = {
    id: number;
    url: string;
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
    const { id, url } = event.data;
    try {
        const ds = new DecompressionStream('gzip');
        const response = await fetch(url);
        if (!response.body) {
            throw new Error('Response body is null');
        }
        const decompressed = response.body.pipeThrough(ds);
        const arrayBuffer = await new Response(decompressed).arrayBuffer();
        const result = extUnpackr.unpack(new Uint8Array(arrayBuffer));
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
