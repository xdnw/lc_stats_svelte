import { commafy } from "./formatting";
import type { TableData } from "./types";

export function formatNumberValue(value: number): string {
    if (value === 0) return "0";
    if (value < 1000 && value > -1000) return value.toString();
    return commafy(value);
}

export function formatMoneyValue(value: number): string {
    if (value === 0) return "$0";
    if (value < 1000 && value > -1000) return `$${value.toString()}`;
    return `$${commafy(value)}`;
}

export function isMoneyColumn(
    cellFormat: TableData["cell_format"] | undefined,
    columnIndex: number,
): boolean {
    const moneyColumns = cellFormat?.formatMoney ?? [];
    return moneyColumns.includes(columnIndex);
}

export function formatMetricDisplay(
    table: TableData | null,
    metricIndex: number,
    value: number,
    isAavaMetric = false,
): string {
    if (isAavaMetric && metricIndex === -1) {
        if (Number.isFinite(value)) {
            if (Math.abs(value) <= 100 && `${value}`.includes(".")) {
                return value.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                });
            }
            return value.toLocaleString();
        }
        return "0";
    }

    const formatted = Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
    return isMoneyColumn(table?.cell_format, metricIndex)
        ? `$${formatted}`
        : formatted;
}