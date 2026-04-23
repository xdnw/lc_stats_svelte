import { decompressBson } from "./binary";
import { scheduleWhenIdle } from "./misc";
import { incrementPerfCounter } from "./perf";
import { nowMs } from "./time";

type PrefetchPriority = "high" | "idle";

export type ArtifactPrefetchIntentStrength =
    | "idle"
    | "hover"
    | "focus"
    | "pointerdown"
    | "enter"
    | "load";

export type ArtifactPrefetchKind =
    | "payload"
    | "conflict-grid"
    | "bubble"
    | "metric-time"
    | "tiering"
    | "composite";

export type ArtifactPrefetchTaskDescriptor = {
    key: string;
    artifactKind: ArtifactPrefetchKind;
    run: (signal: AbortSignal) => Promise<unknown>;
    isFresh?: () => boolean;
    priority?: PrefetchPriority;
    crossRoute?: boolean;
    routeTarget?: string;
    promotionTargets?: string[];
    reason?: string;
    intentStrength?: ArtifactPrefetchIntentStrength;
    estimatedBytes?: number;
    estimatedCpuMs?: number;
    allowOnConstrainedClient?: boolean;
};

type PrefetchTask = {
    key: string;
    artifactKind: ArtifactPrefetchKind;
    run: (signal: AbortSignal) => Promise<unknown>;
    isFresh?: () => boolean;
    priority: PrefetchPriority;
    crossRoute: boolean;
    routeTarget: string;
    promotionTargets: string[];
    reason: string;
    intentStrength: ArtifactPrefetchIntentStrength;
    estimatedBytes: number;
    estimatedCpuMs: number;
    allowOnConstrainedClient: boolean;
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
const inFlightByTaskKey = new Map<string, PrefetchTask>();
const completedKeys = new Set<string>();
const policyBlockedIdleExpensiveKeys = new Set<string>();
const policyAllowedIdleCheapKeys = new Set<string>();

let lastInteractionAt = 0;
let lastLongTaskAt = 0;
let interactionHooksInstalled = false;

function shouldTreatAsInteractionWindow(): boolean {
    const current = nowMs();
    return current - lastInteractionAt <= 2_500;
}

function isTabHidden(): boolean {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "hidden";
}

function hasRecentLongTask(): boolean {
    const current = nowMs();
    return current - lastLongTaskAt <= 4_000;
}

function installCoordinatorHeuristics(): void {
    if (interactionHooksInstalled || typeof window === "undefined") return;
    interactionHooksInstalled = true;

    const markInteraction = () => {
        lastInteractionAt = nowMs();
    };

    window.addEventListener("pointerdown", markInteraction, {
        passive: true,
        capture: true,
    });
    window.addEventListener("keydown", markInteraction, {
        passive: true,
        capture: true,
    });

    if (typeof PerformanceObserver !== "undefined") {
        try {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) {
                    lastLongTaskAt = nowMs();
                }
            });
            observer.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
        } catch {
            // Ignore unsupported long-task observer environments.
        }
    }
}

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

function getCpuBudgetMs(task: PrefetchTask): number {
    if (task.priority === "high") return 1_000;
    if (isConstrainedClient()) return 220;
    if (isTabHidden()) return 140;
    if (hasRecentLongTask()) return 200;
    if (shouldTreatAsInteractionWindow()) return 260;
    return 540;
}

function getBandwidthBudgetBytes(task: PrefetchTask): number {
    if (task.priority === "high") return 4_000_000;
    if (isConstrainedClient()) return 700_000;
    if (isTabHidden()) return 480_000;
    return 1_900_000;
}

function hasExpensiveDerivedReason(reason: string): boolean {
    const normalized = reason.toLowerCase();
    return (
        normalized.includes("bubble-default") ||
        normalized.includes("metric-time-default") ||
        normalized.includes("tiering-default") ||
        normalized.includes("warmbubbledefaultartifact") ||
        normalized.includes("warmmetrictimedefaultartifact") ||
        normalized.includes("warmtieringdefaultartifact")
    );
}

function isExpensiveDerived(task: PrefetchTask): boolean {
    if (
        task.artifactKind === "bubble" ||
        task.artifactKind === "metric-time" ||
        task.artifactKind === "tiering"
    ) {
        return true;
    }
    return hasExpensiveDerivedReason(task.reason);
}

function isCheapIdleEligible(task: PrefetchTask): boolean {
    const isCheapKind =
        task.artifactKind === "payload" ||
        task.artifactKind === "composite";
    return isCheapKind && !hasExpensiveDerivedReason(task.reason);
}

function currentInFlightCpuMs(): number {
    let total = 0;
    for (const task of inFlightByTaskKey.values()) {
        total += task.estimatedCpuMs;
    }
    return total;
}

function currentInFlightBytes(): number {
    let total = 0;
    for (const task of inFlightByTaskKey.values()) {
        total += task.estimatedBytes;
    }
    return total;
}

function isTaskFresh(task: Pick<PrefetchTask, "isFresh">): boolean {
    if (!task.isFresh) return true;

    try {
        return task.isFresh();
    } catch {
        return false;
    }
}

function hasFreshnessCheck(task: Pick<PrefetchTask, "isFresh">): boolean {
    return typeof task.isFresh === "function";
}

function canAdmitTask(task: PrefetchTask): boolean {
    if (task.priority === "idle" && isExpensiveDerived(task)) {
        if (!policyBlockedIdleExpensiveKeys.has(task.key)) {
            policyBlockedIdleExpensiveKeys.add(task.key);
            incrementPerfCounter("prefetch.policy.blocked-idle-expensive", 1, {
                key: `${task.artifactKind}:${task.routeTarget}`,
                kind: task.artifactKind,
                routeTarget: task.routeTarget,
            });
        }
        return false;
    }

    if (task.priority === "high") return true;

    const cpuLimit = getCpuBudgetMs(task);
    const bytesLimit = getBandwidthBudgetBytes(task);
    const cpuAfterStart = currentInFlightCpuMs() + task.estimatedCpuMs;
    const bytesAfterStart = currentInFlightBytes() + task.estimatedBytes;
    return cpuAfterStart <= cpuLimit && bytesAfterStart <= bytesLimit;
}

function getNextAdmissibleTaskIndex(): number {
    const nextHighIndex = queue.findIndex(
        (candidate) => candidate.priority === "high" && canAdmitTask(candidate),
    );
    if (nextHighIndex >= 0) {
        return nextHighIndex;
    }

    const nextIdleCheapIndex = queue.findIndex(
        (candidate) =>
            candidate.priority === "idle" &&
            isCheapIdleEligible(candidate) &&
            canAdmitTask(candidate),
    );
    if (nextIdleCheapIndex >= 0) {
        return nextIdleCheapIndex;
    }

    return queue.findIndex(
        (candidate) => candidate.priority === "idle" && canAdmitTask(candidate),
    );
}

function keyPriorityWeight(priority: PrefetchPriority): number {
    return priority === "high" ? 2 : 1;
}

function normalizePromotionTargets(
    routeTarget: string | undefined,
    promotionTargets: string[] | undefined,
): string[] {
    const targets = [routeTarget, ...(promotionTargets ?? [])].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
    );

    if (targets.length === 0) {
        return ["unknown"];
    }

    return Array.from(new Set(targets));
}

function mergePromotionTargets(task: PrefetchTask, nextTargets: string[]): void {
    if (nextTargets.length === 0) return;
    task.promotionTargets = Array.from(
        new Set([...task.promotionTargets, ...nextTargets]),
    );
}

function intentWeight(intent: ArtifactPrefetchIntentStrength): number {
    switch (intent) {
        case "pointerdown":
        case "enter":
            return 5;
        case "focus":
            return 4;
        case "hover":
            return 3;
        case "load":
            return 2;
        default:
            return 1;
    }
}

function processQueue(): void {
    installCoordinatorHeuristics();
    const limit = getConcurrencyLimit();

    while (inFlightByKey.size < limit && queue.length > 0) {
        const taskIndex = getNextAdmissibleTaskIndex();
        if (taskIndex < 0) {
            return;
        }
        const [task] = queue.splice(taskIndex, 1);
        if (!task) break;
        queuedByKey.delete(task.key);
        if (hasFreshnessCheck(task) && isTaskFresh(task)) {
            completedKeys.add(task.key);
            continue;
        }
        if (completedKeys.has(task.key)) {
            if (isTaskFresh(task)) continue;
            completedKeys.delete(task.key);
        }

        if (task.priority === "idle" && isCheapIdleEligible(task)) {
            if (!policyAllowedIdleCheapKeys.has(task.key)) {
                policyAllowedIdleCheapKeys.add(task.key);
                incrementPerfCounter("prefetch.policy.allowed-idle-cheap", 1, {
                    key: `${task.artifactKind}:${task.routeTarget}`,
                    kind: task.artifactKind,
                    routeTarget: task.routeTarget,
                });
            }
        }

        const controller = new AbortController();
        inFlightByKey.set(task.key, controller);
        inFlightByTaskKey.set(task.key, task);

        task
            .run(controller.signal)
            .then(() => {
                completedKeys.add(task.key);
                incrementPerfCounter("prefetch.success", 1, {
                    key: `${task.artifactKind}:${task.routeTarget}`,
                    kind: task.artifactKind,
                    priority: task.priority,
                    reason: task.reason,
                    routeTarget: task.routeTarget,
                });
            })
            .catch(() => {
                incrementPerfCounter("prefetch.failed", 1, {
                    key: `${task.artifactKind}:${task.routeTarget}`,
                    kind: task.artifactKind,
                    priority: task.priority,
                    reason: task.reason,
                    routeTarget: task.routeTarget,
                });
            })
            .finally(() => {
                inFlightByKey.delete(task.key);
                inFlightByTaskKey.delete(task.key);
                processQueue();
            });
    }
}

function scheduleQueueDrain(priority: PrefetchPriority): void {
    if (priority === "high") {
        processQueue();
        return;
    }

    const useAggressiveIdleWindow =
        !isConstrainedClient() &&
        !isTabHidden() &&
        queue.some((task) => task.priority === "idle" && isCheapIdleEligible(task));

    scheduleWhenIdle(() => {
        processQueue();
    }, useAggressiveIdleWindow
        ? { timeout: 1_800, fallbackDelayMs: 220 }
        : { timeout: 3500, fallbackDelayMs: 600 });
}

export function canPrefetchCrossRoute(): boolean {
    return !isConstrainedClient();
}

function shouldSkipTask(task: PrefetchTask): string | null {
    if (task.crossRoute && !canPrefetchCrossRoute()) {
        if (!task.allowOnConstrainedClient) {
            return "constrained-client";
        }
    }
    if (hasFreshnessCheck(task) && isTaskFresh(task)) {
        return "already-fresh";
    }
    if (completedKeys.has(task.key)) {
        if (isTaskFresh(task)) {
            return "already-cached-or-running";
        }
        completedKeys.delete(task.key);
    }
    if (queuedByKey.has(task.key) || inFlightByKey.has(task.key)) {
        return "already-cached-or-running";
    }
    return null;
}

function toTask(descriptor: ArtifactPrefetchTaskDescriptor): PrefetchTask {
    const promotionTargets = normalizePromotionTargets(
        descriptor.routeTarget,
        descriptor.promotionTargets,
    );

    return {
        key: descriptor.key,
        artifactKind: descriptor.artifactKind,
        run: descriptor.run,
        isFresh: descriptor.isFresh,
        priority: descriptor.priority ?? "idle",
        crossRoute: descriptor.crossRoute ?? true,
        routeTarget: promotionTargets[0] ?? "unknown",
        promotionTargets,
        reason: descriptor.reason ?? "unspecified",
        intentStrength: descriptor.intentStrength ?? "idle",
        estimatedBytes: Math.max(0, descriptor.estimatedBytes ?? 0),
        estimatedCpuMs: Math.max(0, descriptor.estimatedCpuMs ?? 0),
        allowOnConstrainedClient: descriptor.allowOnConstrainedClient ?? false,
    };
}

function enqueueTask(task: PrefetchTask): boolean {
    const skipReason = shouldSkipTask(task);
    if (skipReason) {
        if (skipReason === "already-cached-or-running") {
            const existing = queuedByKey.get(task.key) ?? inFlightByTaskKey.get(task.key);
            if (existing) {
                mergePromotionTargets(existing, task.promotionTargets);
            }
        }
        incrementPerfCounter("prefetch.skipped", 1, {
            key: `${task.artifactKind}:${task.routeTarget}`,
            kind: task.artifactKind,
            reason: skipReason,
            routeTarget: task.routeTarget,
        });
        return false;
    }

    queuedByKey.set(task.key, task);
    if (task.priority === "high") {
        queue.unshift(task);
    } else {
        queue.push(task);
    }

    scheduleQueueDrain(task.priority);
    return true;
}

function promotePendingForTarget(
    routeTarget: string,
    nextIntent: ArtifactPrefetchIntentStrength,
): void {
    const intentRank = intentWeight(nextIntent);
    let hasPromotion = false;

    for (const task of queue) {
        if (!task.promotionTargets.includes(routeTarget)) continue;

        const shouldPromoteIntent = intentRank > intentWeight(task.intentStrength);
        if (shouldPromoteIntent) {
            task.intentStrength = nextIntent;
        }

        if (keyPriorityWeight(task.priority) < keyPriorityWeight("high")) {
            task.priority = "high";
            hasPromotion = true;
        } else if (shouldPromoteIntent) {
            hasPromotion = true;
        }
    }

    if (!hasPromotion) return;

    queue.sort((left, right) => {
        const priorityDiff = keyPriorityWeight(right.priority) - keyPriorityWeight(left.priority);
        if (priorityDiff !== 0) return priorityDiff;
        const intentDiff = intentWeight(right.intentStrength) - intentWeight(left.intentStrength);
        if (intentDiff !== 0) return intentDiff;
        return 0;
    });

    scheduleQueueDrain("high");
}

export function queueArtifactPrefetch(descriptor: ArtifactPrefetchTaskDescriptor): boolean {
    const task = toTask(descriptor);

    if (
        task.routeTarget !== "unknown" &&
        (
            task.priority === "high" ||
            task.intentStrength === "pointerdown" ||
            task.intentStrength === "enter"
        )
    ) {
        promotePendingForTarget(task.routeTarget, task.intentStrength);
    }

    return enqueueTask(task);
}

export function promotePrefetchTarget(
    routeTarget: string,
    intentStrength: ArtifactPrefetchIntentStrength = "pointerdown",
): void {
    promotePendingForTarget(routeTarget, intentStrength);
}

export function queuePrefetch(
    key: string,
    run: (signal: AbortSignal) => Promise<unknown>,
    options?: {
        priority?: PrefetchPriority;
        crossRoute?: boolean;
    },
): boolean {
    return queueArtifactPrefetch({
        key,
        artifactKind: "payload",
        run,
        priority: options?.priority,
        crossRoute: options?.crossRoute,
        reason: "legacy-queuePrefetch",
        routeTarget: "legacy",
        intentStrength: "idle",
    });
}

export function queueUrlPrefetch(
    url: string,
    options?: {
        priority?: PrefetchPriority;
        crossRoute?: boolean;
    },
): boolean {
    return queueArtifactPrefetch({
        key: `decompress:${url}`,
        artifactKind: "payload",
        priority: options?.priority,
        crossRoute: options?.crossRoute,
        routeTarget: "payload",
        reason: "legacy-queueUrlPrefetch",
        intentStrength: "idle",
        estimatedBytes: 512_000,
        estimatedCpuMs: 60,
        run: async () => {
            await decompressBson(url);
        },
    });
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

    policyBlockedIdleExpensiveKeys.delete(key);
    policyAllowedIdleCheapKeys.delete(key);
}

export function resetPrefetchCoordinator(): void {
    for (const controller of inFlightByKey.values()) {
        controller.abort();
    }
    inFlightByKey.clear();
    inFlightByTaskKey.clear();
    queuedByKey.clear();
    queue.length = 0;
    completedKeys.clear();
    policyBlockedIdleExpensiveKeys.clear();
    policyAllowedIdleCheapKeys.clear();
}

export type { PrefetchPriority };
