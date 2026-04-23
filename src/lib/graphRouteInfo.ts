import type { GraphData } from "./types";

export interface GraphRouteCoalitionInfo {
    name: string;
    alliance_ids: number[];
    alliance_names: string[];
}

export interface GraphRouteInfo {
    name: string;
    wiki?: string;
    metric_names: string[];
    coalitions: [GraphRouteCoalitionInfo, GraphRouteCoalitionInfo];
    update_ms?: number;
}

export function buildGraphRouteInfo(
    data: GraphData,
): GraphRouteInfo {
    return {
        name: data.name,
        wiki: typeof data.wiki === "string" ? data.wiki : undefined,
        metric_names: [...data.metric_names],
        coalitions: data.coalitions.map((coalition) => ({
            name: coalition.name,
            alliance_ids: [...coalition.alliance_ids],
            alliance_names: coalition.alliance_ids.map(
                (_id, index) => coalition.alliance_names?.[index] ?? "",
            ),
        })) as [GraphRouteCoalitionInfo, GraphRouteCoalitionInfo],
        update_ms: typeof data.update_ms === "number" ? data.update_ms : undefined,
    };
}

export function buildDefaultAllowedAllianceIds(data: {
    coalitions: Array<{ alliance_ids: number[] }>;
}): number[] {
    return data.coalitions.reduce<number[]>((allianceIds, coalition) => {
        allianceIds.push(...coalition.alliance_ids);
        return allianceIds;
    }, []);
}

export function resolveInitialAllowedAllianceIds(
    data: {
        coalitions: Array<{ alliance_ids: number[] }>;
    },
    requestedAllianceIds: number[] | null | undefined,
): Set<number> {
    const defaultIds = buildDefaultAllowedAllianceIds(data);
    if (!requestedAllianceIds || requestedAllianceIds.length === 0) {
        return new Set(defaultIds);
    }

    const defaultIdSet = new Set(defaultIds);
    const requestedIds = new Set(
        requestedAllianceIds.filter((id) => defaultIdSet.has(id)),
    );
    const hasEachCoalitionSelected = data.coalitions.every((coalition) =>
        coalition.alliance_ids.some((id) => requestedIds.has(id)),
    );
    return hasEachCoalitionSelected && requestedIds.size > 0
        ? requestedIds
        : new Set(defaultIds);
}

export function resolveMetricTimeAllowedAllianceIds(
    data: {
        coalitions: Array<{ alliance_ids: number[] }>;
    },
    requestedAllianceIds: number[] | null | undefined,
): Set<number> {
    const defaultIds = buildDefaultAllowedAllianceIds(data);
    if (!requestedAllianceIds || requestedAllianceIds.length === 0) {
        return new Set(defaultIds);
    }

    const defaultIdSet = new Set(defaultIds);
    const requestedIds = new Set(
        requestedAllianceIds.filter((id) => defaultIdSet.has(id)),
    );
    return requestedIds.size > 0 ? requestedIds : new Set(defaultIds);
}
