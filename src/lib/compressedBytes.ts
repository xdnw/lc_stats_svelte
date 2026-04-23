type ResponseWithBytes = Response & {
    bytes?: () => Promise<Uint8Array>;
};

export async function readResponseBytes(response: Response): Promise<Uint8Array> {
    const responseWithBytes = response as ResponseWithBytes;
    if (typeof responseWithBytes.bytes === "function") {
        return responseWithBytes.bytes();
    }

    return new Uint8Array(await response.arrayBuffer());
}

export function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = bytes.buffer;
    if (
        buffer instanceof ArrayBuffer &&
        bytes.byteOffset === 0 &&
        bytes.byteLength === buffer.byteLength
    ) {
        return buffer;
    }

    return Uint8Array.from(bytes).buffer;
}

export async function inflateGzipBytes(
    compressedBytes: Uint8Array | ArrayBuffer,
): Promise<Uint8Array> {
    const ds = new DecompressionStream("gzip");
    const responseBody = compressedBytes instanceof Uint8Array
        ? toOwnedArrayBuffer(compressedBytes)
        : compressedBytes;
    const compressedResponse = new Response(responseBody);
    if (!compressedResponse.body) {
        throw new Error("Response body is null");
    }

    const decompressed = compressedResponse.body.pipeThrough(ds);
    return readResponseBytes(new Response(decompressed));
}