import { formatAllianceName } from "./formatting";
import type { Conflict } from "./types";

export type AavaSelectionSnapshot = {
    header: string;
    primaryIds: number[];
    vsIds: number[];
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

export function buildAavaSelectionRows(
    data: Conflict,
    snapshot: AavaSelectionSnapshot,
): AavaSelectionRow[] {
    const c1Ids = data.coalitions[0].alliance_ids;
    const c2Ids = data.coalitions[1].alliance_ids;
    const allAllianceIds = [...c1Ids, ...c2Ids];

    const headerIndex = data.war_web.headers.indexOf(snapshot.header);
    if (headerIndex < 0) return [];

    const matrix = data.war_web.data[headerIndex] as number[][];
    const allianceNameById: Record<number, string> = {};
    data.coalitions.forEach((coalition) => {
        coalition.alliance_ids.forEach((id, i) => {
            allianceNameById[id] = formatAllianceName(
                coalition.alliance_names[i],
                id,
            );
        });
    });

    const pIndices = snapshot.primaryIds
        .map((id) => allAllianceIds.indexOf(id))
        .filter((i) => i >= 0);
    const vIndices = snapshot.vsIds
        .map((id) => allAllianceIds.indexOf(id))
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

        const allianceId = allAllianceIds[rIndex];
        rows.push({
            alliance: [allianceNameById[allianceId] ?? `AA:${allianceId}`, allianceId],
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