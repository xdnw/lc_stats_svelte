import type { Conflict, TableData } from "./types";

export type CoalitionSummaryRow = {
    idx: number;
    name: string;
    dealt: number;
    received: number;
    net: number;
    wars: number;
};

export type OffWarsPerNationStats = {
    totalOffWars: number;
    totalNations: number;
    perNation: number;
};

export function computeDurationSoFar(
    rawData: Conflict | null,
    formatDuration: (seconds: number) => string,
): string {
    if (!rawData) return "N/A";
    const start = rawData.start;
    const end = rawData.end === -1 ? Date.now() : rawData.end;
    if (!start) return "N/A";
    return formatDuration(Math.max(0, Math.round((end - start) / 1000)));
}

export function computeCoalitionSummary(
    rawData: Conflict | null,
    summaryCoalitionTable: TableData | null,
): CoalitionSummaryRow[] | null {
    if (!rawData || !summaryCoalitionTable) return null;

    const table = summaryCoalitionTable;
    const dealtIdx = table.columns.indexOf("dealt:damage");
    const lossIdx = table.columns.indexOf("loss:damage");
    const netIdx = table.columns.indexOf("net:damage");
    const offWarsIdx = table.columns.indexOf("off:wars");
    const defWarsIdx = table.columns.indexOf("def:wars");

    if (
        dealtIdx === -1 ||
        lossIdx === -1 ||
        netIdx === -1 ||
        offWarsIdx === -1 ||
        defWarsIdx === -1
    ) {
        return null;
    }

    return table.data.slice(0, 2).map((row, idx) => ({
        idx,
        name: rawData.coalitions[idx]?.name ?? `Coalition ${idx + 1}`,
        dealt: Number(row[dealtIdx]) || 0,
        received: Number(row[lossIdx]) || 0,
        net: Number(row[netIdx]) || 0,
        wars: (Number(row[offWarsIdx]) || 0) + (Number(row[defWarsIdx]) || 0),
    }));
}

export function computeOffWarsPerNationStats(
    summaryNationTable: TableData | null,
): OffWarsPerNationStats | null {
    if (!summaryNationTable) return null;

    const offIdx = summaryNationTable.columns.indexOf("off:wars");
    if (offIdx === -1) return null;

    const totalNations = summaryNationTable.data.length;
    if (totalNations === 0) return null;

    const totalOffWars = summaryNationTable.data.reduce((sum, row) => {
        return sum + (Number(row[offIdx]) || 0);
    }, 0);

    return {
        totalOffWars,
        totalNations,
        perNation: totalOffWars / totalNations,
    };
}

export function computeLeadingCoalition(
    coalitionSummary: CoalitionSummaryRow[] | null,
): CoalitionSummaryRow | null {
    if (!coalitionSummary || coalitionSummary.length === 0) return null;
    return coalitionSummary.reduce((best, row) =>
        row.net > best.net ? row : best,
    );
}
