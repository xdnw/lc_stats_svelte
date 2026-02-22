import type { ExportDatasetOption, ExportFormat, ExportTarget } from "$lib";

export type ExportMenuAction = {
    datasetKey: string;
    format: ExportFormat;
    target: ExportTarget;
};

export type ExportMenuHandler = (action: ExportMenuAction) => void;

export type ExportMenuDataset = ExportDatasetOption;
