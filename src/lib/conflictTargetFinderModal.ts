import {
    buildAllianceSelector,
    buildConflictTargetFinderUrl,
    type ConflictTargetFinderCoalition,
    type ConflictTargetFinderMode,
} from "./conflictTargetFinder";
import { modalWithCloseButton } from "./modals";

type ConflictTargetFinderActionDefinition = {
    mode: ConflictTargetFinderMode;
    label: string;
    description: string;
    requiresOwnSide: boolean;
};

const ACTION_DEFINITIONS: ConflictTargetFinderActionDefinition[] = [
    {
        mode: "war",
        label: "War",
        description: "Open the Locutus war finder for these targets",
        requiresOwnSide: true,
    },
    {
        mode: "raid",
        label: "Raid",
        description: "Open the Locutus raid finder for these targets",
        requiresOwnSide: false,
    },
    {
        mode: "damage",
        label: "High Infra",
        description: "Open the Locutus high-infra damage finder for these targets",
        requiresOwnSide: false,
    },
];

// Convention used across the app (aava, tiering, chord pages): coalition 1 = red, coalition 2 = blue.
const SIDE_TONES = ["red", "blue"] as const;
const COALITION_PANEL_TONE_CLASS = [
    "ux-coalition-panel--red",
    "ux-coalition-panel--blue",
] as const;

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function coalitionDisplayName(
    coalition: ConflictTargetFinderCoalition,
): string {
    const trimmed = coalition.name.trim();
    return trimmed.length > 0 ? trimmed : coalition.label;
}

type CoalitionPicker = {
    fieldset: HTMLFieldSetElement;
    countLabel: HTMLSpanElement;
};

type SideButtonControl = {
    button: HTMLButtonElement;
    state: HTMLSpanElement;
    coalitionName: string;
};

function createCoalitionPicker(
    coalition: ConflictTargetFinderCoalition,
    coalitionIndex: 0 | 1,
    onChange: (coalitionIndex: 0 | 1, checked: Set<number>) => void,
): CoalitionPicker {
    const fieldset = document.createElement("fieldset");
    fieldset.className =
        `ux-coalition-panel ${COALITION_PANEL_TONE_CLASS[coalitionIndex]} ux-target-finder-coalition`;

    const legend = document.createElement("legend");
    legend.className = "ux-target-finder-coalition-legend small fw-semibold";

    const nameLabel = document.createElement("span");
    nameLabel.textContent = coalitionDisplayName(coalition);

    const countLabel = document.createElement("span");
    countLabel.className = "ux-muted ms-1";

    legend.append(nameLabel, countLabel);
    fieldset.appendChild(legend);

    const toolbar = document.createElement("div");
    toolbar.className =
        "ux-target-finder-coalition-toolbar btn-group btn-group-sm";
    toolbar.setAttribute("role", "group");

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "btn ux-btn btn-sm";
    allButton.textContent = "All";

    const noneButton = document.createElement("button");
    noneButton.type = "button";
    noneButton.className = "btn ux-btn btn-sm";
    noneButton.textContent = "None";

    toolbar.append(allButton, noneButton);
    fieldset.appendChild(toolbar);

    const list = document.createElement("div");
    list.className = "ux-target-finder-alliance-list";

    const checkboxes = new Map<number, HTMLInputElement>();

    const emitChange = () => {
        const checked = new Set<number>();
        checkboxes.forEach((cb, id) => {
            if (cb.checked) checked.add(id);
        });
        onChange(coalitionIndex, checked);
    };

    coalition.alliances.forEach((alliance) => {
        const row = document.createElement("label");
        row.className = "ux-target-finder-alliance-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input m-0";
        checkbox.checked = true;
        checkbox.dataset.targetAllianceId = String(alliance.id);
        checkbox.addEventListener("change", emitChange);

        const text = document.createElement("span");
        text.className = "ux-target-finder-alliance-name";
        text.textContent = alliance.name;

        row.append(checkbox, text);
        list.appendChild(row);
        checkboxes.set(alliance.id, checkbox);
    });
    fieldset.appendChild(list);

    allButton.addEventListener("click", () => {
        checkboxes.forEach((cb) => {
            cb.checked = true;
        });
        emitChange();
    });
    noneButton.addEventListener("click", () => {
        checkboxes.forEach((cb) => {
            cb.checked = false;
        });
        emitChange();
    });

    return { fieldset, countLabel };
}

export function openConflictTargetFinderModal(options: {
    title: string;
    coalitions: [ConflictTargetFinderCoalition, ConflictTargetFinderCoalition];
    titleHtml?: string;
    defaultSideIndex?: 0 | 1;
}): void {
    const body = document.createElement("div");
    body.className = "ux-target-finder";

    let selectedSideIndex: 0 | 1 = options.defaultSideIndex === 1 ? 1 : 0;
    const checkedByCoalition: [Set<number>, Set<number>] = [
        new Set(options.coalitions[0].alliances.map((a) => a.id)),
        new Set(options.coalitions[1].alliances.map((a) => a.id)),
    ];

    const sidePicker = document.createElement("div");
    sidePicker.className = "ux-target-finder-side-picker";
    sidePicker.setAttribute("role", "group");
    sidePicker.setAttribute("aria-label", "Choose your coalition side");

    const sidePickerLabel = document.createElement("p");
    sidePickerLabel.className =
        "ux-target-finder-section-label small fw-semibold ux-muted";
    sidePickerLabel.textContent = "Select your side";
    body.appendChild(sidePickerLabel);

    const sideButtons: SideButtonControl[] = options.coalitions.map(
        (coalition, coalitionIndex) => {
            const button = document.createElement("button");
            const coalitionName = coalitionDisplayName(coalition);
            button.type = "button";
            button.className =
                `btn ux-btn ux-target-finder-side ux-target-finder-side--${SIDE_TONES[coalitionIndex]}`;
            button.dataset.targetSideIndex = String(coalitionIndex);

            const name = document.createElement("span");
            name.className = "ux-target-finder-side-name";
            name.textContent = coalitionName;

            const state = document.createElement("span");
            state.className = "ux-target-finder-side-state";

            button.append(name, state);
            button.addEventListener("click", () => {
                if (selectedSideIndex === coalitionIndex) return;
                selectedSideIndex = coalitionIndex as 0 | 1;
                sync();
            });
            sidePicker.appendChild(button);
            return { button, state, coalitionName };
        },
    );
    body.appendChild(sidePicker);

    const summary = document.createElement("p");
    summary.className = "ux-target-finder-summary small ux-muted";
    body.appendChild(summary);

    const customize = document.createElement("details");
    customize.className = "ux-target-finder-customize";

    const customizeSummary = document.createElement("summary");
    customizeSummary.className = "ux-target-finder-customize-summary small fw-semibold";
    customize.appendChild(customizeSummary);

    const customizeBody = document.createElement("div");
    customizeBody.className = "ux-target-finder-coalitions";

    const pickers: CoalitionPicker[] = options.coalitions.map(
        (coalition, coalitionIndex) =>
            createCoalitionPicker(
                coalition,
                coalitionIndex as 0 | 1,
                (idx, checked) => {
                    checkedByCoalition[idx] = checked;
                    sync();
                },
            ),
    );

    pickers.forEach((picker) => customizeBody.appendChild(picker.fieldset));
    customize.appendChild(customizeBody);
    body.appendChild(customize);

    const status = document.createElement("p");
    status.className = "ux-target-finder-status small text-warning";
    status.setAttribute("role", "status");
    body.appendChild(status);

    const actionsLabel = document.createElement("p");
    actionsLabel.className =
        "ux-target-finder-section-label small fw-semibold ux-muted";
    actionsLabel.textContent = "Find targets";
    body.appendChild(actionsLabel);

    const actionRow = document.createElement("div");
    actionRow.className = "ux-target-finder-actions";
    const actionLinks = new Map<ConflictTargetFinderMode, HTMLAnchorElement>();

    ACTION_DEFINITIONS.forEach((action) => {
        const link = document.createElement("a");
        link.className = "btn ux-btn fw-bold flex-fill ux-target-finder-action";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.dataset.targetMode = action.mode;
        link.textContent = action.label;
        link.title = action.description;
        link.setAttribute("aria-label", action.description);
        actionRow.appendChild(link);
        actionLinks.set(action.mode, link);
    });
    body.appendChild(actionRow);

    function selectedAllianceIds(coalitionIndex: 0 | 1): number[] {
        const allowed = checkedByCoalition[coalitionIndex];
        return options.coalitions[coalitionIndex].alliances
            .map((alliance) => alliance.id)
            .filter((id) => allowed.has(id));
    }

    function sync(): void {
        const yourIndex = selectedSideIndex;
        const enemyIndex = (yourIndex === 0 ? 1 : 0) as 0 | 1;
        const yourIds = selectedAllianceIds(yourIndex);
        const enemyIds = selectedAllianceIds(enemyIndex);

        sideButtons.forEach(({ button, state, coalitionName }, coalitionIndex) => {
            const isYourSide = coalitionIndex === yourIndex;
            button.setAttribute("aria-pressed", String(isYourSide));
            button.classList.toggle("is-selected", isYourSide);
            button.title = isYourSide
                ? `${coalitionName} selected as your side`
                : `Select ${coalitionName} as your side`;
            state.textContent = isYourSide ? "Selected" : "";
        });

        pickers.forEach((picker, coalitionIndex) => {
            const total = options.coalitions[coalitionIndex].alliances.length;
            const selected = checkedByCoalition[coalitionIndex].size;
            picker.countLabel.textContent = `(${selected}/${total})`;
        });

        const yourName = coalitionDisplayName(options.coalitions[yourIndex]);
        const enemyName = coalitionDisplayName(options.coalitions[enemyIndex]);
        summary.innerHTML =
            `Allies are <strong>${escapeHtml(yourName)}</strong> · targeting <strong>${escapeHtml(enemyName)}</strong>`;

        const totalSelected = yourIds.length + enemyIds.length;
        const totalAlliances =
            options.coalitions[0].alliances.length +
            options.coalitions[1].alliances.length;
        customizeSummary.textContent =
            `Customize alliances (${totalSelected}/${totalAlliances} selected)`;

        let warning = "";
        if (enemyIds.length === 0) {
            warning = "Pick at least one enemy alliance to open a Locutus tool.";
        } else if (yourIds.length === 0) {
            warning =
                "Pick at least one alliance on your side to use the War tool.";
        }
        status.textContent = warning;
        status.classList.toggle("d-none", warning.length === 0);

        const enemySelector = buildAllianceSelector(enemyIds);
        const yourSelector = buildAllianceSelector(yourIds);

        ACTION_DEFINITIONS.forEach((action) => {
            const link = actionLinks.get(action.mode);
            if (!link) return;

            const enemyOk = enemySelector.length > 0;
            const sideOk = !action.requiresOwnSide || yourSelector.length > 0;
            if (!enemyOk || !sideOk) {
                link.removeAttribute("href");
                link.setAttribute("aria-disabled", "true");
                link.tabIndex = -1;
                return;
            }

            link.href = buildConflictTargetFinderUrl({
                mode: action.mode,
                sideAllianceIds: yourIds,
                enemyAllianceIds: enemyIds,
            });
            link.removeAttribute("aria-disabled");
            link.tabIndex = 0;
        });
    }

    sync();

    modalWithCloseButton(options.titleHtml ?? escapeHtml(options.title), body);
}
