// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openConflictCoalitionModal } from "./conflictCoalitionModal";

describe("conflict coalition modal", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("renders the copy action in the runtime modal header instead of the body", () => {
        openConflictCoalitionModal({
            title: "Coalition alliances",
            alliances: [
                { id: 1, name: "Alpha" },
                { id: 2, name: "Beta" },
            ],
        });

        const headerAction = document.querySelector<HTMLButtonElement>(
            ".ux-runtime-modal-header-actions .ux-runtime-modal-header-action",
        );
        expect(headerAction).not.toBeNull();
        expect(headerAction?.textContent).toContain("Copy IDs");
        expect(headerAction?.querySelector("svg.ux-icon")).not.toBeNull();

        const modalBody = document.querySelector(".ux-runtime-modal .modal-body");
        expect(modalBody?.querySelector(".ux-runtime-modal-header-action")).toBeNull();

        const idField = modalBody?.querySelector("kbd.form-control");
        expect(idField?.textContent).toBe("1,2");
    });

    it("copies the coalition ids when the header action is clicked", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(globalThis.navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });

        openConflictCoalitionModal({
            title: "Coalition alliances",
            alliances: [{ id: 9, name: "Gamma" }],
        });

        document
            .querySelector<HTMLButtonElement>(".ux-runtime-modal-header-action")
            ?.click();

        expect(writeText).toHaveBeenCalledWith("9");
    });
});