import { buildAavaSnapshotKey } from "./cacheKeys";
import {
    buildAavaSelectionRowsFromSource,
    type AavaSelectionRow,
    type AavaSelectionSnapshot,
    type AavaSelectionSource,
} from "./aavaSelection";
import { measureDetailedSyncTask } from "./perf";

const LOCAL_AAVA_SELECTION_CACHE_MAX_ENTRIES = 16;

export type AavaSelectionBuildRequest = {
    id: number;
    action: "buildRows";
    dataKey: string;
    snapshot: AavaSelectionSnapshot;
};

export type AavaSelectionInitRequest = {
    id: number;
    action: "init";
    dataKey: string;
    source: AavaSelectionSource;
};

export type AavaSelectionReleaseRequest = {
    id: number;
    action: "release";
    dataKey: string;
};

export type AavaSelectionWorkerRequest =
    | AavaSelectionInitRequest
    | AavaSelectionBuildRequest
    | AavaSelectionReleaseRequest;

export type AavaSelectionEngine = {
    peekRows: (snapshot: AavaSelectionSnapshot) => AavaSelectionRow[] | null;
    buildRows: (snapshot: AavaSelectionSnapshot) => Promise<AavaSelectionRow[]>;
    destroy: () => void;
};

function createLocalAavaSelectionEngine(source: AavaSelectionSource): AavaSelectionEngine {
    const cache = new Map<string, AavaSelectionRow[]>();

    const touchCachedRows = (
        cacheKey: string,
        rows: AavaSelectionRow[],
    ): AavaSelectionRow[] => {
        cache.delete(cacheKey);
        cache.set(cacheKey, rows);
        return rows;
    };

    const setCachedRows = (cacheKey: string, rows: AavaSelectionRow[]): void => {
        cache.set(cacheKey, rows);
        while (cache.size > LOCAL_AAVA_SELECTION_CACHE_MAX_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey == null) break;
            cache.delete(oldestKey);
        }
    };

    return {
        peekRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            return cache.get(cacheKey) ?? null;
        },
        async buildRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            const cached = cache.get(cacheKey);
            if (cached) return touchCachedRows(cacheKey, cached);
            const rows = measureDetailedSyncTask(
                "main.graph.aava.rows.local",
                () => buildAavaSelectionRowsFromSource(source, snapshot),
                {
                    header: snapshot.header,
                    primaryCount: snapshot.primaryIds.length,
                    vsCount: snapshot.vsIds.length,
                    primaryCoalitionIndex: snapshot.primaryCoalitionIndex === 1 ? 1 : 0,
                },
                { thresholdMs: 1 },
            );
            setCachedRows(cacheKey, rows);
            return rows;
        },
        destroy() {
            cache.clear();
        },
    };
}

export function createAavaSelectionEngine(options: {
    dataKey: string;
    source: AavaSelectionSource;
}): AavaSelectionEngine {
    void options.dataKey;
    return createLocalAavaSelectionEngine(options.source);
}
