import { formatCompactNumberValue } from "./numberFormatting";
import { formatDaysToDate, formatTurnsToDate } from "./formatting";
import type {
    MetricTimeSeriesEntry,
    MetricTimeSeriesResult,
} from "./metricTimeCompute";
import type { TierMetric } from "./types";

export type MetricTimeCanvasModel = {
    metric: TierMetric;
    isTurn: boolean;
    timeRange: [number, number];
    yDomain: [number, number];
    series: MetricTimeSeriesEntry[];
};

export type MetricTimeHoverDatum = {
    seriesKey: string;
    label: string;
    color: string;
    coalitionIndex: 0 | 1;
    allianceId?: number;
    time: number;
    value: number;
    canvasX: number;
    canvasY: number;
};

type LinearScale = {
    domain: [number, number];
    range: [number, number];
    scale: (value: number) => number;
    invert: (value: number) => number;
};

export type MetricTimeCanvasRenderResult = {
    cssWidth: number;
    cssHeight: number;
    plotArea: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    xScale: LinearScale;
    yScale: LinearScale;
    model: MetricTimeCanvasModel | null;
};

const MAX_X_TICKS = 8;
const Y_AXIS_TICK_COUNT = 5;
const HOVER_MAX_DISTANCE_PX = 28;

export function formatMetricTimeMetricLabel(metric: TierMetric): string {
    let label = metric.name;
    if (metric.cumulative) {
        label += " (sum)";
    }
    if (metric.normalize) {
        label += " (avg)";
    }
    return label;
}

function resolveCanvasColor(
    styles: CSSStyleDeclaration,
    variableName: string,
    fallback: string,
): string {
    const resolved = styles.getPropertyValue(variableName).trim();
    return resolved || fallback;
}

function createLinearScale(
    domain: [number, number],
    range: [number, number],
): LinearScale {
    const domainSpan = domain[1] - domain[0];
    const rangeSpan = range[1] - range[0];
    const normalizedDomainSpan = domainSpan === 0 ? 1 : domainSpan;

    return {
        domain,
        range,
        scale(value: number): number {
            const ratio = (value - domain[0]) / normalizedDomainSpan;
            return range[0] + ratio * rangeSpan;
        },
        invert(value: number): number {
            const ratio = rangeSpan === 0 ? 0 : (value - range[0]) / rangeSpan;
            return domain[0] + ratio * normalizedDomainSpan;
        },
    };
}

function computeExpandedYDomain(yDomain: [number, number]): [number, number] {
    const [minValue, maxValue] = yDomain;
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return [0, 1];
    }

    if (minValue === maxValue) {
        const delta = minValue === 0 ? 1 : Math.abs(minValue) * 0.1;
        return [minValue - delta, maxValue + delta];
    }

    const span = maxValue - minValue;
    const padding = span * 0.08;
    return [minValue - padding, maxValue + padding];
}

function buildTickValues(domain: [number, number], maxTicks: number): number[] {
    const [minValue, maxValue] = domain;
    const span = maxValue - minValue;
    if (span <= 0) {
        return [minValue];
    }

    const tickCount = Math.max(2, Math.min(maxTicks, span + 1));
    const step = span / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, index) =>
        index === tickCount - 1
            ? maxValue
            : Math.round((minValue + step * index) * 1000) / 1000,
    );
}

function buildYTicks(domain: [number, number]): number[] {
    const [minValue, maxValue] = domain;
    const span = maxValue - minValue;
    if (span <= 0) {
        return [minValue];
    }

    return Array.from({ length: Y_AXIS_TICK_COUNT }, (_, index) =>
        minValue + (span * index) / (Y_AXIS_TICK_COUNT - 1),
    );
}

function formatTimeTick(value: number, isTurn: boolean): string {
    return isTurn ? formatTurnsToDate(value) : formatDaysToDate(value);
}

function buildLinePath(
    context: CanvasRenderingContext2D,
    series: MetricTimeSeriesEntry,
    xScale: LinearScale,
    yScale: LinearScale,
    timeStart: number,
): void {
    let started = false;

    for (let index = 0; index < series.values.length; index += 1) {
        const value = series.values[index];
        if (!Number.isFinite(value)) {
            started = false;
            continue;
        }

        const time = timeStart + index;
        const x = xScale.scale(time);
        const y = yScale.scale(value);
        if (!started) {
            context.moveTo(x, y);
            started = true;
            continue;
        }
        context.lineTo(x, y);
    }
}

export function buildMetricTimeCanvasModel(
    seriesResult: MetricTimeSeriesResult | null,
): MetricTimeCanvasModel | null {
    if (!seriesResult) return null;
    return seriesResult;
}

export function clearMetricTimeCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
}

export function renderMetricTimeCanvas(options: {
    canvas: HTMLCanvasElement;
    model: MetricTimeCanvasModel | null;
}): MetricTimeCanvasRenderResult {
    const { canvas, model } = options;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = typeof window !== "undefined"
        ? window.devicePixelRatio || 1
        : 1;
    const pixelWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    const styles = getComputedStyle(canvas);
    const axisColor = resolveCanvasColor(
        styles,
        "--metric-time-axis-color",
        "rgba(71, 85, 105, 0.92)",
    );
    const gridColor = resolveCanvasColor(
        styles,
        "--metric-time-grid-color",
        "rgba(148, 163, 184, 0.22)",
    );
    const textColor = resolveCanvasColor(
        styles,
        "--metric-time-text-color",
        styles.color || "#1f2937",
    );
    const emptyColor = resolveCanvasColor(
        styles,
        "--metric-time-empty-color",
        textColor,
    );

    const margins = {
        top: 18,
        right: 18,
        bottom: 68,
        left: 64,
    };
    const plotArea = {
        left: margins.left,
        top: margins.top,
        right: Math.max(margins.left + 1, cssWidth - margins.right),
        bottom: Math.max(margins.top + 1, cssHeight - margins.bottom),
    };
    const xScale = createLinearScale([0, 1], [plotArea.left, plotArea.right]);
    const yScale = createLinearScale([0, 1], [plotArea.bottom, plotArea.top]);

    if (!context) {
        return {
            cssWidth,
            cssHeight,
            plotArea,
            xScale,
            yScale,
            model,
        };
    }

    context.save();
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    if (!model || model.series.length === 0) {
        context.fillStyle = emptyColor;
        context.font = "600 14px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("No metric timeline available", cssWidth / 2, cssHeight / 2);
        context.restore();
        return {
            cssWidth,
            cssHeight,
            plotArea,
            xScale,
            yScale,
            model,
        };
    }

    const expandedYDomain = computeExpandedYDomain(model.yDomain);
    const resolvedXScale = createLinearScale(
        model.timeRange,
        [plotArea.left, plotArea.right],
    );
    const resolvedYScale = createLinearScale(
        expandedYDomain,
        [plotArea.bottom, plotArea.top],
    );

    context.font = "12px system-ui, sans-serif";
    context.lineWidth = 1;

    for (const tick of buildYTicks(expandedYDomain)) {
        const y = resolvedYScale.scale(tick);
        context.strokeStyle = gridColor;
        context.beginPath();
        context.moveTo(plotArea.left, y);
        context.lineTo(plotArea.right, y);
        context.stroke();

        context.fillStyle = textColor;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(formatCompactNumberValue(tick), plotArea.left - 10, y);
    }

    context.strokeStyle = axisColor;
    context.beginPath();
    context.moveTo(plotArea.left, plotArea.top);
    context.lineTo(plotArea.left, plotArea.bottom);
    context.lineTo(plotArea.right, plotArea.bottom);
    context.stroke();

    const xTicks = buildTickValues(model.timeRange, MAX_X_TICKS);
    context.fillStyle = textColor;
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (const tick of xTicks) {
        const x = resolvedXScale.scale(tick);
        context.strokeStyle = gridColor;
        context.beginPath();
        context.moveTo(x, plotArea.top);
        context.lineTo(x, plotArea.bottom);
        context.stroke();
        context.save();
        context.translate(x, plotArea.bottom + 10);
        context.rotate(-Math.PI / 4);
        context.fillText(formatTimeTick(tick, model.isTurn), 0, 0);
        context.restore();
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.font = "600 13px system-ui, sans-serif";
    context.fillStyle = textColor;
    context.fillText(
        formatMetricTimeMetricLabel(model.metric),
        plotArea.left,
        13,
    );

    for (const series of model.series) {
        context.beginPath();
        buildLinePath(context, series, resolvedXScale, resolvedYScale, model.timeRange[0]);
        context.strokeStyle = series.color;
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();
    }

    context.restore();
    return {
        cssWidth,
        cssHeight,
        plotArea,
        xScale: resolvedXScale,
        yScale: resolvedYScale,
        model,
    };
}

export function findMetricTimeHoverDatum(
    renderResult: MetricTimeCanvasRenderResult | null,
    x: number,
    y: number,
): MetricTimeHoverDatum | null {
    if (!renderResult?.model) return null;
    const { plotArea, model, xScale, yScale } = renderResult;
    if (
        x < plotArea.left ||
        x > plotArea.right ||
        y < plotArea.top ||
        y > plotArea.bottom
    ) {
        return null;
    }

    const time = Math.max(
        model.timeRange[0],
        Math.min(
            model.timeRange[1],
            Math.round(xScale.invert(x)),
        ),
    );
    const index = time - model.timeRange[0];
    let bestMatch: MetricTimeHoverDatum | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const series of model.series) {
        const value = series.values[index];
        if (!Number.isFinite(value)) continue;
        const canvasY = yScale.scale(value);
        const distance = Math.abs(y - canvasY);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestMatch = {
            seriesKey: series.key,
            label: series.label,
            color: series.color,
            coalitionIndex: series.coalitionIndex,
            allianceId: series.allianceId,
            time,
            value,
            canvasX: xScale.scale(time),
            canvasY,
        };
    }

    return bestDistance <= HOVER_MAX_DISTANCE_PX ? bestMatch : null;
}
