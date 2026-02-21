import { Unpackr } from 'msgpackr';

const extUnpackr = new Unpackr({
    largeBigIntToFloat: true,
    mapsAsObjects: true,
    bundleStrings: true,
    int64AsType: 'number',
});

const decompressedCache = new Map<string, Promise<any>>();

async function streamToUint8Array(readableStream: ReadableStream): Promise<Uint8Array> {
    const reader = readableStream.getReader();
    const chunks: Uint8Array[] = [];
    let result;
    while (!result?.done) {
        result = await reader.read();
        if (!result.done) {
            chunks.push(new Uint8Array(result.value));
        }
    }
    let totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    let resultArray = new Uint8Array(totalLength);
    let offset = 0;
    for (let chunk of chunks) {
        resultArray.set(chunk, offset);
        offset += chunk.length;
    }
    return resultArray;
}

const decompress = async (url: string) => {
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    if (!response.body) {
        throw new Error('Response body is null');
    }
    const streamIn = response.body.pipeThrough(ds);
    return await new Response(streamIn).blob();
};

export const decompressBson = async (
    url: string,
    options?: { forceRefresh?: boolean },
) => {
    if (options?.forceRefresh) {
        decompressedCache.delete(url);
    }

    let cached = decompressedCache.get(url);
    if (!cached) {
        cached = (async () => {
            let result = await decompress(url);
            let stream: ReadableStream<Uint8Array> = result.stream();
            let uint8Array = await streamToUint8Array(stream);
            return extUnpackr.unpack(uint8Array);
        })().catch((error) => {
            // Failed requests should not poison future calls.
            decompressedCache.delete(url);
            throw error;
        });
        decompressedCache.set(url, cached);
    }

    return cached;
};
