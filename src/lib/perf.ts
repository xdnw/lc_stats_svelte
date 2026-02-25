type PerfTags = Record<string, string | number | boolean | null | undefined>;

type PerfEvent = {
    name: string;
    durationMs: number;
    startedAt: number;
    endedAt: number;
    tags?: PerfTags;
};

type PerfCounter = {
    name: string;
    value: number;
    tags?: PerfTags;
};

type PerfState = {
    events: PerfEvent[];
    counters: PerfCounter[];
};

const MAX_EVENTS = 300;
const MAX_COUNTERS = 300;

const perfState: PerfState = {
    events: [],
    counters: [],
};

function trim<T>(arr: T[], max: number): void {
    if (arr.length <= max) return;
    arr.splice(0, arr.length - max);
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function startPerfSpan(name: string, tags?: PerfTags): () => void {
    const startedAt = nowMs();
    return () => {
        const endedAt = nowMs();
        perfState.events.push({
            name,
            durationMs: endedAt - startedAt,
            startedAt,
            endedAt,
            tags,
        });
        trim(perfState.events, MAX_EVENTS);
    };
}

export function incrementPerfCounter(
    name: string,
    delta = 1,
    tags?: PerfTags,
): void {
    perfState.counters.push({
        name,
        value: delta,
        tags,
    });
    trim(perfState.counters, MAX_COUNTERS);
}

export function getPerfSnapshot(): PerfState {
    return {
        events: perfState.events.slice(),
        counters: perfState.counters.slice(),
    };
}

export function clearPerfSnapshot(): void {
    perfState.events = [];
    perfState.counters = [];
}

if (typeof window !== "undefined") {
    (window as any).__lcPerf = {
        snapshot: getPerfSnapshot,
        clear: clearPerfSnapshot,
    };
}
