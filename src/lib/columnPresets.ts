import type { SharedKpiConfig } from "./kpi";
import { getPageStorageKey } from "./queryState";

export type ColumnPreset = {
    columns: string[];
    sort?: string;
    order?: string;
    kpis?: string[];
    kpiConfig?: SharedKpiConfig | Record<string, unknown> | null;
    createdAt?: number;
};

export function readColumnPresets(
    storageKey?: string,
): Record<string, ColumnPreset> {
    const key = `${storageKey ?? getPageStorageKey()}:presets`;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed as Record<string, ColumnPreset>;
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
        current[name] = { ...preset, createdAt: Date.now() };
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
