import { beforeEach, describe, expect, it, vi } from "vitest";

const queueArtifactPrefetch = vi.fn(() => true);
const promotePrefetchTarget = vi.fn();
const createConflictPayloadArtifactDescriptor = vi.fn(() => ({
    key: "payload:conflict:test:v1",
    estimatedBytes: 900_000,
    isFresh: () => false,
    warm: async () => {},
}));
const createConflictGridArtifactDescriptor = vi.fn(() => ({
    key: "conflict-grid:test:v1",
    estimatedBytes: 1_200_000,
    isFresh: () => false,
    warm: async () => {},
}));
const createConflictGraphPayloadArtifactDescriptor = vi.fn(() => ({
    key: "payload:graph:test:v1",
    estimatedBytes: 1_100_000,
    isFresh: () => false,
    warm: async () => {},
}));
const createBubbleDefaultArtifactDescriptor = vi.fn(() => ({
    key: "bubble:default:test:v1",
    estimatedBytes: 420_000,
    isFresh: () => false,
    warm: async () => {},
}));
const createTieringDefaultArtifactDescriptor = vi.fn(() => ({
    key: "tiering:default:test:v1",
    estimatedBytes: 430_000,
    isFresh: () => false,
    warm: async () => {},
}));

vi.mock("./prefetchCoordinator", () => ({
    queueArtifactPrefetch,
    promotePrefetchTarget,
}));

vi.mock("./conflictArtifactRegistry", () => ({
    createConflictPayloadArtifactDescriptor,
    createConflictGridArtifactDescriptor,
    createConflictGraphPayloadArtifactDescriptor,
    createBubbleDefaultArtifactDescriptor,
    createTieringDefaultArtifactDescriptor,
}));

describe("prefetchArtifacts", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        queueArtifactPrefetch.mockReturnValue(true);
    });

    it("warms the bubble route bundle with shared graph dependencies", async () => {
        const prefetchArtifacts = await import("./prefetchArtifacts");

        expect(prefetchArtifacts.warmBubbleRouteArtifacts("123", {
            priority: "high",
            reasonBase: "route-bubble-load",
            routeTarget: "/bubble",
            intentStrength: "load",
        })).toBe(true);

        expect(queueArtifactPrefetch).toHaveBeenCalledTimes(2);
        const bubbleDescriptors = (
            queueArtifactPrefetch.mock.calls as unknown as Array<[Record<string, unknown>]>
        ).map((call) => call[0]);
        expect(bubbleDescriptors).toEqual([
            expect.objectContaining({
                key: "payload:graph:test:v1",
                artifactKind: "payload",
                routeTarget: "/bubble",
                promotionTargets: ["/bubble", "/tiering"],
                reason: "route-bubble-load-graph-payload",
                priority: "high",
                intentStrength: "load",
            }),
            expect.objectContaining({
                key: "bubble:default:test:v1",
                artifactKind: "bubble",
                routeTarget: "/bubble",
                reason: "route-bubble-load-default-trace",
                priority: "high",
                intentStrength: "load",
            }),
        ]);
    });

    it("warms the conflict route bundle through reusable grid bootstrap without aggressive prewarm by default", async () => {
        const prefetchArtifacts = await import("./prefetchArtifacts");

        expect(prefetchArtifacts.warmConflictRouteArtifacts("123", {
            priority: "high",
            reasonBase: "conflict-page-open",
            routeTarget: "/conflict",
            intentStrength: "pointerdown",
            layouts: [2],
        })).toBe(true);

        expect(createConflictGridArtifactDescriptor).toHaveBeenCalledWith({
            conflictId: "123",
            version: expect.anything(),
            layouts: [2],
            aggressive: false,
        });
        expect(queueArtifactPrefetch).toHaveBeenCalledTimes(1);
        expect(queueArtifactPrefetch).toHaveBeenCalledWith(expect.objectContaining({
            key: "conflict-grid:test:v1",
            artifactKind: "conflict-grid",
            routeTarget: "/conflict",
            reason: "conflict-page-open-grid-bootstrap",
            priority: "high",
            intentStrength: "pointerdown",
        }));
    });

    it("warms the tiering route bundle with the shared graph dependency", async () => {
        const prefetchArtifacts = await import("./prefetchArtifacts");

        expect(prefetchArtifacts.warmTieringRouteArtifacts("123", {
            priority: "idle",
            reasonBase: "route-tiering-idle",
            routeTarget: "/tiering",
            intentStrength: "idle",
        })).toBe(true);

        expect(queueArtifactPrefetch).toHaveBeenCalledTimes(2);
        const tieringDescriptors = (
            queueArtifactPrefetch.mock.calls as unknown as Array<[Record<string, unknown>]>
        ).map((call) => call[0]);
        expect(tieringDescriptors).toEqual([
            expect.objectContaining({
                key: "payload:graph:test:v1",
                artifactKind: "payload",
                routeTarget: "/tiering",
                promotionTargets: ["/tiering", "/bubble"],
                reason: "route-tiering-idle-graph-payload",
                priority: "idle",
                intentStrength: "idle",
            }),
            expect.objectContaining({
                key: "tiering:default:test:v1",
                artifactKind: "tiering",
                routeTarget: "/tiering",
                reason: "route-tiering-idle-default-dataset",
                priority: "idle",
                intentStrength: "idle",
            }),
        ]);
    });
});
