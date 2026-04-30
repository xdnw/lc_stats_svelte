import type { SharedKpiConfig } from "./kpi";
import {
    sanitizeConflictCustomColumns,
    type ConflictCustomColumnConfig,
} from "./conflictCustomColumns";
import { getPageStorageKey } from "./queryStorage";

export type ColumnPreset = {
    columns: string[];
    customColumns?: ConflictCustomColumnConfig[];
    sort?: string;
    order?: string;
    kpis?: string[];
    kpiConfig?: SharedKpiConfig | Record<string, unknown> | null;
    createdAt?: number;
};

function sanitizeColumnPreset(input: unknown): ColumnPreset | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }

    const preset = input as Record<string, unknown>;
    const columns = Array.isArray(preset.columns)
        ? preset.columns
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
        : [];

    return {
        columns,
        customColumns: sanitizeConflictCustomColumns(preset.customColumns),
        sort: typeof preset.sort === "string" ? preset.sort : undefined,
        order: preset.order === "asc" || preset.order === "desc"
            ? preset.order
            : undefined,
        kpis: Array.isArray(preset.kpis)
            ? preset.kpis.filter((value): value is string => typeof value === "string")
            : undefined,
        kpiConfig:
            preset.kpiConfig && typeof preset.kpiConfig === "object"
                ? (preset.kpiConfig as SharedKpiConfig | Record<string, unknown>)
                : preset.kpiConfig === null
                  ? null
                  : undefined,
        createdAt: typeof preset.createdAt === "number" ? preset.createdAt : undefined,
    };
}

export function readColumnPresets(
    storageKey?: string,
): Record<string, ColumnPreset> {
    const key = `${storageKey ?? getPageStorageKey()}:presets`;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return Object.fromEntries(
            Object.entries(parsed)
                .map(([name, preset]) => [name, sanitizeColumnPreset(preset)])
                .filter((entry): entry is [string, ColumnPreset] => entry[1] != null),
        );
    } catch (error) {
        console.warn("Failed to read column presets", error);
        return {};
    }
}

export function saveColumnPreset(
    name: string,
    preset: ColumnPreset,
    storageKey?: string,
): void {
    const key = `${storageKey ?? getPageStorageKey()}:presets`;
    try {
        const current = readColumnPresets(storageKey);
        current[name] = {
            ...preset,
            columns: Array.isArray(preset.columns) ? [...preset.columns] : [],
            customColumns: sanitizeConflictCustomColumns(preset.customColumns),
            createdAt: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(current));
    } catch (error) {
        console.warn("Failed to save column preset", error);
    }
}

export function deleteColumnPreset(name: string, storageKey?: string): void {
    const key = `${storageKey ?? getPageStorageKey()}:presets`;
    try {
        const current = readColumnPresets(storageKey);
        if (Object.prototype.hasOwnProperty.call(current, name)) {
            delete current[name];
            localStorage.setItem(key, JSON.stringify(current));
        }
    } catch (error) {
        console.warn("Failed to delete column preset", error);
    }
}
