import { modalStrWithCloseButton } from './modals';

export interface ExportType {
    delimiter: string,
    ext: string,
    mime: string
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

export interface DownloadableTableData {
    columns: string[];
    data: any[][];
    visible: number[];
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
    const fileContent = (useClipboard ? '' : `sep=${type.delimiter}\n`) + data.map((row) => row.join(type.delimiter)).join('\n');

    if (useClipboard) {
        navigator.clipboard.writeText(fileContent).catch((err) => {
            console.error('Failed to copy to clipboard', err);
        });
        modalStrWithCloseButton('Copied to clipboard', 'The data for the currently selected columns has been copied to your clipboard.');
        return;
    }

    const blob = new Blob([fileContent], { type: `${type.mime};charset=utf-8;` });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `data.${type.ext}`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    modalStrWithCloseButton('Download starting', 'The data for the currently selected columns should begin downloading. If the download does not start, please check your browser settings, or try the clipboard button instead');
}

export async function copyShareLink(): Promise<boolean> {
    const href = window.location.href;
    try {
        await navigator.clipboard.writeText(href);
        modalStrWithCloseButton('Share link copied', 'The current page link has been copied to your clipboard.');
        return true;
    } catch (error) {
        console.error('Failed to copy share link', error);
        modalStrWithCloseButton('Copy failed', 'Could not copy the share link. Please copy the URL from your browser address bar.');
        return false;
    }
}
