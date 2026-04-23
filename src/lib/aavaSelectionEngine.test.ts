import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildAavaSelectionRowsFromSource,
    createAavaSelectionSource,
    type AavaSelectionSnapshot,
} from "./aavaSelection";
import { createAavaSelectionEngine } from "./aavaSelectionEngine";
import type { Conflict } from "./types";

const requestWorkerRpcMock = vi.hoisted(() => vi.fn());

vi.mock("./workerRpc", () => ({
    requestWorkerRpc: requestWorkerRpcMock,
}));

function createConflict(): Conflict {
    return {
        name: "Test conflict",
        coalitions: [
            {
                name: "Alpha",
                alliance_ids: [101, 102],
                alliance_names: ["Alpha One", "Alpha Two"],
            },
            {
                name: "Beta",
                alliance_ids: [201, 202],
                alliance_names: ["Beta One", "Beta Two"],
            },
        ],
        war_web: {
            headers: ["wars", "damage"],
            data: [
                [
                    [0, 0, 5, 2],
                    [0, 0, 3, 7],
                    [4, 6, 0, 0],
                    [1, 8, 0, 0],
                ],
                [
                    [0, 0, 50, 20],
                    [0, 0, 30, 70],
                    [40, 60, 0, 0],
                    [10, 80, 0, 0],
                ],
            ],
        },
    } as unknown as Conflict;
}

class FakeWorker {
    terminate = vi.fn();
}

const snapshot: AavaSelectionSnapshot = {
    header: "wars",
    primaryIds: [101, 102],
    vsIds: [201, 202],
    primaryCoalitionIndex: 0,
};

describe("createAavaSelectionEngine", () => {
    const originalWorker = globalThis.Worker;

    beforeEach(() => {
        requestWorkerRpcMock.mockReset();
        Object.defineProperty(globalThis, "Worker", {
            configurable: true,
            writable: true,
            value: FakeWorker,
        });
    });

    afterEach(() => {
        if (originalWorker) {
            Object.defineProperty(globalThis, "Worker", {
                configurable: true,
                writable: true,
                value: originalWorker,
            });
            return;
        }

        Reflect.deleteProperty(globalThis, "Worker");
    });

    it("uses the worker for the first uncached build when available", async () => {
        const source = createAavaSelectionSource(createConflict());
        const workerRows = [
            {
                alliance: ["Worker row", 999] as [string, number],
                primary_to_row: 12,
                row_to_primary: 8,
                net: 4,
                total: 20,
                primary_share_pct: 60,
                row_share_pct: 40,
                abs_net: 4,
            },
        ];

        requestWorkerRpcMock.mockImplementation(async (_worker, request) => {
            if (request.action === "init") {
                return { ready: true };
            }

            if (request.action === "buildRows") {
                return workerRows;
            }

            if (request.action === "release") {
                return { released: true };
            }

            throw new Error(`Unexpected action: ${request.action}`);
        });

        const engine = createAavaSelectionEngine({
            dataKey: "test-key",
            source,
        });

        await expect(engine.buildRows(snapshot)).resolves.toEqual(workerRows);
        expect(
            requestWorkerRpcMock.mock.calls.map(([, request]) => request.action),
        ).toEqual(["init", "buildRows"]);

        engine.destroy();
    });

    it("falls back to the local engine when the worker build fails", async () => {
        const source = createAavaSelectionSource(createConflict());
        const expectedRows = buildAavaSelectionRowsFromSource(source, snapshot);

        requestWorkerRpcMock.mockImplementation(async (_worker, request) => {
            if (request.action === "init") {
                return { ready: true };
            }

            if (request.action === "buildRows") {
                const error = new Error("worker build failed") as Error & {
                    kind?: string;
                };
                error.kind = "runtime";
                throw error;
            }

            if (request.action === "release") {
                return { released: true };
            }

            throw new Error(`Unexpected action: ${request.action}`);
        });

        const engine = createAavaSelectionEngine({
            dataKey: "test-key",
            source,
        });

        await expect(engine.buildRows(snapshot)).resolves.toEqual(expectedRows);
        requestWorkerRpcMock.mockClear();
        await expect(engine.buildRows(snapshot)).resolves.toEqual(expectedRows);
        expect(requestWorkerRpcMock).not.toHaveBeenCalled();

        engine.destroy();
    });
});