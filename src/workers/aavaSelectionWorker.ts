import {
    buildAavaSelectionRowsFromSource,
    type AavaSelectionSource,
} from "../lib/aavaSelection";
import type {
    AavaSelectionWorkerRequest,
} from "../lib/aavaSelectionEngine";

type WorkerSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerFailure = {
    id: number;
    ok: false;
    error: string;
    kind?: "runtime";
};

const sourceCache = new Map<string, AavaSelectionSource>();

async function handleRequest(request: AavaSelectionWorkerRequest): Promise<unknown> {
    switch (request.action) {
        case "init": {
            sourceCache.set(request.dataKey, request.source);
            return { ready: true };
        }
        case "buildRows": {
            const source = sourceCache.get(request.dataKey);
            if (!source) {
                throw new Error(`AAvA selection source ${request.dataKey} is not initialized.`);
            }
            return buildAavaSelectionRowsFromSource(source, request.snapshot);
        }
        case "release": {
            return { released: sourceCache.delete(request.dataKey) };
        }
    }
}

self.onmessage = async (event: MessageEvent<AavaSelectionWorkerRequest>) => {
    const request = event.data;
    try {
        const result = await handleRequest(request);
        const response: WorkerSuccess<unknown> = {
            id: request.id,
            ok: true,
            result,
        };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerFailure = {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : "AAvA selection worker failed",
            kind: "runtime",
        };
        self.postMessage(response);
    }
};
