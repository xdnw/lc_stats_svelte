import { normalizeConflictLayoutColumns } from "./conflictLayoutQueryState";
import type { ConflictCustomColumnConfig } from "./conflictCustomColumns";

export type ConflictTableLayoutPreset = {
    sort: string;
    columns: string[];
    order?: "asc" | "desc";
};

export type ConflictTableLayoutState = {
    layout: 0 | 1 | 2;
    sort: string;
    order: "asc" | "desc";
    columns: string[];
    customColumns: ConflictCustomColumnConfig[];
};

const BREAKDOWN_COLUMNS = [
    "GROUND_TANKS_MUNITIONS_USED_UNNECESSARY",
    "DOUBLE_FORTIFY",
    "GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY",
    "GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY_INACTIVE",
    "GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR_INACTIVE",
    "GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR",
    "AIRSTRIKE_SOLDIERS_NONE",
    "AIRSTRIKE_SOLDIERS_SHOULD_USE_GROUND",
    "AIRSTRIKE_TANKS_NONE",
    "AIRSTRIKE_SHIP_NONE",
    "AIRSTRIKE_INACTIVE_NO_GROUND",
    "AIRSTRIKE_INACTIVE_NO_SHIP",
    "AIRSTRIKE_FAILED_NOT_DOGFIGHT",
    "AIRSTRIKE_AIRCRAFT_NONE",
    "AIRSTRIKE_AIRCRAFT_NONE_INACTIVE",
    "AIRSTRIKE_AIRCRAFT_LOW",
    "AIRSTRIKE_INFRA",
    "AIRSTRIKE_MONEY",
    "NAVAL_MAX_VS_NONE",
].map((column) => `off:${column.toLowerCase().replaceAll("_", " ")} attacks`);

export const CONFLICT_TABLE_LAYOUT_PRESETS: Record<string, ConflictTableLayoutPreset> = {
    Summary: {
        sort: "off:wars",
        columns: [
            "name",
            "net:damage",
            "off:wars",
            "def:wars",
            "dealt:damage",
            "loss:damage",
        ],
    },
    Dealt: {
        sort: "dealt:damage",
        columns: [
            "name",
            "dealt:infra",
            "dealt:~$soldier",
            "dealt:~$tank",
            "dealt:~$aircraft",
            "dealt:~$ship",
            "dealt:~$unit",
            "dealt:~$consume",
            "dealt:~$loot",
            "dealt:damage",
        ],
    },
    Received: {
        sort: "loss:damage",
        columns: [
            "name",
            "loss:infra",
            "loss:~$soldier",
            "loss:~$tank",
            "loss:~$aircraft",
            "loss:~$ship",
            "loss:~$unit",
            "loss:~$consume",
            "loss:~$loot",
            "loss:damage",
        ],
    },
    Units: {
        sort: "dealt:~$unit",
        columns: [
            "name",
            "dealt:soldier",
            "dealt:tank",
            "dealt:aircraft",
            "dealt:ship",
            "dealt:~$unit",
            "loss:soldier",
            "loss:tank",
            "loss:aircraft",
            "loss:ship",
            "loss:~$unit",
            "net:~$unit",
        ],
    },
    Consumption: {
        sort: "name",
        columns: [
            "name",
            "loss:~$building",
            "loss:gasoline",
            "loss:munitions",
            "loss:steel",
            "loss:aluminum",
            "loss:consume gas",
            "loss:consume mun",
        ],
    },
    Attacks: {
        sort: "off:attacks",
        columns: ["name", "off:attacks", ...BREAKDOWN_COLUMNS],
    },
};

export const DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY = "Summary";
export const DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET =
    CONFLICT_TABLE_LAYOUT_PRESETS[DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY];
export const CONFLICT_TABLE_LAYOUT_PRESET_KEYS = Object.keys(
    CONFLICT_TABLE_LAYOUT_PRESETS,
);

export function createDefaultConflictTableLayoutState(): ConflictTableLayoutState {
    return {
        layout: 0,
        sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
        order: "desc",
        columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
        customColumns: [],
    };
}

function areConflictCustomColumnsEqual(
    left: ConflictCustomColumnConfig[] | undefined,
    right: ConflictCustomColumnConfig[] | undefined,
): boolean {
    const leftColumns = left ?? [];
    const rightColumns = right ?? [];
    return JSON.stringify(leftColumns) === JSON.stringify(rightColumns);
}

export function isConflictTableLayoutStateEqual(
    state: Pick<
        ConflictTableLayoutState,
        "layout" | "sort" | "order" | "columns" | "customColumns"
    >,
    input: Pick<
        ConflictTableLayoutState,
        "sort" | "order" | "columns" | "customColumns"
    >,
): boolean {
    const normalizedInputColumns = normalizeConflictLayoutColumns(
        state.layout,
        input.columns,
        {
            customColumnIds: input.customColumns.map((column) => column.id),
        },
    );
    return (
        state.sort === input.sort &&
        state.order === input.order &&
        areConflictCustomColumnsEqual(state.customColumns, input.customColumns) &&
        state.columns.length === normalizedInputColumns.length &&
        state.columns.every((value, index) => value === normalizedInputColumns[index])
    );
}

export function detectConflictTableLayoutPresetKey(
    state: Pick<
        ConflictTableLayoutState,
        "layout" | "sort" | "order" | "columns" | "customColumns"
    >,
): string | null {
    if (state.customColumns.length > 0) {
        return null;
    }

    return (
        CONFLICT_TABLE_LAYOUT_PRESET_KEYS.find((key) => {
            const preset = CONFLICT_TABLE_LAYOUT_PRESETS[key];
            return isConflictTableLayoutStateEqual(state, {
                sort: preset.sort,
                order: preset.order ?? "desc",
                columns: preset.columns,
                customColumns: [],
            });
        }) ?? null
    );
}

export function isConflictTableDefaultPresetState(
    state: Pick<
        ConflictTableLayoutState,
        "layout" | "sort" | "order" | "columns" | "customColumns"
    >,
): boolean {
    return isConflictTableLayoutStateEqual(state, {
        sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
        order: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.order ?? "desc",
        columns: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns,
        customColumns: [],
    });
}
