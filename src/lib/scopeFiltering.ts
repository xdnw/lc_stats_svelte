import type { Conflict, TableData } from "./types";
import type { ScopeSnapshot, WidgetEntity, WidgetScope } from "./kpi";

function rowAllianceId(row: any[]): number {
    return Number(row[0]?.[1]);
}

function rowNationId(row: any[]): number {
    return Number(row[0]?.[1]);
}

function rowNationAllianceId(row: any[]): number {
    return Number(row[0]?.[2]);
}

function coalitionAllianceIds(rawData: Conflict | null, scope: WidgetScope): Set<number> {
    if (!rawData) return new Set<number>();
    if (scope === "coalition1") {
        return new Set<number>(rawData.coalitions[0]?.alliance_ids ?? []);
    }
    if (scope === "coalition2") {
        return new Set<number>(rawData.coalitions[1]?.alliance_ids ?? []);
    }
    return new Set<number>();
}

export function getScopedRows(
    entity: WidgetEntity,
    scope: WidgetScope,
    table: TableData,
    snapshot?: ScopeSnapshot,
    rawData?: Conflict | null,
): any[] {
    if (scope === "all") return table.data;

    if (scope === "selection") {
        const allianceIds = new Set<number>(snapshot?.allianceIds ?? []);
        const nationIds = new Set<number>(snapshot?.nationIds ?? []);

        if (entity === "alliance") {
            if (allianceIds.size === 0) return [];
            return table.data.filter((row) => allianceIds.has(rowAllianceId(row)));
        }

        if (nationIds.size > 0) {
            return table.data.filter((row) => nationIds.has(rowNationId(row)));
        }

        if (allianceIds.size > 0) {
            return table.data.filter((row) =>
                allianceIds.has(rowNationAllianceId(row))
            );
        }

        return [];
    }

    if (!rawData) return table.data;
    const coalitionIds = coalitionAllianceIds(rawData, scope);
    return table.data.filter((row) => {
        if (entity === "alliance") {
            return coalitionIds.has(rowAllianceId(row));
        }
        return coalitionIds.has(rowNationAllianceId(row));
    });
}