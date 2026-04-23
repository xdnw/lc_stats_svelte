import { decompressBson, hasDecompressedPayload, primeCompressedPayload, type DecompressStrategy } from "./binary";
import { appConfig as config } from "./appConfig";
import { getConflictGraphDataUrl } from "./runtime";
import type { GraphData } from "./types";

type FetchLike = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>;

export function hasConflictGraphPayloadArtifact(options: {
    conflictId: string;
    version?: string | number;
}): boolean {
    return hasDecompressedPayload(
        getConflictGraphDataUrl(options.conflictId, options.version ?? config.version.graph_data),
    );
}

export async function loadConflictGraphPayload(options: {
    conflictId: string;
    version?: string | number;
    decompressStrategy?: DecompressStrategy;
}): Promise<GraphData> {
    return decompressBson(
        getConflictGraphDataUrl(options.conflictId, options.version ?? config.version.graph_data),
        {
            strategy: options.decompressStrategy,
        },
    ) as Promise<GraphData>;
}

export function primeConflictGraphPayloadBytes(options: {
    conflictId: string;
    version?: string | number;
    fetcher?: FetchLike;
}): Promise<ArrayBuffer> {
    return primeCompressedPayload(
        getConflictGraphDataUrl(
            options.conflictId,
            options.version ?? config.version.graph_data,
        ),
        {
            fetcher: options.fetcher,
        },
    );
}