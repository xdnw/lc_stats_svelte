import type { ExportFormat, ExportTarget } from "./dataExport";

export type ExportActionDefinition = {
    label: string;
    format: ExportFormat;
    target: ExportTarget;
    icon: string;
};

export type ExportActionCapabilities = {
    includeJson?: boolean;
};

export const EXPORT_ACTIONS: ExportActionDefinition[] = [
    {
        label: "Download CSV",
        format: "CSV",
        target: "download",
        icon: "bi-download",
    },
    {
        label: "Copy CSV",
        format: "CSV",
        target: "clipboard",
        icon: "bi-clipboard",
    },
    {
        label: "Download TSV",
        format: "TSV",
        target: "download",
        icon: "bi-download",
    },
    {
        label: "Copy TSV",
        format: "TSV",
        target: "clipboard",
        icon: "bi-clipboard",
    },
    {
        label: "Download JSON",
        format: "JSON",
        target: "download",
        icon: "bi-filetype-json",
    },
    {
        label: "Copy JSON",
        format: "JSON",
        target: "clipboard",
        icon: "bi-clipboard",
    },
];

export function resolveExportActions(
    capabilities?: ExportActionCapabilities,
): ExportActionDefinition[] {
    if (capabilities?.includeJson === false) {
        return EXPORT_ACTIONS.filter((action) => action.format !== "JSON");
    }

    return EXPORT_ACTIONS;
}