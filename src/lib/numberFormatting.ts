import { commafy } from "./formatting";
import type { TableData } from "./types";

export function formatNumberValue(value: number): string {
    if (value === 0) return "0";
    if (value < 1000 && value > -1000) return value.toString();
    return commafy(value);
}

export function formatCompactNumberValue(value: number): string {
    if (!Number.isFinite(value)) return "0";

    const abs = Math.abs(value);
    const suffixes = [
        { value: 1e12, suffix: "T" },
        { value: 1e9, suffix: "B" },
        { value: 1e6, suffix: "M" },
        { value: 1e3, suffix: "K" },
    ];

    for (const unit of suffixes) {
        if (abs < unit.value) continue;
        const scaled = value / unit.value;
        const scaledAbs = Math.abs(scaled);
        const maximumFractionDigits =
            scaledAbs >= 100 ? 0 : scaledAbs >= 10 ? 1 : 2;
        return `${scaled.toLocaleString(undefined, {
            maximumFractionDigits,
        })}${unit.suffix}`;
    }

    return value.toLocaleString(undefined, {
        maximumFractionDigits: abs < 10 ? 2 : abs < 100 ? 1 : 0,
    });
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