import { describe, expect, it } from "vitest";
import { Palette, darkenColor, generateColors, generateColorsFromPalettes } from "./colors";

describe("colors", () => {
    it("darkens rgb colors by the requested percentage", () => {
        expect(darkenColor("rgb(120, 160, 200)", 25)).toBe("rgb(90, 120, 150)");
    });

    it("generates deterministic palette colors without D3", () => {
        expect(generateColors(4, Palette.REDS)).toEqual([
            "rgb(128, 0, 0)",
            "rgb(210, 124, 58)",
            "rgb(248, 187, 167)",
            "rgb(255, 63, 161)",
        ]);
    });

    it("reuses per-palette color sequences in source order", () => {
        const redColors = generateColors(2, Palette.REDS);
        const blueColors = generateColors(3, Palette.BLUES);

        expect(
            generateColorsFromPalettes([
                Palette.REDS,
                Palette.BLUES,
                Palette.REDS,
                Palette.BLUES,
                Palette.BLUES,
            ]),
        ).toEqual([
            redColors[0],
            blueColors[0],
            redColors[1],
            blueColors[1],
            blueColors[2],
        ]);
    });
});
