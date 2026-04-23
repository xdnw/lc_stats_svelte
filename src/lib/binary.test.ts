import { Packr } from "msgpackr";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requestWorkerRpc: vi.fn(),
    incrementPerfCounter: vi.fn(),
    startPerfSpan: vi.fn(),
}));

vi.mock("./workerRpc", () => ({
    requestWorkerRpc: mocks.requestWorkerRpc,
}));

vi.mock("./perf", () => ({
    incrementPerfCounter: mocks.incrementPerfCounter,
    startPerfSpan: mocks.startPerfSpan,
}));

class MockWorker {
    terminate(): void {}
}

vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
vi.stubGlobal("fetch", vi.fn());

import {
    clearDecompressedPayloadCache,
    decompressBson,
    getDecompressedPayloadCacheSize,
    hasDecompressedPayload,
} from "./binary";

describe("binary decompressed cache", () => {
    beforeEach(() => {
        clearDecompressedPayloadCache();
        vi.clearAllMocks();
        mocks.startPerfSpan.mockReturnValue(() => {});
        vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
        delete (globalThis as typeof globalThis & {
            __lcPrimedCompressedPayloads?: Record<string, Promise<ArrayBuffer>>;
        }).__lcPrimedCompressedPayloads;
    });

    it("evicts the least recently used settled payload once the cache cap is exceeded", async () => {
        mocks.requestWorkerRpc.mockImplementation(async (_worker, payload: { url: string }) => ({
            url: payload.url,
        }));

        for (let index = 0; index < 48; index += 1) {
            await decompressBson(`https://example.test/${index}`);
        }

        expect(getDecompressedPayloadCacheSize()).toBe(48);
        await decompressBson("https://example.test/0");
        await decompressBson("https://example.test/48");

        expect(getDecompressedPayloadCacheSize()).toBe(48);
        expect(hasDecompressedPayload("https://example.test/0")).toBe(true);
        expect(hasDecompressedPayload("https://example.test/1")).toBe(false);
    });

    it("keeps pending payloads until they settle, then trims back to the cache cap", async () => {
        const resolvers = new Map<string, (value: unknown) => void>();
        mocks.requestWorkerRpc.mockImplementation(
            (_worker, payload: { url: string }) =>
                new Promise((resolve) => {
                    resolvers.set(payload.url, resolve);
                }),
        );

        const pending = Array.from({ length: 49 }, (_value, index) =>
            decompressBson(`https://example.test/pending-${index}`),
        );

        expect(getDecompressedPayloadCacheSize()).toBe(49);

        for (let index = 0; index < 49; index += 1) {
            resolvers.get(`https://example.test/pending-${index}`)?.({ index });
        }
        await Promise.all(pending);

        expect(getDecompressedPayloadCacheSize()).toBe(48);
        expect(hasDecompressedPayload("https://example.test/pending-0")).toBe(false);
    });

    it("can inflate in the worker and unpack on the main thread", async () => {
        const packr = new Packr({
            largeBigIntToFloat: true,
            mapsAsObjects: true,
            bundleStrings: true,
            int64AsType: 'number',
        });
        mocks.requestWorkerRpc.mockImplementation(async () => {
            const packed = packr.pack({ ok: true, mode: "bytes" });
            return packed.slice();
        });

        await expect(
            decompressBson("https://example.test/worker-bytes", {
                strategy: "worker-bytes",
            }),
        ).resolves.toEqual({ ok: true, mode: "bytes" });

        expect(fetch).toHaveBeenCalledWith("https://example.test/worker-bytes");
        expect(mocks.requestWorkerRpc).toHaveBeenCalledWith(
            expect.anything(),
            {
                mode: "inflate-bytes",
                compressedBytes: expect.any(ArrayBuffer),
            },
            expect.objectContaining({
                operation: "decompress-bytes",
                transfer: [expect.any(ArrayBuffer)],
            }),
        );
    });

    it("decodes plain msgpack payloads without bundled strings", async () => {
        const packr = new Packr({
            largeBigIntToFloat: true,
            mapsAsObjects: true,
            useRecords: false,
        });
        mocks.requestWorkerRpc.mockImplementation(async () => {
            const packed = packr.pack({ ok: true, mode: "plain" });
            return packed.slice();
        });

        await expect(
            decompressBson("https://example.test/plain", {
                strategy: "worker-bytes",
            }),
        ).resolves.toEqual({ ok: true, mode: "plain" });
    });

    it("clones shell-primed compressed bytes before transferring them to the worker", async () => {
        const packr = new Packr({
            largeBigIntToFloat: true,
            mapsAsObjects: true,
            bundleStrings: true,
            int64AsType: 'number',
        });
        mocks.requestWorkerRpc.mockImplementation(async () => {
            const packed = packr.pack({ ok: true, source: "primed" });
            return packed.slice();
        });

        const primedBuffer = new Uint8Array([9, 8, 7]).buffer;

        (globalThis as typeof globalThis & {
            __lcPrimedCompressedPayloads?: Record<string, Promise<ArrayBuffer>>;
        }).__lcPrimedCompressedPayloads = {
            "https://example.test/primed": Promise.resolve(
                primedBuffer,
            ),
        };

        await expect(
            decompressBson("https://example.test/primed", {
                strategy: "worker-bytes",
            }),
        ).resolves.toEqual({ ok: true, source: "primed" });

        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.requestWorkerRpc).toHaveBeenCalledTimes(1);
        expect(mocks.requestWorkerRpc.mock.calls[0]?.[1]).toMatchObject({
            mode: "inflate-bytes",
            compressedBytes: expect.any(ArrayBuffer),
        });
        expect(
            (mocks.requestWorkerRpc.mock.calls[0]?.[1] as { compressedBytes: ArrayBuffer })
                .compressedBytes,
        ).not.toBe(primedBuffer);
    });
});
