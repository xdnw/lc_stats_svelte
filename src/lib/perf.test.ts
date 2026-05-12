import { beforeEach, describe, expect, it } from "vitest";

import {
    clearPerfSnapshot,
    getPerfSnapshot,
    measureDetailedSyncTask,
    recordPerfSpan,
    setDetailedPerfEnabled,
    startPerfSpan,
} from "./perf";

describe("perf instrumentation", () => {
    beforeEach(() => {
        setDetailedPerfEnabled(false);
        clearPerfSnapshot();
    });

    it("does not allocate span events when detailed perf is disabled", () => {
        const finish = startPerfSpan("route.normal.disabled");

        finish();

        expect(getPerfSnapshot().events).toEqual([]);
    });

    it("still records explicit spans when detailed perf is disabled", () => {
        recordPerfSpan("route.explicit", 12, { owner: "test" }, 4, 16);

        expect(getPerfSnapshot().events).toEqual([
            {
                name: "route.explicit",
                durationMs: 12,
                startedAt: 4,
                endedAt: 16,
                tags: { owner: "test" },
            },
        ]);
    });

    it("records started spans when detailed perf is enabled", () => {
        setDetailedPerfEnabled(true);

        const finish = startPerfSpan("route.detailed.enabled", { route: "test" });
        finish();

        expect(getPerfSnapshot().events).toEqual([
            expect.objectContaining({
                name: "route.detailed.enabled",
                tags: { route: "test" },
            }),
        ]);
    });

    it("does not resolve measured task tag thunks when detailed perf is disabled", () => {
        let tagBuilds = 0;

        const result = measureDetailedSyncTask(
            "task.disabled",
            () => 42,
            () => {
                tagBuilds += 1;
                return { count: tagBuilds };
            },
        );

        expect(result).toBe(42);
        expect(tagBuilds).toBe(0);
        expect(getPerfSnapshot().events).toEqual([]);
    });

    it("resolves measured task tag thunks when detailed perf is enabled", () => {
        setDetailedPerfEnabled(true);

        measureDetailedSyncTask(
            "task.enabled",
            () => 42,
            () => ({ count: 7 }),
        );

        expect(getPerfSnapshot().events).toEqual([
            expect.objectContaining({
                name: "task.enabled",
                tags: { count: 7 },
            }),
        ]);
    });
});
