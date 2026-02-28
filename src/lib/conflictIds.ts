export const MAX_COMPOSITE_CONFLICT_IDS = 30;

export type ParsedCompositeSelectionIds = {
    ids: string[];
    invalidTokens: string[];
    limited: boolean;
};

const CONFLICT_ID_PATTERN = /^[1-9]\d*$/;

function normalizeToken(token: string): string {
    return token.trim();
}

function isValidConflictId(token: string): boolean {
    return CONFLICT_ID_PATTERN.test(token);
}

export function parseCompositeSelectionIds(
    raw: string | null | undefined,
    maxIds: number = MAX_COMPOSITE_CONFLICT_IDS,
): ParsedCompositeSelectionIds {
    if (!raw) {
        return { ids: [], invalidTokens: [], limited: false };
    }

    const seen = new Set<string>();
    const ids: string[] = [];
    const invalidTokens: string[] = [];

    const tokens = raw
        .split(",")
        .map(normalizeToken)
        .filter((token) => token.length > 0);

    for (const token of tokens) {
        if (!isValidConflictId(token)) {
            invalidTokens.push(token);
            continue;
        }
        if (seen.has(token)) continue;
        seen.add(token);
        if (ids.length >= maxIds) {
            continue;
        }
        ids.push(token);
    }

    return {
        ids,
        invalidTokens,
        limited: ids.length >= maxIds && seen.size > maxIds,
    };
}

export function encodeCompositeSelectionIds(ids: string[]): string {
    return ids.join(",");
}

export function getCompositeConflictSignature(ids: string[]): string {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    unique.sort((left, right) => Number(left) - Number(right));
    return unique.join(".");
}