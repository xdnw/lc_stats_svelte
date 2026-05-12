import { describe, expect, it, vi } from "vitest";

import { requestWorkerRpc } from "./workerRpc";

type Listener = EventListenerOrEventListenerObject;

class MockWorker extends EventTarget {
    readonly messages: unknown[] = [];
    readonly transfers: Transferable[][] = [];
    readonly listeners = new Map<string, Set<Listener>>();

    addEventListener(
        type: string,
        callback: Listener | null,
        options?: AddEventListenerOptions | boolean,
    ): void {
        if (callback) {
            let listenersForType = this.listeners.get(type);
            if (!listenersForType) {
                listenersForType = new Set();
                this.listeners.set(type, listenersForType);
            }
            listenersForType.add(callback);
        }
        super.addEventListener(type, callback, options);
    }

    removeEventListener(
        type: string,
        callback: Listener | null,
        options?: EventListenerOptions | boolean,
    ): void {
        if (callback) {
            this.listeners.get(type)?.delete(callback);
        }
        super.removeEventListener(type, callback, options);
    }

    postMessage(message: unknown, transfer?: Transferable[]): void {
        this.messages.push(message);
        this.transfers.push(transfer ?? []);
    }

    listenerCount(type: string): number {
        return this.listeners.get(type)?.size ?? 0;
    }

    respond(data: unknown): void {
        this.dispatchEvent(new MessageEvent("message", { data }));
    }
}

describe("requestWorkerRpc", () => {
    it("uses one message listener to route concurrent responses by id", async () => {
        const worker = new MockWorker();

        const first = requestWorkerRpc<{ id: number; action: string }, string>(
            worker as unknown as Worker,
            { action: "first" },
        );
        const second = requestWorkerRpc<{ id: number; action: string }, string>(
            worker as unknown as Worker,
            { action: "second" },
        );

        expect(worker.listenerCount("message")).toBe(1);
        expect(worker.messages).toEqual([
            { id: 1, action: "first" },
            { id: 2, action: "second" },
        ]);

        worker.respond({ id: 2, ok: true, result: "two" });
        await expect(second).resolves.toBe("two");
        expect(worker.listenerCount("message")).toBe(1);

        worker.respond({ id: 1, ok: true, result: "one" });
        await expect(first).resolves.toBe("one");
    });

    it("cleans up pending requests on timeout", async () => {
        vi.useFakeTimers();
        const worker = new MockWorker();

        const result = requestWorkerRpc<{ id: number; action: string }, string>(
            worker as unknown as Worker,
            { action: "slow" },
            { timeoutMs: 5, operation: "slow op" },
        );

        vi.advanceTimersByTime(5);

        await expect(result).rejects.toMatchObject({
            message: "slow op timed out after 5ms",
            kind: "transport",
        });
        expect(worker.listenerCount("error")).toBe(0);
        vi.useRealTimers();
    });

    it("passes transfer lists through to postMessage", async () => {
        const worker = new MockWorker();
        const buffer = new ArrayBuffer(1);

        const result = requestWorkerRpc<{ id: number; action: string }, string>(
            worker as unknown as Worker,
            { action: "transfer" },
            { transfer: [buffer] },
        );

        expect(worker.transfers).toEqual([[buffer]]);
        worker.respond({ id: 1, ok: true, result: "done" });
        await expect(result).resolves.toBe("done");
    });
});
