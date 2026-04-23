import { describe, expect, it } from "vitest";
import {
    resolveInitialAllowedAllianceIds,
    resolveMetricTimeAllowedAllianceIds,
} from "./graphRouteInfo";

const routeInfoFixture = {
    coalitions: [
        { alliance_ids: [101, 102] },
        { alliance_ids: [201, 202] },
    ],
};

describe("graph route selection resolvers", () => {
    it("keeps strict multi-coalition selections for shared graph routes", () => {
        expect(
            Array.from(
                resolveInitialAllowedAllianceIds(routeInfoFixture, [101, 201]),
            ),
        ).toEqual([101, 201]);

        expect(
            Array.from(
                resolveInitialAllowedAllianceIds(routeInfoFixture, [101]),
            ),
        ).toEqual([101, 102, 201, 202]);
    });

    it("allows metric-time selections that leave one coalition empty", () => {
        expect(
            Array.from(
                resolveMetricTimeAllowedAllianceIds(routeInfoFixture, [101]),
            ),
        ).toEqual([101]);
    });

    it("falls back to the default metric-time selection when nothing valid remains", () => {
        expect(
            Array.from(
                resolveMetricTimeAllowedAllianceIds(routeInfoFixture, []),
            ),
        ).toEqual([101, 102, 201, 202]);

        expect(
            Array.from(
                resolveMetricTimeAllowedAllianceIds(routeInfoFixture, [999]),
            ),
        ).toEqual([101, 102, 201, 202]);
    });
});
