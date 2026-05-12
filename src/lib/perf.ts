import { nowMs } from "./time";

type PerfTags = Record<string, string | number | boolean | null | undefined>;
type PerfTagsInput = PerfTags | (() => PerfTags);

type DetailedPerfOptions = {
    thresholdMs?: number;
    longTaskThresholdMs?: number;
};

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
const DETAILED_PERF_STORAGE_KEY = "lc.perf.mode";
const DETAILED_PERF_QUERY_KEYS = ["perf", "lcPerf"];
const DETAILED_PERF_VALUES = new Set(["detail", "detailed", "longtask", "longtasks"]);
const DEFAULT_LONG_TASK_THRESHOLD_MS = 50;

const perfState: PerfState = {
    events: [],
    counters: [],
};

let detailedPerfEnabled = false;
let longTaskObserver: PerformanceObserver | null = null;
const finishNoopPerfSpan = (): void => {};

function trim<T>(arr: T[], max: number): void {
    if (arr.length <= max) return;
    arr.splice(0, arr.length - max);
}

function readDetailedPerfStorageMode(): string {
    if (typeof window === "undefined") return "";
    try {
        return window.localStorage.getItem(DETAILED_PERF_STORAGE_KEY)?.trim().toLowerCase() ?? "";
    } catch {
        return "";
    }
}

function resolveDetailedPerfEnabled(): boolean {
    if (typeof window === "undefined") return false;

    const globalMode = `${(window as any).__lcPerfMode ?? ""}`.trim().toLowerCase();
    if (DETAILED_PERF_VALUES.has(globalMode)) {
        return true;
    }

    try {
        const params = new URLSearchParams(window.location.search);
        for (const key of DETAILED_PERF_QUERY_KEYS) {
            const value = params.get(key)?.trim().toLowerCase();
            if (value && DETAILED_PERF_VALUES.has(value)) {
                return true;
            }
        }
    } catch {
        // Ignore URL parsing issues.
    }

    return DETAILED_PERF_VALUES.has(readDetailedPerfStorageMode());
}

function buildLongTaskTags(entry: PerformanceEntry): PerfTags {
    const attribution = ((entry as PerformanceEntry & {
        attribution?: Array<Record<string, unknown>>;
    }).attribution ?? [])[0] ?? null;

    return {
        entryName: entry.name,
        sourceName: typeof attribution?.name === "string" ? attribution.name : null,
        scriptUrl: typeof attribution?.scriptUrl === "string" ? attribution.scriptUrl : null,
        containerType: typeof attribution?.containerType === "string"
            ? attribution.containerType
            : null,
        containerName: typeof attribution?.containerName === "string"
            ? attribution.containerName
            : null,
        containerId: typeof attribution?.containerId === "string" ? attribution.containerId : null,
    };
}

function stopLongTaskObserver(): void {
    if (!longTaskObserver) return;
    longTaskObserver.disconnect();
    longTaskObserver = null;
}

function ensureLongTaskObserver(): void {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
    if (longTaskObserver || !detailedPerfEnabled) return;

    try {
        longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const tags = buildLongTaskTags(entry);
                recordPerfSpan(
                    "main.longtask.browser",
                    entry.duration,
                    tags,
                    entry.startTime,
                    entry.startTime + entry.duration,
                );
                incrementPerfCounter("main.longtask.browser.count", 1, tags);
            }
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
        stopLongTaskObserver();
    }
}

function maybeRecordLongTaskCandidate(
    name: string,
    durationMs: number,
    tags?: PerfTags,
    thresholdMs: number = DEFAULT_LONG_TASK_THRESHOLD_MS,
): void {
    if (durationMs < thresholdMs) return;
    incrementPerfCounter("task.long.candidate", 1, {
        owner: name,
        durationMs: Math.round(durationMs * 10) / 10,
        thresholdMs,
        ...(tags ?? {}),
    });
}

function resolvePerfTags(tags?: PerfTagsInput): PerfTags | undefined {
    return typeof tags === "function" ? tags() : tags;
}

export function isDetailedPerfEnabled(): boolean {
    return detailedPerfEnabled;
}

export function setDetailedPerfEnabled(enabled: boolean): void {
    detailedPerfEnabled = enabled;
    if (detailedPerfEnabled) {
        ensureLongTaskObserver();
        return;
    }
    stopLongTaskObserver();
}

export function measureDetailedSyncTask<T>(
    name: string,
    work: () => T,
    tags?: PerfTagsInput,
    options?: DetailedPerfOptions,
): T {
    if (!detailedPerfEnabled) {
        return work();
    }

    const startedAt = nowMs();
    const resolvedTags = resolvePerfTags(tags);
    try {
        return work();
    } finally {
        const durationMs = nowMs() - startedAt;
        const thresholdMs = Math.max(0, options?.thresholdMs ?? 0);
        if (durationMs >= thresholdMs) {
            recordPerfSpan(name, durationMs, resolvedTags, startedAt, startedAt + durationMs);
        }
        maybeRecordLongTaskCandidate(
            name,
            durationMs,
            resolvedTags,
            options?.longTaskThresholdMs ?? DEFAULT_LONG_TASK_THRESHOLD_MS,
        );
    }
}

export async function measureDetailedAsyncTask<T>(
    name: string,
    work: () => Promise<T>,
    tags?: PerfTagsInput,
    options?: DetailedPerfOptions,
): Promise<T> {
    if (!detailedPerfEnabled) {
        return work();
    }

    const startedAt = nowMs();
    const resolvedTags = resolvePerfTags(tags);
    try {
        return await work();
    } finally {
        const durationMs = nowMs() - startedAt;
        const thresholdMs = Math.max(0, options?.thresholdMs ?? 0);
        if (durationMs >= thresholdMs) {
            recordPerfSpan(name, durationMs, resolvedTags, startedAt, startedAt + durationMs);
        }
        maybeRecordLongTaskCandidate(
            name,
            durationMs,
            resolvedTags,
            options?.longTaskThresholdMs ?? DEFAULT_LONG_TASK_THRESHOLD_MS,
        );
    }
}

export function startPerfSpan(name: string, tags?: PerfTags): () => void {
    if (!detailedPerfEnabled) {
        return finishNoopPerfSpan;
    }

    const startedAt = nowMs();
    return () => {
        recordPerfSpan(name, nowMs() - startedAt, tags, startedAt);
    };
}

export function recordPerfSpan(
    name: string,
    durationMs: number,
    tags?: PerfTags,
    startedAtOverride?: number,
    endedAtOverride?: number,
): void {
    const endedAt = endedAtOverride ?? nowMs();
    const safeDurationMs = Math.max(0, durationMs);
    const startedAt = startedAtOverride ?? (endedAt - safeDurationMs);
    perfState.events.push({
        name,
        durationMs: safeDurationMs,
        startedAt,
        endedAt,
        tags,
    });
    trim(perfState.events, MAX_EVENTS);

    if (
        detailedPerfEnabled &&
        !name.startsWith("main.longtask.") &&
        !name.startsWith("task.long.")
    ) {
        maybeRecordLongTaskCandidate(name, safeDurationMs, tags);
    }
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

export function ensureJourneySpan(
    name: string,
    tags?: Record<string, unknown>,
): void {
    if (activeJourneySpans.has(name)) return;
    activeJourneySpans.set(name, startPerfSpan(name, tags as any));
}

export function endJourneySpan(name: string): void {
    const finish = activeJourneySpans.get(name);
    if (!finish) return;
    activeJourneySpans.delete(name);
    finish();
}

if (typeof window !== "undefined") {
    setDetailedPerfEnabled(resolveDetailedPerfEnabled());
    (window as any).__lcPerf = {
        snapshot: getPerfSnapshot,
        clear: clearPerfSnapshot,
        enableDetailed() {
            setDetailedPerfEnabled(true);
        },
        disableDetailed() {
            setDetailedPerfEnabled(false);
        },
        isDetailedEnabled: isDetailedPerfEnabled,
    };
}
