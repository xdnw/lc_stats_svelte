import { afterEach, describe, expect, it, vi } from "vitest";
import {
    promotePrefetchTarget,
    queueArtifactPrefetch,
    resetPrefetchCoordinator,
} from "./prefetchCoordinator";

function flushPrefetchTurn(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

afterEach(() => {
    resetPrefetchCoordinator();
});

describe("prefetchCoordinator", () => {
    it("skips enqueueing a task when another code path already made the artifact fresh", async () => {
        let fresh = true;
        const run = vi.fn(async () => {});

        const descriptor = {
            key: "bubble:default:test:v1",
            artifactKind: "bubble" as const,
            priority: "high" as const,
            routeTarget: "/bubble",
            reason: "test-bubble-default",
            intentStrength: "load" as const,
            isFresh: () => fresh,
            run: async () => {
                await run();
            },
        };

        expect(queueArtifactPrefetch(descriptor)).toBe(false);
        await flushPrefetchTurn();
        expect(run).toHaveBeenCalledTimes(0);

        fresh = false;
        expect(queueArtifactPrefetch(descriptor)).toBe(true);
        await flushPrefetchTurn();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("requeues a completed task once its artifact is no longer fresh", async () => {
        let fresh = false;
        const run = vi.fn(async () => {
            fresh = true;
        });

        const descriptor = {
            key: "tiering:default:test:v1",
            artifactKind: "tiering" as const,
            priority: "high" as const,
            routeTarget: "/tiering",
            reason: "test-tiering-default",
            intentStrength: "load" as const,
            isFresh: () => fresh,
            run: async () => {
                await run();
            },
        };

        expect(queueArtifactPrefetch(descriptor)).toBe(true);
        await flushPrefetchTurn();
        expect(run).toHaveBeenCalledTimes(1);

        expect(queueArtifactPrefetch(descriptor)).toBe(false);
        await flushPrefetchTurn();
        expect(run).toHaveBeenCalledTimes(1);

        fresh = false;
        expect(queueArtifactPrefetch(descriptor)).toBe(true);
        await flushPrefetchTurn();
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("promotes a shared queued task from any matching target", () => {
        const globalWithWindow = globalThis as typeof globalThis & { window?: Window };
        const originalWindow = globalWithWindow.window;
        const windowStub = {
            addEventListener: vi.fn(),
            setTimeout,
        } as unknown as Window;
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: windowStub,
        });

        try {
            const run = vi.fn(async () => {});

            const descriptor = {
                key: "payload:graph:test:v1",
                artifactKind: "payload" as const,
                priority: "idle" as const,
                routeTarget: "/bubble",
                promotionTargets: ["/bubble", "/tiering"],
                reason: "test-shared-graph",
                intentStrength: "hover" as const,
                run: async () => {
                    await run();
                },
            };

            expect(queueArtifactPrefetch(descriptor)).toBe(true);
            expect(run).toHaveBeenCalledTimes(0);

            promotePrefetchTarget("/tiering");

            expect(run).toHaveBeenCalledTimes(1);
        } finally {
            if (originalWindow === undefined) {
                Reflect.deleteProperty(globalThis, "window");
            } else {
                Object.defineProperty(globalThis, "window", {
                    configurable: true,
                    value: originalWindow,
                });
            }
        }
    });
});
