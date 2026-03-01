import type { SelectionId, SelectionModalItem } from "./selection/types";

type CoalitionAllianceShape = {
    alliance_ids?: Array<number | string> | Record<string, number | string | null | undefined>;
    alliance_names?: Array<string | null | undefined> | Record<string, string | null | undefined>;
    name?: string;
};

type CoalitionAllianceIdsShape = {
    alliance_ids: number[];
};

function parseNumber(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function toRecord<T>(value: Array<T> | Record<string, T> | null | undefined): Record<string, T> {
    if (!value) return {};
    if (Array.isArray(value)) {
        const out: Record<string, T> = {};
        value.forEach((v, i) => {
            out[String(i)] = v;
        });
        return out;
    }
    return value;
}

function notNull<T>(value: T | null): value is T {
    return value !== null;
}

function asOptionalString(value: unknown): string | null | undefined {
    if (value == null) return value as null | undefined;
    return typeof value === "string" ? value : undefined;
}

function extractCoalitionAlliancePairs(
    coalition: CoalitionAllianceShape,
): Array<{ id: number; name: string | null | undefined }> {
    const idsRaw = coalition?.alliance_ids;
    const namesRaw = coalition?.alliance_names;
    if (!idsRaw) return [];

    if (Array.isArray(idsRaw)) {
        const names = Array.isArray(namesRaw) ? namesRaw : [];
        return idsRaw
            .map((rawId, index) => {
                const id = parseNumber(rawId);
                return id === null ? null : { id, name: names[index] };
            })
            .filter(notNull);
    }

    const idRecord = toRecord(idsRaw as Record<string, number | string | null | undefined>);
    const nameRecord = toRecord(namesRaw as any);
    const entries = Object.entries(idRecord);

    return entries
        .map(([key, value]) => {
            const id = parseNumber(value);
            return id === null ? null : { id, name: asOptionalString(nameRecord[key]) };
        })
        .filter(notNull);
}

export function toNumberSelection(ids: SelectionId[]): number[] {
    return ids
        .map((id) => parseNumber(id))
        .filter((id): id is number => id !== null && Number.isFinite(id));
}

export function firstSelectedString(ids: SelectionId[]): string | null {
    if (ids.length === 0) return null;
    const first = `${ids[0] ?? ""}`.trim();
    return first.length > 0 ? first : null;
}

export function validateSingleSelection(
    ids: SelectionId[],
    label: string,
): string | null {
    return ids.length === 1 ? null : `Select exactly one ${label}.`;
}

export function validateAtLeastOneSelection(ids: SelectionId[]): string | null {
    return ids.length > 0 ? null : "Keep at least one alliance selected.";
}

export function buildStringSelectionItems(values: string[]): SelectionModalItem[] {
    return values.map((value) => ({
        id: value,
        label: value,
    }));
}

export function buildCoalitionAllianceItems(
    coalitions: CoalitionAllianceShape[],
    formatAllianceName: (name: string, id: number) => string,
): SelectionModalItem[] {
    const items: SelectionModalItem[] = [];
    for (const coalition of coalitions ?? []) {
        const pairs = extractCoalitionAlliancePairs(coalition);
        const coalitionName = `${coalition?.name ?? "Coalition"}`;

        pairs.forEach(({ id, name }) => {
            items.push({
                id,
                label: formatAllianceName(`${name ?? ""}`, id),
                group: coalitionName,
            });
        });
    }
    return items;
}

export function validateAtLeastOnePerCoalition(
    ids: SelectionId[],
    coalitions: CoalitionAllianceShape[],
): string | null {
    const selected = new Set(toNumberSelection(ids));
    const everyCoalitionHasSelection = coalitions.every((coalition) =>
        extractCoalitionAlliancePairs(coalition).some((entry) => selected.has(entry.id)),
    );
    return everyCoalitionHasSelection
        ? null
        : "Keep at least one alliance selected in each coalition.";
}

export function getSelectedAllianceIdsForCoalition(
    coalitions: CoalitionAllianceIdsShape[] | null | undefined,
    coalitionIndex: 0 | 1,
    selectedIds: Set<number>,
): number[] {
    const coalition = coalitions?.[coalitionIndex];
    if (!coalition) return [];
    return coalition.alliance_ids.filter((id) => selectedIds.has(id));
}

export function mergeCoalitionAllianceSelection(
    coalitions: CoalitionAllianceIdsShape[] | null | undefined,
    coalitionIndex: 0 | 1,
    selectedIds: Set<number>,
    modalSelection: SelectionId[],
): Set<number> {
    const nextIds = toNumberSelection(modalSelection);
    const otherIndex = (coalitionIndex === 0 ? 1 : 0) as 0 | 1;
    const preservedOther = getSelectedAllianceIdsForCoalition(
        coalitions,
        otherIndex,
        selectedIds,
    );
    return new Set([...preservedOther, ...nextIds]);
}
