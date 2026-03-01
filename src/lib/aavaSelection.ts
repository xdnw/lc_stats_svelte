import { formatAllianceName } from "./formatting";
import type { Conflict } from "./types";

export type AavaSelectionSnapshot = {
    header: string;
    primaryIds: number[];
    vsIds: number[];
    primaryCoalitionIndex?: 0 | 1;
};

export type AavaSelectionRow = {
    alliance: [string, number];
    primary_to_row: number;
    row_to_primary: number;
    net: number;
    total: number;
    primary_share_pct: number;
    row_share_pct: number;
    abs_net: number;
};

type AavaIndexCache = {
    coalitionAllianceIds: [number[], number[]];
    indexByCoalitionAndAllianceId: [Map<number, number>, Map<number, number>];
    allianceByMatrixIndex: Array<{ id: number; name: string }>;
};

const aavaIndexCache = new WeakMap<Conflict, AavaIndexCache>();

function getAavaIndexCache(data: Conflict): AavaIndexCache {
    const cached = aavaIndexCache.get(data);
    if (cached) return cached;

    const c1Ids = data.coalitions[0].alliance_ids;
    const c2Ids = data.coalitions[1].alliance_ids;
    const coalitionAllianceIds: [number[], number[]] = [
        c1Ids.map((id) => Number(id)),
        c2Ids.map((id) => Number(id)),
    ];

    const indexByCoalitionAndAllianceId: [Map<number, number>, Map<number, number>] = [
        new Map(),
        new Map(),
    ];
    coalitionAllianceIds[0].forEach((id, i) => {
        if (!indexByCoalitionAndAllianceId[0].has(id)) {
            indexByCoalitionAndAllianceId[0].set(id, i);
            return;
        }
        console.warn(
            `AAvA index duplicate alliance id ${id} detected in coalition 0; using first occurrence.`,
        );
    });
    coalitionAllianceIds[1].forEach((id, i) => {
        if (!indexByCoalitionAndAllianceId[1].has(id)) {
            indexByCoalitionAndAllianceId[1].set(
                id,
                coalitionAllianceIds[0].length + i,
            );
            return;
        }
        console.warn(
            `AAvA index duplicate alliance id ${id} detected in coalition 1; using first occurrence.`,
        );
    });

    const allianceByMatrixIndex: Array<{ id: number; name: string }> = [];
    data.coalitions.forEach((coalition) => {
        coalition.alliance_ids.forEach((id, i) => {
            allianceByMatrixIndex.push({
                id,
                name: formatAllianceName(coalition.alliance_names[i], id),
            });
        });
    });

    const next: AavaIndexCache = {
        coalitionAllianceIds,
        indexByCoalitionAndAllianceId,
        allianceByMatrixIndex,
    };
    aavaIndexCache.set(data, next);
    return next;
}

export function buildAavaSelectionRows(
    data: Conflict,
    snapshot: AavaSelectionSnapshot,
): AavaSelectionRow[] {
    const {
        indexByCoalitionAndAllianceId,
        allianceByMatrixIndex,
    } =
        getAavaIndexCache(data);
    const primaryCoalitionIndex = snapshot.primaryCoalitionIndex === 1 ? 1 : 0;
    const vsCoalitionIndex = primaryCoalitionIndex === 0 ? 1 : 0;

    const headerIndex = data.war_web.headers.indexOf(snapshot.header);
    if (headerIndex < 0) return [];

    const matrix = data.war_web.data[headerIndex] as number[][];

    const pIndices = snapshot.primaryIds
        .map(
            (id) =>
                indexByCoalitionAndAllianceId[primaryCoalitionIndex].get(id) ??
                -1,
        )
        .filter((i) => i >= 0);
    const vIndices = snapshot.vsIds
        .map(
            (id) =>
                indexByCoalitionAndAllianceId[vsCoalitionIndex].get(id) ?? -1,
        )
        .filter((i) => i >= 0);

    const rows: AavaSelectionRow[] = [];
    let sumPrimaryToRow = 0;
    let sumRowToPrimary = 0;

    for (const rIndex of vIndices) {
        let p2r = 0;
        let r2p = 0;
        for (const pIndex of pIndices) {
            const a = matrix[pIndex]?.[rIndex] ?? 0;
            const b = matrix[rIndex]?.[pIndex] ?? 0;
            p2r += Number.isFinite(a) ? a : 0;
            r2p += Number.isFinite(b) ? b : 0;
        }
        sumPrimaryToRow += p2r;
        sumRowToPrimary += r2p;

        const alliance = allianceByMatrixIndex[rIndex];
        const allianceId = alliance?.id ?? 0;
        rows.push({
            alliance: [alliance?.name ?? `AA:${allianceId}`, allianceId],
            primary_to_row: p2r,
            row_to_primary: r2p,
            net: p2r - r2p,
            total: p2r + r2p,
            primary_share_pct: 0,
            row_share_pct: 0,
            abs_net: Math.abs(p2r - r2p),
        });
    }

    rows.forEach((row) => {
        row.primary_share_pct =
            sumPrimaryToRow > 0 ? (row.primary_to_row / sumPrimaryToRow) * 100 : 0;
        row.row_share_pct =
            sumRowToPrimary > 0 ? (row.row_to_primary / sumRowToPrimary) * 100 : 0;
    });

    return rows;
}