import type { SelectionId } from "../selection/types";

const GRID_SELECTION_FILTER_PREFIX = "select:";

function normalizeSelectionToken(value: SelectionId): string | null {
    const normalized = `${value ?? ""}`.trim();
    return normalized.length > 0 ? normalized : null;
}

function compareSelectionTokens(left: string, right: string): number {
    return left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

export function encodeGridSelectionFilterValue(ids: SelectionId[]): string {
    const normalized = Array.from(
        new Set(ids.map(normalizeSelectionToken).filter((value): value is string => value != null)),
    ).sort(compareSelectionTokens);

    return normalized.length > 0
        ? `${GRID_SELECTION_FILTER_PREFIX}${normalized.join(",")}`
        : "";
}

export function parseGridSelectionFilterValue(
    value: string | null | undefined,
): string[] | null {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized.toLowerCase().startsWith(GRID_SELECTION_FILTER_PREFIX)) {
        return null;
    }

    const rawTokens = normalized.slice(GRID_SELECTION_FILTER_PREFIX.length);
    if (rawTokens.length === 0) {
        return [];
    }

    return Array.from(
        new Set(
            rawTokens
                .split(",")
                .map((token) => token.trim())
                .filter((token) => token.length > 0),
        ),
    ).sort(compareSelectionTokens);
}

export function isGridSelectionFilterValue(
    value: string | null | undefined,
): boolean {
    return parseGridSelectionFilterValue(value) !== null;
}
