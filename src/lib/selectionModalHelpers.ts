import type { SelectionId, SelectionModalItem } from "../components/selectionModalTypes";

type CoalitionAllianceShape = {
    alliance_ids?: Array<number | string> | Record<string, number | string | null | undefined>;
    alliance_names?: Array<string | null | undefined> | Record<string, string | null | undefined>;
    name?: string;
};

function parseNumber(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) return parsed;
        const match = trimmed.match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;
        const extracted = Number(match[0]);
        return Number.isFinite(extracted) ? extracted : null;
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

function isSetLike(value: unknown): value is Set<unknown> {
    return typeof Set !== "undefined" && value instanceof Set;
}

function isMapLike(value: unknown): value is Map<unknown, unknown> {
    return typeof Map !== "undefined" && value instanceof Map;
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

    if (isSetLike(idsRaw)) {
        const names = Array.isArray(namesRaw) ? namesRaw : [];
        return Array.from(idsRaw)
            .map((rawId, index) => {
                const id = parseNumber(rawId);
                return id === null ? null : { id, name: names[index] };
            })
            .filter(notNull);
    }

    if (isMapLike(idsRaw)) {
        const pairs = Array.from(idsRaw.entries())
            .map(([key, value]) => {
                const id = parseNumber(key) ?? parseNumber(value);
                const name = typeof value === "string" ? value : null;
                return id === null ? null : { id, name };
            })
            .filter(notNull);
        if (pairs.length > 0) return pairs;
    }

    const idRecord = idsRaw;
    const nameRecord = toRecord(namesRaw as any);
    const entries = Object.entries(idRecord);

    const parsedByValue = entries
        .map(([key, value]) => {
            const id = parseNumber(value);
            return id === null ? null : { key, id, name: asOptionalString(nameRecord[key]) };
        })
        .filter(notNull);
    if (parsedByValue.length > 0) {
        return parsedByValue.map(({ id, name }) => ({ id, name }));
    }

    const parsedByKey = entries
        .map(([key, value]) => {
            const id = parseNumber(key);
            return id === null
                ? null
                : {
                    id,
                    name: typeof value === "string" ? value : asOptionalString(nameRecord[key]),
                };
        })
        .filter(notNull);

    return parsedByKey;
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
