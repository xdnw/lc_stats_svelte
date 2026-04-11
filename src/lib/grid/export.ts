import {
    exportBundleData,
    type ExportCell,
    type ExportFormat,
    type ExportTarget,
} from "../dataExport";
import type { GridDataProvider, GridQueryState } from "./types";

function coerceExportCell(value: unknown): ExportCell {
    if (
        value == null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    return String(value);
}

export async function exportGridData(options: {
    provider: GridDataProvider;
    state: GridQueryState;
    baseFileName: string;
    datasetKey?: string;
    datasetLabel?: string;
    format: ExportFormat;
    target: ExportTarget;
}): Promise<boolean> {
    const exported = await options.provider.exportRows(options.state);
    const rows = exported.rows.map((row) => row.map((cell) => coerceExportCell(cell)));
    return exportBundleData({
        bundle: {
            baseFileName: options.baseFileName,
            tables: [
                {
                    key: options.datasetKey ?? "grid",
                    label: options.datasetLabel ?? "Current table",
                    columns: exported.columns,
                    rows,
                },
            ],
        },
        datasetKey: options.datasetKey ?? "grid",
        format: options.format,
        target: options.target,
    });
}
