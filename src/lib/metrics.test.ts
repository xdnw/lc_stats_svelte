import { describe, expect, it } from "vitest";
import { isCumulativeMetricName } from "./metrics";

describe("isCumulativeMetricName", () => {
    it("treats namespaced graph metrics as cumulative", () => {
        expect(isCumulativeMetricName("dealt:loss_value")).toBe(true);
        expect(isCumulativeMetricName("loss:loss_value")).toBe(true);
        expect(isCumulativeMetricName("off:wars")).toBe(true);
        expect(isCumulativeMetricName("def:wars_won")).toBe(true);
    });

    it("keeps plain snapshot metrics as non-cumulative", () => {
        expect(isCumulativeMetricName("nation")).toBe(false);
        expect(isCumulativeMetricName("soldier")).toBe(false);
        expect(isCumulativeMetricName("loss_value")).toBe(false);
    });
});
