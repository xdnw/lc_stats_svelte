import { inflateGzipBytes } from "../lib/compressedBytes";
import { createAppUnpackr } from "../lib/msgpack";
import type { GraphData } from "../lib/types";

const extUnpackr = createAppUnpackr();

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export async function inflateCompressedBytes(
    compressedBytes: ArrayBuffer,
): Promise<Uint8Array> {
    return inflateGzipBytes(compressedBytes);
}

export async function unpackGraphDataFromCompressedBytes(
    compressedBytes: ArrayBuffer,
): Promise<{
    data: GraphData;
    inflateMs: number;
    unpackMs: number;
}> {
    const inflateStart = nowMs();
    const bytes = await inflateCompressedBytes(compressedBytes);
    const unpackStart = nowMs();
    return {
        data: extUnpackr.unpack(bytes) as GraphData,
        inflateMs: unpackStart - inflateStart,
        unpackMs: nowMs() - unpackStart,
    };
}