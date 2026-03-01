import { formatDate } from "./formatting";
import { formatMoneyValue, formatNumberValue } from "./numberFormatting";

export type DataTableRender = (
    data: unknown,
    type: unknown,
    row: unknown,
    meta: unknown,
) => unknown;

export type DownloadAction = (useClipboard: boolean, type: string) => void;

export type TableCallbacks = {
    cellFormatters?: Record<string, DataTableRender>;
    actions?: {
        download?: DownloadAction;
    };
};

const builtInCellFormatters: Record<string, DataTableRender> = {
    formatNumber: (data: unknown): string => {
        const value = typeof data === "number" ? data : Number(data ?? 0);
        return formatNumberValue(value);
    },
    formatMoney: (data: unknown): string => {
        const value = typeof data === "number" ? data : Number(data ?? 0);
        return formatMoneyValue(value);
    },
    formatDate: (data: unknown): string => {
        const value = typeof data === "number" ? data : null;
        return formatDate(value);
    },
};

export function resolveCellFormatter(
    name: string,
    callbacks?: TableCallbacks,
): DataTableRender | undefined {
    return callbacks?.cellFormatters?.[name] ?? builtInCellFormatters[name];
}