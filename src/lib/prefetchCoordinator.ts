import { decompressBson } from "./binary";
import { scheduleWhenIdle } from "./misc";
import { incrementPerfCounter } from "./perf";
import { prewarmRuntimeGroup, type RuntimePrefetchGroup } from "./runtime";

type PrefetchPriority = "high" | "idle";

type PrefetchTask = {
    key: string;
    run: (signal: AbortSignal) => Promise<unknown>;
    priority: PrefetchPriority;
};

type NetworkInfo = {
    saveData?: boolean;
    effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
    connection?: NetworkInfo;
    deviceMemory?: number;
};

const queuedByKey = new Map<string, PrefetchTask>();
const queue: PrefetchTask[] = [];
const inFlightByKey = new Map<string, AbortController>();
const completedKeys = new Set<string>();

function getNavigatorInfo(): NavigatorWithConnection | null {
    if (typeof navigator === "undefined") return null;
    return navigator as NavigatorWithConnection;
}

function isConstrainedClient(): boolean {
    const nav = getNavigatorInfo();
    if (!nav) return false;

    if (nav.connection?.saveData) return true;

    const connectionType = nav.connection?.effectiveType ?? "";
    if (
        connectionType === "slow-2g" ||
        connectionType === "2g" ||
        connectionType === "3g"
    ) {
        return true;
    }

    const memory = nav.deviceMemory;
    if (typeof memory === "number" && memory <= 4) {
        return true;
    }

    return false;
}

function getConcurrencyLimit(): number {
    return isConstrainedClient() ? 1 : 2;
}

function processQueue(): void {
    const limit = getConcurrencyLimit();

    while (inFlightByKey.size < limit && queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        queuedByKey.delete(task.key);
        if (completedKeys.has(task.key)) continue;

        const controller = new AbortController();
        inFlightByKey.set(task.key, controller);

        task
            .run(controller.signal)
            .then(() => {
                completedKeys.add(task.key);
                incrementPerfCounter("prefetch.success", 1, {
                    key: task.key,
                    priority: task.priority,
                });
            })
            .catch(() => {
                incrementPerfCounter("prefetch.failed", 1, {
                    key: task.key,
                    priority: task.priority,
                });
            })
            .finally(() => {
                inFlightByKey.delete(task.key);
                processQueue();
            });
    }
}

function scheduleQueueDrain(priority: PrefetchPriority): void {
    if (priority === "high") {
        processQueue();
        return;
    }

    scheduleWhenIdle(() => {
        processQueue();
    }, { timeout: 3500, fallbackDelayMs: 600 });
}

export function canPrefetchCrossRoute(): boolean {
    return !isConstrainedClient();
}

export function queuePrefetch(
    key: string,
    run: (signal: AbortSignal) => Promise<unknown>,
    options?: {
        priority?: PrefetchPriority;
        crossRoute?: boolean;
    },
): boolean {
    const priority = options?.priority ?? "idle";
    const crossRoute = options?.crossRoute ?? true;

    if (crossRoute && !canPrefetchCrossRoute()) {
        incrementPerfCounter("prefetch.skipped", 1, {
            key,
            reason: "constrained-client",
        });
        return false;
    }

    if (completedKeys.has(key) || queuedByKey.has(key) || inFlightByKey.has(key)) {
        incrementPerfCounter("prefetch.skipped", 1, {
            key,
            reason: "already-cached-or-running",
        });
        return false;
    }

    const task: PrefetchTask = {
        key,
        run,
        priority,
    };

    queuedByKey.set(key, task);
    if (priority === "high") {
        queue.unshift(task);
    } else {
        queue.push(task);
    }

    scheduleQueueDrain(priority);
    return true;
}

export function queueUrlPrefetch(
    url: string,
    options?: {
        priority?: PrefetchPriority;
        crossRoute?: boolean;
    },
): boolean {
    return queuePrefetch(
        `decompress:${url}`,
        async () => {
            await decompressBson(url);
        },
        options,
    );
}

export function queueRuntimePrefetch(
    group: RuntimePrefetchGroup,
    options?: {
        priority?: PrefetchPriority;
        crossRoute?: boolean;
    },
): boolean {
    return queuePrefetch(
        `runtime:${group}`,
        async () => {
            await prewarmRuntimeGroup(group);
        },
        options,
    );
}

export function cancelPrefetch(key: string): void {
    const task = queuedByKey.get(key);
    if (task) {
        queuedByKey.delete(key);
        const index = queue.findIndex((item) => item.key === key);
        if (index >= 0) {
            queue.splice(index, 1);
        }
    }

    const controller = inFlightByKey.get(key);
    if (controller) {
        controller.abort();
        inFlightByKey.delete(key);
    }
}

export function resetPrefetchCoordinator(): void {
    for (const controller of inFlightByKey.values()) {
        controller.abort();
    }
    inFlightByKey.clear();
    queuedByKey.clear();
    queue.length = 0;
    completedKeys.clear();
}
