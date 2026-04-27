// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { openConflictTargetFinderModal } from "./conflictTargetFinderModal";

const SAMPLE_COALITIONS = (): Parameters<typeof openConflictTargetFinderModal>[0]["coalitions"] => [
    {
        label: "C1",
        name: "Alpha",
        alliances: [
            { id: 1, name: "Alliance One" },
            { id: 2, name: "Alliance Two" },
        ],
    },
    {
        label: "C2",
        name: "Beta",
        alliances: [
            { id: 9, name: "Alliance Nine" },
            { id: 10, name: "Alliance Ten" },
        ],
    },
];

function openSampleModal(
    overrides: Partial<Parameters<typeof openConflictTargetFinderModal>[0]> = {},
): void {
    openConflictTargetFinderModal({
        title: "Find Targets",
        coalitions: SAMPLE_COALITIONS(),
        ...overrides,
    });
}

describe("conflict target finder modal", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens Locutus links for the default side and shows alliance names instead of raw ids", () => {
        openSampleModal();

        const warLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='war']",
        );
        const raidLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='raid']",
        );

        expect(warLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/war?selector=AA:9,AA:10&allies=AA:1,AA:2",
        );
        expect(raidLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/raid?selector=AA:9,AA:10",
        );

        const allianceNames = Array.from(
            document.querySelectorAll<HTMLElement>(
                ".ux-target-finder-alliance-name",
            ),
        ).map((node) => node.textContent);
        expect(allianceNames).toEqual([
            "Alliance One",
            "Alliance Two",
            "Alliance Nine",
            "Alliance Ten",
        ]);

        const bodyText = document.querySelector(".ux-target-finder")?.textContent ?? "";
        expect(bodyText).not.toContain("Choose your coalition side.");
        expect(bodyText).not.toContain("AA:1");
        expect(bodyText).not.toContain("Open Locutus");
    });

    it("toggles the active side when the second coalition button is clicked", () => {
        openSampleModal();

        const secondSideButton = document.querySelector<HTMLButtonElement>(
            "[data-target-side-index='1']",
        );
        secondSideButton!.click();

        const warLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='war']",
        );
        const damageLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='damage']",
        );

        expect(secondSideButton?.getAttribute("aria-pressed")).toBe("true");
        expect(warLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/war?selector=AA:1,AA:2&allies=AA:9,AA:10",
        );
        expect(damageLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/damage?selector=AA:1,AA:2",
        );
    });

    it("filters the Locutus selectors by the alliance checkboxes", () => {
        openSampleModal();

        // The second coalition is the enemy by default; uncheck enemy alliance id 9.
        const enemyAllianceNine = document.querySelector<HTMLInputElement>(
            "input[data-target-alliance-id='9']",
        );
        enemyAllianceNine!.checked = false;
        enemyAllianceNine!.dispatchEvent(new Event("change", { bubbles: true }));

        const raidLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='raid']",
        );
        expect(raidLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/raid?selector=AA:10",
        );
    });

    it("disables actions and shows a warning when the enemy side has nothing checked", () => {
        openSampleModal();

        const enemyCheckboxes = document.querySelectorAll<HTMLInputElement>(
            "input[data-target-alliance-id='9'], input[data-target-alliance-id='10']",
        );
        enemyCheckboxes.forEach((cb) => {
            cb.checked = false;
            cb.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const warLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='war']",
        );
        const raidLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='raid']",
        );
        const status = document.querySelector<HTMLElement>(
            ".ux-target-finder-status",
        );

        expect(warLink?.getAttribute("aria-disabled")).toBe("true");
        expect(raidLink?.getAttribute("aria-disabled")).toBe("true");
        expect(status?.textContent).toContain("at least one enemy alliance");
    });

    it("disables only the War tool when your side is empty but the enemy side has alliances", () => {
        openSampleModal();

        const yourSideCheckboxes = document.querySelectorAll<HTMLInputElement>(
            "input[data-target-alliance-id='1'], input[data-target-alliance-id='2']",
        );
        yourSideCheckboxes.forEach((cb) => {
            cb.checked = false;
            cb.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const warLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='war']",
        );
        const raidLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='raid']",
        );

        expect(warLink?.getAttribute("aria-disabled")).toBe("true");
        expect(raidLink?.getAttribute("href")).toBe(
            "https://www.locutus.link/#/raid?selector=AA:9,AA:10",
        );
    });

    it("color-codes C1 as red and C2 as blue, matching the rest of the app", () => {
        openSampleModal();

        const sideClasses = Array.from(
            document.querySelectorAll<HTMLElement>(".ux-target-finder-side"),
        ).map((node) => node.className);
        const coalitionClasses = Array.from(
            document.querySelectorAll<HTMLElement>(
                ".ux-target-finder-coalition",
            ),
        ).map((node) => node.className);

        expect(sideClasses[0]).toContain("ux-target-finder-side--red");
        expect(sideClasses[1]).toContain("ux-target-finder-side--blue");
        expect(coalitionClasses[0]).toContain("ux-coalition-panel--red");
        expect(coalitionClasses[1]).toContain("ux-coalition-panel--blue");
    });

    it("marks the picked side with a local selected class and label", () => {
        openSampleModal();

        const buttons = document.querySelectorAll<HTMLElement>(
            ".ux-target-finder-side",
        );
        expect(buttons[0].classList.contains("is-selected")).toBe(true);
        expect(buttons[0].classList.contains("active")).toBe(false);
        expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
        expect(buttons[0].textContent).toContain("Selected");
        expect(buttons[1].classList.contains("is-selected")).toBe(false);
        expect(buttons[1].textContent).not.toContain("Selected");

        (buttons[1] as HTMLButtonElement).click();
        expect(buttons[1].classList.contains("is-selected")).toBe(true);
        expect(buttons[1].classList.contains("active")).toBe(false);
        expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
        expect(buttons[1].textContent).toContain("Selected");
        expect(buttons[0].classList.contains("is-selected")).toBe(false);
        expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
        expect(buttons[0].textContent).not.toContain("Selected");
    });

    it("shows labels for side selection and target actions", () => {
        openSampleModal();

        const sectionLabels = Array.from(
            document.querySelectorAll<HTMLElement>(
                ".ux-target-finder-section-label",
            ),
        ).map((node) => node.textContent?.trim());

        expect(sectionLabels).toContain("Select your side");
        expect(sectionLabels).toContain("Find targets");
    });

    it("uses the shared checkbox class without a target-finder-specific override", () => {
        openSampleModal();

        const checkboxes = document.querySelectorAll<HTMLInputElement>(
            ".ux-target-finder input[type='checkbox']",
        );

        expect(checkboxes.length).toBe(4);
        checkboxes.forEach((checkbox) => {
            expect(checkbox.classList.contains("form-check-input")).toBe(true);
            expect(checkbox.classList.contains("ux-target-finder-checkbox")).toBe(
                false,
            );
        });
    });

    it("shows a plain-language summary of which coalition you play and which you target", () => {
        openSampleModal();

        const summary = document.querySelector<HTMLElement>(
            ".ux-target-finder-summary",
        );
        expect(summary?.textContent).toBe(
            "Allies are Alpha · targeting Beta",
        );

        const secondButton = document.querySelector<HTMLButtonElement>(
            "[data-target-side-index='1']",
        );
        secondButton!.click();
        expect(summary?.textContent).toBe(
            "Allies are Beta · targeting Alpha",
        );
    });

    it("escapes plain text titles before rendering them into the runtime modal", () => {
        openSampleModal({ title: "<b>Find targets</b>" });

        const modalTitle = document.querySelector(".ux-runtime-modal .modal-title");
        expect(modalTitle?.textContent).toBe("<b>Find targets</b>");
        expect(modalTitle?.querySelector("b")).toBeNull();
    });

    it("disables Locutus actions when a coalition has no valid alliance ids", () => {
        openConflictTargetFinderModal({
            title: "Find Targets",
            coalitions: [
                {
                    label: "C1",
                    name: "Alpha",
                    alliances: [
                        { id: 0, name: "zero" },
                        { id: -1, name: "neg" },
                        { id: Number.NaN, name: "nan" },
                    ],
                },
                {
                    label: "C2",
                    name: "Beta",
                    alliances: [
                        { id: 9, name: "Alliance Nine" },
                        { id: 10, name: "Alliance Ten" },
                    ],
                },
            ],
        });

        const warLink = document.querySelector<HTMLAnchorElement>(
            "[data-target-mode='war']",
        );

        expect(warLink?.hasAttribute("href")).toBe(false);
        expect(warLink?.getAttribute("aria-disabled")).toBe("true");
    });
});
