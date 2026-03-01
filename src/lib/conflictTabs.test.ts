import { describe, expect, it } from "vitest";
import {
    buildConflictTabDescriptors,
    buildTabHref,
    resolveActiveTabFromUrl,
    resolveDisabledTabs,
} from "./conflictTabs";

describe("conflictTabs", () => {
    it("resolves active route tab from pathname", () => {
        expect(resolveActiveTabFromUrl(new URL("https://example.com/conflict?id=123&layout=alliance"), "single")).toBe("alliance");
        expect(resolveActiveTabFromUrl(new URL("https://example.com/aava?id=123"), "single")).toBe("aava");
        expect(resolveActiveTabFromUrl(new URL("https://example.com/conflicts/view?ids=10.20&aid=7&layout=nation"), "composite")).toBe("nation");
    });

    it("returns null href when route context is incomplete", () => {
        expect(
            buildTabHref("coalition", {
                routeKind: "single",
                conflictId: null,
                basePath: "/base",
            }),
        ).toBeNull();

        expect(
            buildTabHref("aava", {
                routeKind: "composite",
                compositeIds: ["123"],
                selectedAllianceId: 5,
                basePath: "/base",
            }),
        ).toBeNull();
    });

    it("builds expected hrefs for single and composite contexts", () => {
        expect(
            buildTabHref("nation", {
                routeKind: "single",
                conflictId: "123",
                basePath: "/base",
            }),
        ).toBe("/base/conflict?id=123&layout=nation");

        expect(
            buildTabHref("aava", {
                routeKind: "composite",
                compositeIds: ["11", "22"],
                selectedAllianceId: 9,
                basePath: "/base",
            }),
        ).toBe("/base/aava?ids=11%2C22&aid=9");
    });

    it("centralizes disabled defaults and capability overrides", () => {
        expect(resolveDisabledTabs({}, "composite")).toEqual(["tiering", "bubble", "chord"]);
        expect(resolveDisabledTabs({ aava: false, bubble: true }, "composite")).toEqual([
            "aava",
            "tiering",
            "chord",
        ]);
    });

    it("forces disabled descriptors when href resolution fails", () => {
        const descriptors = buildConflictTabDescriptors({
            activeTab: "coalition",
            routeKind: "single",
            hrefContext: {
                routeKind: "single",
                conflictId: null,
            },
            capabilities: {},
        });

        for (const descriptor of descriptors) {
            expect(descriptor.href).toBeNull();
            expect(descriptor.disabled).toBe(true);
        }
    });
});
