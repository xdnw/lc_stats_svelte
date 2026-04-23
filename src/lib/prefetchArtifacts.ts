import { decompressBson } from "./binary";
import { getConflictsIndexUrl } from "./runtime";
import { queueArtifactPrefetch, promotePrefetchTarget, type ArtifactPrefetchTaskDescriptor, type PrefetchPriority } from "./prefetchCoordinator";
import { appConfig as config } from "./appConfig";
import type { DecompressStrategy } from "./binary";
import {
    createBubbleDefaultArtifactDescriptor,
    createConflictGraphPayloadArtifactDescriptor,
    createConflictGridArtifactDescriptor,
    createConflictPayloadArtifactDescriptor,
    createTieringDefaultArtifactDescriptor,
} from "./conflictArtifactRegistry";
import { acquireMetricTimeArtifactHandle } from "./metricTimeArtifactRegistry";
import { buildConflictArtifactRegistryKey } from "./conflictArtifactKeys";
import { loadConflictGraphPayload } from "./conflictGraphPayload";
import { loadConflictContext } from "./conflictContext";
import { getCompositeConflictSignature } from "./conflictIds";
import {
    hasCompositeContextCacheEntry,
    makeCompositeContextCacheKey,
} from "./compositeContextCache";
import { incrementPerfCounter } from "./perf";
import type { ConflictRouteContext } from "./routeBootstrap";
import { type ConflictGridLayoutValue } from "./conflictGrid/rowIds";

const MAX_COMPOSITE_WARM_COUNT = 8;
const COMPOSITE_WARM_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timeout);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

function enqueueArtifact(task: ArtifactPrefetchTaskDescriptor): boolean {
    return queueArtifactPrefetch(task);
}

type RouteArtifactWarmOptions = {
    priority?: PrefetchPriority;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    reasonBase?: string;
    contextKey?: string;
    requestId?: number;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
};

function buildWarmReason(
    reasonBase: string | undefined,
    suffix: string,
    fallback: string,
): string {
    const trimmed = reasonBase?.trim();
    if (!trimmed) return fallback;
    return `${trimmed}-${suffix}`;
}

function buildPromotionTargets(
    primaryTarget: string,
    additionalTargets: string[] = [],
): string[] {
    return Array.from(new Set([primaryTarget, ...additionalTargets]));
}

export function promoteArtifactTarget(routeTarget: string): void {
    promotePrefetchTarget(routeTarget, "pointerdown");
}

export function warmConflictsIndexPayload(options?: {
    priority?: PrefetchPriority;
    reason?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const version = config.version.conflicts;
    const url = getConflictsIndexUrl(version);
    return enqueueArtifact({
        key: `payload:conflicts-index:v${String(version)}`,
        artifactKind: "payload",
        reason: options?.reason ?? "route-home-idle",
        routeTarget: "/conflicts",
        intentStrength: options?.intentStrength ?? "idle",
        priority: options?.priority ?? "idle",
        estimatedBytes: 550_000,
        estimatedCpuMs: 40,
        run: async () => {
            await decompressBson(url);
        },
    });
}

export function warmConflictPayload(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const descriptor = createConflictPayloadArtifactDescriptor({
        conflictId,
        version: config.version.conflict_data,
    });

    return enqueueArtifact({
        key: descriptor.key,
        artifactKind: "payload",
        routeTarget: options?.routeTarget ?? "/conflict",
        reason: options?.reason ?? "route-intent",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: descriptor.estimatedBytes,
        estimatedCpuMs: 80,
        isFresh: descriptor.isFresh,
        run: async () => {
            await descriptor.warm();
        },
    });
}

export function warmConflictTableArtifact(conflictId: string, options?: {
    version?: string | number;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const version = options?.version ?? config.version.conflict_data;
    const descriptor = createConflictGridArtifactDescriptor({
        conflictId,
        version,
        layouts: options?.layouts,
        aggressive: options?.aggressive,
    });

    return enqueueArtifact({
        key: descriptor.key,
        artifactKind: "conflict-grid",
        routeTarget: options?.routeTarget ?? "/conflict",
        reason: options?.reason ?? "route-intent-conflict-grid",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: descriptor.estimatedBytes,
        estimatedCpuMs: 140 + (options?.layouts?.length ?? 1) * 60 + ((options?.aggressive ?? false) ? 120 : 0),
        isFresh: descriptor.isFresh,
        run: async () => {
            await descriptor.warm();
        },
    });
}

export function warmConflictRouteArtifacts(
    conflictId: string,
    options?: RouteArtifactWarmOptions,
): boolean {
    return warmConflictTableArtifact(conflictId, {
        layouts: options?.layouts,
        aggressive: options?.aggressive ?? false,
        priority: options?.priority,
        routeTarget: options?.routeTarget ?? "/conflict",
        intentStrength: options?.intentStrength,
        reason: buildWarmReason(
            options?.reasonBase,
            "grid-bootstrap",
            "route-intent-conflict-grid",
        ),
    });
}

export function warmConflictGraphPayload(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    promotionTargets?: string[];
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    decompressStrategy?: DecompressStrategy;
}): boolean {
    const descriptor = createConflictGraphPayloadArtifactDescriptor({
        conflictId,
        version: config.version.graph_data,
    });

    return enqueueArtifact({
        key: descriptor.key,
        artifactKind: "payload",
        routeTarget: options?.routeTarget ?? "/bubble",
        promotionTargets: buildPromotionTargets(
            options?.routeTarget ?? "/bubble",
            options?.promotionTargets ?? ["/bubble", "/tiering"],
        ),
        reason: options?.reason ?? "route-intent-graph",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: descriptor.estimatedBytes,
        estimatedCpuMs: 90,
        isFresh: descriptor.isFresh,
        run: async () => {
            await loadConflictGraphPayload({
                conflictId,
                version: config.version.graph_data,
                decompressStrategy: options?.decompressStrategy,
            });
        },
    });
}

export function warmBubbleDefaultArtifact(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    contextKey?: string;
    requestId?: number;
}): boolean {
    const descriptor = createBubbleDefaultArtifactDescriptor({
        conflictId,
        version: config.version.graph_data,
        contextKey: options?.contextKey,
        requestId: options?.requestId,
    });

    return enqueueArtifact({
        key: descriptor.key,
        artifactKind: "bubble",
        routeTarget: options?.routeTarget ?? "/bubble",
        reason: options?.reason ?? "route-intent-bubble-default",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "idle",
        estimatedBytes: descriptor.estimatedBytes,
        estimatedCpuMs: 350,
        isFresh: descriptor.isFresh,
        run: async () => {
            await descriptor.warm();
            incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                artifact: "bubble",
                routeTarget: options?.routeTarget ?? "/bubble",
            });
        },
    });
}

export function warmTieringDefaultArtifact(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    contextKey?: string;
    requestId?: number;
}): boolean {
    const descriptor = createTieringDefaultArtifactDescriptor({
        conflictId,
        version: config.version.graph_data,
        contextKey: options?.contextKey,
        requestId: options?.requestId,
    });

    return enqueueArtifact({
        key: descriptor.key,
        artifactKind: "tiering",
        routeTarget: options?.routeTarget ?? "/tiering",
        reason: options?.reason ?? "route-intent-tiering-default",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "idle",
        estimatedBytes: descriptor.estimatedBytes,
        estimatedCpuMs: 360,
        isFresh: descriptor.isFresh,
        run: async () => {
            await descriptor.warm();
            incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                artifact: "tiering",
                routeTarget: options?.routeTarget ?? "/tiering",
            });
        },
    });
}

export function warmMetricTimeDefaultArtifact(conflictId: string, options?: {
    aggregationMode?: "alliance" | "coalition";
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    contextKey?: string;
    requestId?: number;
}): boolean {
    const version = config.version.graph_data;
    const graphDescriptor = createConflictGraphPayloadArtifactDescriptor({
        conflictId,
        version,
    });
    const aggregationMode = options?.aggregationMode ?? "alliance";

    return enqueueArtifact({
        key: `metric-time:default:${buildConflictArtifactRegistryKey({ kind: "conflict", id: conflictId }, version)}:agg:${aggregationMode}`,
        artifactKind: "metric-time",
        routeTarget: options?.routeTarget ?? "/metric-time",
        reason: options?.reason ?? "route-intent-metric-time-default-series",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "idle",
        estimatedBytes: graphDescriptor.estimatedBytes,
        estimatedCpuMs: 360,
        run: async () => {
            const handle = acquireMetricTimeArtifactHandle({
                conflictId,
                version,
            });
            try {
                await handle.warmDefaultSeries({
                    aggregationMode,
                    contextKey: options?.contextKey,
                    requestId: options?.requestId,
                });
                incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                    artifact: "metric-time",
                    routeTarget: options?.routeTarget ?? "/metric-time",
                });
            } finally {
                handle.destroy();
            }
        },
    });
}

export function warmCompositeContextArtifact(options: {
    ids: string[];
    aid: number;
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const ids = options.ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .slice(0, MAX_COMPOSITE_WARM_COUNT);

    if (ids.length < 2) return false;

    const signature = getCompositeConflictSignature(ids);
    const cacheKey = makeCompositeContextCacheKey(
        signature,
        options.aid,
        config.version.conflict_data,
    );

    return enqueueArtifact({
        key: `composite:${signature}:aid:${options.aid}:v${String(config.version.conflict_data)}`,
        artifactKind: "composite",
        routeTarget: options.routeTarget ?? "/conflicts/view",
        reason: options.reason ?? "route-composite-resolve",
        intentStrength: options.intentStrength ?? "load",
        priority: options.priority ?? "high",
        estimatedBytes: ids.length * 900_000,
        estimatedCpuMs: 550,
        isFresh: () => hasCompositeContextCacheEntry(cacheKey),
        run: async () => {
            const context: ConflictRouteContext = {
                mode: "composite",
                conflictId: null,
                conflictSignature: signature,
                compositeIds: ids,
                selectedAllianceId: options.aid,
            };

            await withTimeout(
                loadConflictContext(context, config.version.conflict_data),
                COMPOSITE_WARM_TIMEOUT_MS,
            );
        },
    });
}

export function warmBubbleRouteArtifacts(
    conflictId: string,
    options?: RouteArtifactWarmOptions,
): boolean {
    const routeTarget = options?.routeTarget ?? "/bubble";
    const graphQueued = warmConflictGraphPayload(conflictId, {
        priority: options?.priority,
        routeTarget,
        promotionTargets: ["/bubble", "/tiering"],
        intentStrength: options?.intentStrength,
        reason: buildWarmReason(
            options?.reasonBase,
            "graph-payload",
            "route-intent-bubble-graph-payload",
        ),
    });
    const bubbleQueued = warmBubbleDefaultArtifact(conflictId, {
        priority: options?.priority,
        routeTarget,
        intentStrength: options?.intentStrength,
        contextKey: options?.contextKey,
        requestId: options?.requestId,
        reason: buildWarmReason(
            options?.reasonBase,
            "default-trace",
            "route-intent-bubble-default-trace",
        ),
    });

    return graphQueued || bubbleQueued;
}

export function warmTieringRouteArtifacts(
    conflictId: string,
    options?: RouteArtifactWarmOptions,
): boolean {
    const routeTarget = options?.routeTarget ?? "/tiering";
    const graphQueued = warmConflictGraphPayload(conflictId, {
        priority: options?.priority,
        routeTarget,
        promotionTargets: ["/bubble", "/tiering"],
        intentStrength: options?.intentStrength,
        reason: buildWarmReason(
            options?.reasonBase,
            "graph-payload",
            "route-intent-tiering-graph-payload",
        ),
    });
    const tieringQueued = warmTieringDefaultArtifact(conflictId, {
        priority: options?.priority,
        routeTarget,
        intentStrength: options?.intentStrength,
        contextKey: options?.contextKey,
        requestId: options?.requestId,
        reason: buildWarmReason(
            options?.reasonBase,
            "default-dataset",
            "route-intent-tiering-default-dataset",
        ),
    });

    return graphQueued || tieringQueued;
}

export function warmMetricTimeRouteArtifacts(
    conflictId: string,
    options?: RouteArtifactWarmOptions,
): boolean {
    const routeTarget = options?.routeTarget ?? "/metric-time";
    const graphQueued = warmConflictGraphPayload(conflictId, {
        priority: options?.priority,
        routeTarget,
        promotionTargets: ["/bubble", "/tiering", "/metric-time"],
        intentStrength: options?.intentStrength,
        reason: buildWarmReason(
            options?.reasonBase,
            "graph-payload",
            "route-intent-metric-time-graph-payload",
        ),
    });
    const metricTimeQueued = warmMetricTimeDefaultArtifact(conflictId, {
        priority: options?.priority,
        routeTarget,
        intentStrength: options?.intentStrength,
        contextKey: options?.contextKey,
        requestId: options?.requestId,
        reason: buildWarmReason(
            options?.reasonBase,
            "default-series",
            "route-intent-metric-time-default-series",
        ),
    });

    return graphQueued || metricTimeQueued;
}
