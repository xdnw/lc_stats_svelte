type ResponseWithBytes = Response & {
    bytes?: () => Promise<Uint8Array>;
};

const responseBytes = typeof Response !== "undefined"
    ? (Response.prototype as ResponseWithBytes).bytes
    : undefined;

export async function readResponseBytes(response: Response): Promise<Uint8Array> {
    if (typeof responseBytes === "function") {
        return responseBytes.call(response);
    }

    return new Uint8Array(await response.arrayBuffer());
}

export async function readStreamBytes(
    stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;
            chunks.push(value);
            totalLength += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }

    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return chunks[0];

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
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
    const decompressed = new Blob([responseBody]).stream().pipeThrough(ds);
    return readStreamBytes(decompressed);
}
