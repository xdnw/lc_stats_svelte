import { modalStrWithCloseButton } from './modals';

export interface ExportType {
    delimiter: string,
    ext: string,
    mime: string
}

export type ExportFormat = 'CSV' | 'TSV' | 'JSON';
export type ExportTarget = 'download' | 'clipboard';
export type ExportCell = string | number | boolean | null | undefined;
export type ExportSettingsValue = ExportCell | ExportCell[] | Set<ExportCell>;

export interface ExportDatasetOption {
    key: string;
    label: string;
    description?: string;
}

export interface ExportTableDataset {
    key: string;
    label: string;
    columns: string[];
    rows: ExportCell[][];
}

export interface ExportBundle {
    baseFileName: string;
    meta?: Record<string, unknown>;
    tables: ExportTableDataset[];
}

export interface ExportBundleRequest {
    bundle: ExportBundle;
    datasetKey: string;
    format: ExportFormat;
    target: ExportTarget;
}

function normalizeSettingsValue(
    value: ExportSettingsValue,
    listDelimiter: string,
): ExportCell {
    if (value instanceof Set) {
        return Array.from(value)
            .map((item) => (item == null ? '' : String(item)))
            .join(listDelimiter);
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => (item == null ? '' : String(item)))
            .join(listDelimiter);
    }
    return value;
}

export function buildSettingsRows(
    entries: Array<[string, ExportSettingsValue]>,
    listDelimiter = '|',
): ExportCell[][] {
    return entries.map(([key, value]) => [
        key,
        normalizeSettingsValue(value, listDelimiter),
    ]);
}

export const ExportTypes = {
    CSV: {
        delimiter: ',',
        ext: 'csv',
        mime: 'text/csv'
    },
    TSV: {
        delimiter: '\t',
        ext: 'tsv',
        mime: 'text/tab-separated-values'
    }
};

const ExportTypeByFormat: Record<Exclude<ExportFormat, 'JSON'>, ExportType> = {
    CSV: ExportTypes.CSV,
    TSV: ExportTypes.TSV,
};

export interface DownloadableTableData {
    columns: string[];
    data: any[][];
    visible: number[];
}

function escapeDelimitedValue(value: ExportCell, delimiter: string): string {
    if (value == null) return '';
    const str = String(value);
    const hasQuote = str.includes('"');
    const needsWrap =
        hasQuote ||
        str.includes('\n') ||
        str.includes('\r') ||
        str.includes(delimiter);
    if (!needsWrap) return str;
    return `"${str.replaceAll('"', '""')}"`;
}

function rowsToDelimitedText(
    rows: ExportCell[][],
    type: ExportType,
    includeSepHeader: boolean,
): string {
    const body = rows
        .map((row) => row.map((cell) => escapeDelimitedValue(cell, type.delimiter)).join(type.delimiter))
        .join('\n');
    return (includeSepHeader ? `sep=${type.delimiter}\n` : '') + body;
}

function writeTextExport(
    text: string,
    fileName: string,
    type: ExportType,
    target: ExportTarget,
): void {
    if (target === 'clipboard') {
        navigator.clipboard.writeText(text).catch((err) => {
            console.error('Failed to copy to clipboard', err);
        });
        modalStrWithCloseButton('Copied to clipboard', 'The selected export has been copied to your clipboard.');
        return;
    }

    const blob = new Blob([text], { type: `${type.mime};charset=utf-8;` });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    modalStrWithCloseButton('Download starting', 'Your selected export should begin downloading. If it does not, check browser settings or use copy instead.');
}

export function exportBundleData(request: ExportBundleRequest): boolean {
    const { bundle, datasetKey, format, target } = request;
    const dataset = bundle.tables.find((item) => item.key === datasetKey);
    if (!dataset) {
        modalStrWithCloseButton('Error', `Could not find export dataset: ${datasetKey}`);
        return false;
    }

    if (format === 'JSON') {
        const payload = {
            baseFileName: bundle.baseFileName,
            generatedAt: new Date().toISOString(),
            dataset: {
                key: dataset.key,
                label: dataset.label,
                columns: dataset.columns,
                rows: dataset.rows,
            },
            meta: bundle.meta ?? {},
        };
        const text = JSON.stringify(payload, null, 2);
        writeTextExport(text, `${bundle.baseFileName}-${dataset.key}.json`, {
            delimiter: ',',
            ext: 'json',
            mime: 'application/json',
        }, target);
        return true;
    }

    const type = ExportTypeByFormat[format];
    const rows: ExportCell[][] = [dataset.columns, ...dataset.rows];
    const text = rowsToDelimitedText(rows, type, true);
    writeTextExport(text, `${bundle.baseFileName}-${dataset.key}.${type.ext}`, type, target);
    return true;
}

export function downloadTableData(currentRowData: DownloadableTableData | null | undefined, useClipboard: boolean, type: ExportType) {
    if (!currentRowData) {
        modalStrWithCloseButton('Error', 'No data to download');
        return;
    }

    const visibleColumns = currentRowData.visible.map((index) => currentRowData.columns[index]);
    const tableData: any[][] = currentRowData.data.map((row) => currentRowData.visible.map((index) => row[index]));
    tableData.unshift(visibleColumns);
    downloadCells(tableData, useClipboard, type);
}

export function downloadTableElem(elem: HTMLTableElement, useClipboard: boolean, type: ExportType) {
    const table = $(elem).DataTable();
    const visibleColumnNames: string[] = [];
    const visibleColumnIds: Set<number> = new Set();

    table.columns().every(function (index: number) {
        if (table.column(index).visible()) {
            if (index === 0) return;
            visibleColumnNames.push(table.column(index).header().textContent || 'name');
            visibleColumnIds.add(index);
        }
    });

    const data2dInclHeaderNames: any[][] = [visibleColumnNames];

    table.rows({ search: 'applied' }).every(function (this: any) {
        const rowData: any[] = [];
        this.data().forEach((cellData: any, cellIdx: number) => {
            if (visibleColumnIds.has(cellIdx + 1)) {
                rowData.push(cellData);
            }
        });
        data2dInclHeaderNames.push(rowData);
    });

    downloadCells(data2dInclHeaderNames, useClipboard, type);
}

export function downloadCells(data: any[][], useClipboard: boolean, type: ExportType) {
    const fileContent = rowsToDelimitedText(data, type, !useClipboard);
    writeTextExport(
        fileContent,
        `data.${type.ext}`,
        type,
        useClipboard ? 'clipboard' : 'download',
    );
}

export async function copyShareLink(options?: {
    prepare?: () => void | Promise<void>;
}): Promise<boolean> {
    try {
        if (options?.prepare) {
            await options.prepare();
        }
        const href = window.location.href;
        await navigator.clipboard.writeText(href);
        modalStrWithCloseButton('Share link copied', 'The current page link has been copied to your clipboard.');
        return true;
    } catch (error) {
        console.error('Failed to copy share link', error);
        modalStrWithCloseButton('Copy failed', 'Could not copy the share link. Please copy the URL from your browser address bar.');
        return false;
    }
}
