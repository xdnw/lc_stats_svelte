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

export type AavaSelectionSource = {
    headers: string[];
    matrices: number[][][];
    indexByCoalitionAndAllianceId: [Map<number, number>, Map<number, number>];
    allianceByMatrixIndex: Array<{ id: number; name: string }>;
};

const aavaIndexCache = new WeakMap<Conflict, AavaSelectionSource>();

function sanitizeAavaMatrices(matrices: number[][][]): number[][][] {
    let sanitizedMatrices: number[][][] | null = null;

    function ensureSanitizedRow(headerIndex: number, rowIndex: number): number[] {
        if (!sanitizedMatrices) {
            sanitizedMatrices = matrices.slice();
        }

        let matrix = sanitizedMatrices[headerIndex];
        if (matrix === matrices[headerIndex]) {
            matrix = matrices[headerIndex].slice();
            sanitizedMatrices[headerIndex] = matrix;
        }

        let row = matrix[rowIndex];
        if (row === matrices[headerIndex][rowIndex]) {
            row = row.slice();
            matrix[rowIndex] = row;
        }

        return row;
    }

    for (let h = 0; h < matrices.length; h++) {
        const matrix = matrices[h];
        if (!Array.isArray(matrix)) continue;

        for (let r = 0; r < matrix.length; r++) {
            const row = matrix[r];
            if (!Array.isArray(row)) continue;

            for (let c = 0; c < row.length; c++) {
                const value = row[c];
                if (typeof value === "number" && Number.isFinite(value)) continue;
                ensureSanitizedRow(h, r)[c] = 0;
            }
        }
    }

    return sanitizedMatrices ?? matrices;
}

function collectMatrixIndices(
    allianceIds: number[],
    indexByAllianceId: Map<number, number>,
): number[] {
    const indices: number[] = [];
    for (let i = 0; i < allianceIds.length; i++) {
        const index = indexByAllianceId.get(allianceIds[i]);
        if (index != null && index >= 0) {
            indices.push(index);
        }
    }
    return indices;
}

export function createAavaSelectionSource(data: Conflict): AavaSelectionSource {
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

    const matrices = sanitizeAavaMatrices(data.war_web.data as number[][][]);

    return {
        headers: [...data.war_web.headers],
        matrices,
        indexByCoalitionAndAllianceId,
        allianceByMatrixIndex,
    };
}

export function getAavaSelectionSource(data: Conflict): AavaSelectionSource {
    const cached = aavaIndexCache.get(data);
    if (cached) return cached;

    const next = createAavaSelectionSource(data);
    aavaIndexCache.set(data, next);
    return next;
}

export function buildAavaSelectionRowsFromSource(
    source: AavaSelectionSource,
    snapshot: AavaSelectionSnapshot,
): AavaSelectionRow[] {
    const {
        headers,
        matrices,
        indexByCoalitionAndAllianceId,
        allianceByMatrixIndex,
    } = source;
    const primaryCoalitionIndex = snapshot.primaryCoalitionIndex === 1 ? 1 : 0;
    const vsCoalitionIndex = primaryCoalitionIndex === 0 ? 1 : 0;

    const headerIndex = headers.indexOf(snapshot.header);
    if (headerIndex < 0) return [];

    const matrix = matrices[headerIndex] as number[][];

    const pIndices = collectMatrixIndices(
        snapshot.primaryIds,
        indexByCoalitionAndAllianceId[primaryCoalitionIndex],
    );
    const vIndices = collectMatrixIndices(
        snapshot.vsIds,
        indexByCoalitionAndAllianceId[vsCoalitionIndex],
    );
    const pRows = pIndices.map((pIndex) => matrix[pIndex]);

    const rows: AavaSelectionRow[] = [];
    let sumPrimaryToRow = 0;
    let sumRowToPrimary = 0;

    for (const rIndex of vIndices) {
        const rowR = matrix[rIndex];
        let p2r = 0;
        let r2p = 0;
        for (let i = 0; i < pIndices.length; i++) {
            const pIndex = pIndices[i];
            const a = pRows[i]?.[rIndex] ?? 0;
            const b = rowR?.[pIndex] ?? 0;
            p2r += a;
            r2p += b;
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

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        row.primary_share_pct =
            sumPrimaryToRow > 0 ? (row.primary_to_row / sumPrimaryToRow) * 100 : 0;
        row.row_share_pct =
            sumRowToPrimary > 0 ? (row.row_to_primary / sumRowToPrimary) * 100 : 0;
    }

    return rows;
}

export function buildAavaSelectionRows(
    data: Conflict,
    snapshot: AavaSelectionSnapshot,
): AavaSelectionRow[] {
    return buildAavaSelectionRowsFromSource(
        getAavaSelectionSource(data),
        snapshot,
    );
}
