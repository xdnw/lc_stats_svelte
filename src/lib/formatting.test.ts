import { describe, expect, it } from "vitest";
import {
    clearFormattingCaches,
    commafy,
    formatDaysToDate,
    formatTurnsToDate,
} from "./formatting";

describe("formatting", () => {
    it("formats turn and day values with stable cached date labels", () => {
        clearFormattingCaches();

        expect(formatTurnsToDate(0)).toBe("1970-01-01");
        expect(formatTurnsToDate(6)).toBe("1970-01-01 12:00");
        expect(formatDaysToDate(2)).toBe("1970-01-03");
        expect(formatTurnsToDate(6)).toBe("1970-01-01 12:00");
    });

    it("groups finite decimal values without changing the fractional text", () => {
        clearFormattingCaches();

        expect(commafy(0)).toBe("0");
        expect(commafy(123)).toBe("123");
        expect(commafy(1234)).toBe("1,234");
        expect(commafy(-1234567)).toBe("-1,234,567");
        expect(commafy(1234567.8912)).toBe("1,234,567.8912");
        expect(commafy(1234567.8912)).toBe("1,234,567.8912");
    });

    it("preserves legacy output for unusual numeric forms", () => {
        expect(commafy(Number.POSITIVE_INFINITY)).toBe("In,fin,ity");
        expect(commafy(Number.NEGATIVE_INFINITY)).toBe("-In,fin,ity");
        expect(commafy(Number.NaN)).toBe("NaN");
        expect(commafy(1e21)).toBe("1e,+21");
    });
});
