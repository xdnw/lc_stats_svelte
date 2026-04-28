import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebBulkQuery, WebGraph, WebTable } from "./apitypes";
import { EndpointClient } from "./BulkQuery";
import { WARCOSTSBYDAY, WARSBETWEEN } from "./endpoints";

describe("EndpointClient", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("uses the configured api origin for direct endpoint calls", async () => {
        const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
            async () =>
                new Response(JSON.stringify({ cells: [["ok"]] } satisfies WebTable), {
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = new EndpointClient({
            baseUrl: "https://api.example.test/api/",
            fetchFn: fetchFn as unknown as typeof fetch,
        });

        await client.call(
            WARSBETWEEN,
            {
                sideA: "Rose",
                sideB: "Eclipse",
                columns: ["war_id"],
                startTime: "7d",
            },
            { useBatch: false, cacheTtlMs: false },
        );

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn.mock.calls.at(0)?.[0]).toBe(
            "https://api.example.test/api/warsBetween?sideA=Rose&sideB=Eclipse&columns=war_id&startTime=7d",
        );
        expect(fetchFn.mock.calls.at(0)?.[1]?.credentials).toBe("include");
    });

    it("batches compatible endpoint requests through the query endpoint", async () => {
        const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                expect(String(input)).toBe("https://api.example.test/api/query");
                expect(init?.credentials).toBe("include");

                const body = new URLSearchParams(init?.body as string);
                const queries = JSON.parse(body.get("queries") ?? "[]") as [string, Record<string, unknown>][];

                expect(queries).toEqual([
                    ["warCostsByDay", { coalition1: "Rose", coalition2: "Eclipse", time_start: "30d", type: "COST" }],
                    ["warsBetween", { sideA: "Rose", sideB: "Eclipse", columns: ["war_id"] }],
                ]);

                return new Response(
                    JSON.stringify({
                        results: [
                            {
                                title: "Costs",
                                x: "day",
                                y: "value",
                                labels: ["day 1"],
                                data: [[1]],
                            } satisfies WebGraph,
                            {
                                cells: [[123]],
                            } satisfies WebTable,
                        ],
                    } satisfies WebBulkQuery),
                    {
                        headers: { "content-type": "application/json" },
                    },
                );
            },
        );

        const client = new EndpointClient({
            baseUrl: "https://api.example.test/api",
            fetchFn: fetchFn as unknown as typeof fetch,
            batchWindowMs: 0,
        });

        const [graph, table] = await Promise.all([
            client.call(
                WARCOSTSBYDAY,
                {
                    coalition1: "Rose",
                    coalition2: "Eclipse",
                    time_start: "30d",
                    type: "COST",
                },
                { cacheTtlMs: false },
            ),
            client.call(
                WARSBETWEEN,
                {
                    sideA: "Rose",
                    sideB: "Eclipse",
                    columns: ["war_id"],
                },
                { cacheTtlMs: false },
            ),
        ]);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(graph.title).toBe("Costs");
        expect(table.cells).toEqual([[123]]);
    });

    it("dedupes identical in-flight requests and reuses short-lived cache entries", async () => {
        const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
            async () =>
                new Response(
                    JSON.stringify({
                        title: "Costs",
                        x: "day",
                        y: "value",
                        labels: ["day 1"],
                        data: [[1]],
                    } satisfies WebGraph),
                    {
                        headers: { "content-type": "application/json" },
                    },
                ),
        );

        const client = new EndpointClient({
            baseUrl: "https://api.example.test/api",
            fetchFn: fetchFn as unknown as typeof fetch,
            batchWindowMs: 0,
        });

        const params = {
            coalition1: "Rose",
            coalition2: "Eclipse",
            time_start: "30d",
            type: "COST",
        };

        const [first, second] = await Promise.all([
            client.call(WARCOSTSBYDAY, params, { useBatch: false }),
            client.call(WARCOSTSBYDAY, params, { useBatch: false }),
        ]);

        expect(first).toEqual(second);
        expect(fetchFn).toHaveBeenCalledTimes(1);

        await client.call(WARCOSTSBYDAY, params, { useBatch: false });

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("falls back to a direct request when a signal is provided", async () => {
        const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
            async () =>
                new Response(JSON.stringify({ cells: [["ok"]] } satisfies WebTable), {
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = new EndpointClient({
            baseUrl: "https://api.example.test/api",
            fetchFn: fetchFn as unknown as typeof fetch,
            batchWindowMs: 0,
        });
        const controller = new AbortController();

        await client.call(
            WARSBETWEEN,
            {
                sideA: "Rose",
                sideB: "Eclipse",
                columns: ["war_id"],
            },
            { signal: controller.signal, cacheTtlMs: false },
        );

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn.mock.calls.at(0)?.[0]).toBe(
            "https://api.example.test/api/warsBetween?sideA=Rose&sideB=Eclipse&columns=war_id",
        );
        expect(fetchFn.mock.calls.at(0)?.[1]?.signal).toBe(controller.signal);
    });

    it("does not dedupe requests that carry abort signals", async () => {
        const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
            async () =>
                new Response(JSON.stringify({ cells: [["ok"]] } satisfies WebTable), {
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = new EndpointClient({
            baseUrl: "https://api.example.test/api",
            fetchFn: fetchFn as unknown as typeof fetch,
        });

        await Promise.all([
            client.call(
                WARSBETWEEN,
                {
                    sideA: "Rose",
                    sideB: "Eclipse",
                    columns: ["war_id"],
                },
                { signal: new AbortController().signal, cacheTtlMs: false },
            ),
            client.call(
                WARSBETWEEN,
                {
                    sideA: "Rose",
                    sideB: "Eclipse",
                    columns: ["war_id"],
                },
                { signal: new AbortController().signal, cacheTtlMs: false },
            ),
        ]);

        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});