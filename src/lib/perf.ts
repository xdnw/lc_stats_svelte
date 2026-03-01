import { nowMs } from "./time";

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
const activeJourneySpans = new Map<string, () => void>();

const perfState: PerfState = {
    events: [],
    counters: [],
};

function trim<T>(arr: T[], max: number): void {
    if (arr.length <= max) return;
    arr.splice(0, arr.length - max);
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

export function beginJourneySpan(
    name: string,
    tags?: Record<string, unknown>,
): void {
    const existing = activeJourneySpans.get(name);
    if (existing) {
        existing();
    }
    activeJourneySpans.set(name, startPerfSpan(name, tags as any));
}

export function endJourneySpan(name: string): void {
    const finish = activeJourneySpans.get(name);
    if (!finish) return;
    activeJourneySpans.delete(name);
    finish();
}

if (typeof window !== "undefined") {
    (window as any).__lcPerf = {
        snapshot: getPerfSnapshot,
        clear: clearPerfSnapshot,
    };
}
