import { formatCompactNumberValue } from "./numberFormatting";

export type TieringCanvasDataset = {
    label: string;
    data: number[];
    backgroundColor: string;
    stack: string;
};

export type TieringCanvasModel = {
    title: string;
    labels: (string | number)[];
    datasets: TieringCanvasDataset[];
};

export type TieringCanvasHoverBar = {
    labelIndex: number;
    label: string | number;
    stack: string;
    stackIndex: number;
    datasetLabel: string;
    segmentValue: number;
    stackTotal: number;
    color: string;
    canvasX: number;
    canvasY: number;
    left: number;
    top: number;
    width: number;
    height: number;
};

export type TieringCanvasRenderResult = {
    bars: TieringCanvasHoverBar[];
};

export type TieringLegendItem = {
    label: string;
    color: string;
    stack: string;
};

type StackGroup = {
    key: string;
    datasets: TieringCanvasDataset[];
};

const MAX_X_TICKS = 12;
const Y_AXIS_TICK_COUNT = 5;
const TIERING_HOVER_HIT_SLOP_PX = 4;

function buildStackGroups(datasets: TieringCanvasDataset[]): StackGroup[] {
    const groups = new Map<string, StackGroup>();
    for (const dataset of datasets) {
        const existing = groups.get(dataset.stack);
        if (existing) {
            existing.datasets.push(dataset);
            continue;
        }

        groups.set(dataset.stack, {
            key: dataset.stack,
            datasets: [dataset],
        });
    }

    return Array.from(groups.values());
}

function buildTickIndices(length: number, maxTicks: number): number[] {
    if (length <= 0) return [];
    if (length <= maxTicks) {
        return Array.from({ length }, (_, index) => index);
    }

    const step = Math.ceil(length / maxTicks);
    const indices: number[] = [];
    for (let index = 0; index < length; index += step) {
        indices.push(index);
    }
    if (indices[indices.length - 1] !== length - 1) {
        indices.push(length - 1);
    }
    return indices;
}

function computeNiceMax(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / exponent;
    if (normalized <= 1) return exponent;
    if (normalized <= 2) return 2 * exponent;
    if (normalized <= 5) return 5 * exponent;
    return 10 * exponent;
}

function computeMaxStackTotal(
    labelCount: number,
    stackGroups: StackGroup[],
): number {
    let maxTotal = 0;
    for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
        for (const stackGroup of stackGroups) {
            let total = 0;
            for (const dataset of stackGroup.datasets) {
                total += Math.max(0, dataset.data[labelIndex] ?? 0);
            }
            if (total > maxTotal) {
                maxTotal = total;
            }
        }
    }
    return maxTotal;
}

function formatAxisValue(value: number): string {
    return formatCompactNumberValue(value);
}

function resolveCanvasColor(
    styles: CSSStyleDeclaration,
    variableName: string,
    fallback: string,
): string {
    const resolved = styles.getPropertyValue(variableName).trim();
    return resolved || fallback;
}

export function buildTieringLegendItems(
    datasets: TieringCanvasDataset[],
): TieringLegendItem[] {
    return datasets.map((dataset) => ({
        label: dataset.label,
        color: dataset.backgroundColor,
        stack: dataset.stack,
    }));
}

export function clearTieringCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
}

export function renderTieringCanvas(options: {
    canvas: HTMLCanvasElement;
    model: TieringCanvasModel;
}): TieringCanvasRenderResult {
    const { canvas, model } = options;
    const context = canvas.getContext("2d");
    if (!context) {
        return { bars: [] };
    }

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
        "--tiering-axis-color",
        "rgba(100, 116, 139, 0.9)",
    );
    const gridColor = resolveCanvasColor(
        styles,
        "--tiering-grid-color",
        "rgba(148, 163, 184, 0.22)",
    );
    const textColor = resolveCanvasColor(
        styles,
        "--tiering-text-color",
        styles.color || "#1f2937",
    );

    context.save();
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    const bars: TieringCanvasHoverBar[] = [];

    if (model.labels.length === 0 || model.datasets.length === 0) {
        context.fillStyle = textColor;
        context.font = "600 14px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("No chart data", cssWidth / 2, cssHeight / 2);
        context.restore();
        return { bars };
    }

    const margins = {
        top: 12,
        right: 16,
        bottom: 52,
        left: 64,
    };
    const plotLeft = margins.left;
    const plotTop = margins.top;
    const plotWidth = Math.max(1, cssWidth - margins.left - margins.right);
    const plotHeight = Math.max(1, cssHeight - margins.top - margins.bottom);
    const plotRight = plotLeft + plotWidth;
    const plotBottom = plotTop + plotHeight;
    const stackGroups = buildStackGroups(model.datasets);
    const labelCount = model.labels.length;
    const stackCount = Math.max(1, stackGroups.length);
    const yMax = computeNiceMax(computeMaxStackTotal(labelCount, stackGroups));
    const yTickDivisor = Y_AXIS_TICK_COUNT - 1;

    context.lineWidth = 1;
    context.font = "12px system-ui, sans-serif";

    for (let tickIndex = 0; tickIndex < Y_AXIS_TICK_COUNT; tickIndex++) {
        const ratio = tickIndex / yTickDivisor;
        const y = plotBottom - ratio * plotHeight;
        const value = yMax * ratio;

        context.strokeStyle = gridColor;
        context.beginPath();
        context.moveTo(plotLeft, y);
        context.lineTo(plotRight, y);
        context.stroke();

        context.fillStyle = textColor;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(formatAxisValue(value), plotLeft - 10, y);
    }

    context.strokeStyle = axisColor;
    context.beginPath();
    context.moveTo(plotLeft, plotTop);
    context.lineTo(plotLeft, plotBottom);
    context.lineTo(plotRight, plotBottom);
    context.stroke();

    const groupWidth = plotWidth / labelCount;
    const usableGroupWidth = Math.max(1, groupWidth * 0.84);
    const stackSlotWidth = usableGroupWidth / stackCount;
    const barWidth = Math.max(1, stackSlotWidth * 0.82);
    const groupOffset = (groupWidth - usableGroupWidth) / 2;

    for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
        const groupStartX = plotLeft + labelIndex * groupWidth + groupOffset;

        for (let stackIndex = 0; stackIndex < stackGroups.length; stackIndex++) {
            const stackGroup = stackGroups[stackIndex];
            const barX = groupStartX + stackIndex * stackSlotWidth + (stackSlotWidth - barWidth) / 2;
            let stackTotal = 0;
            for (const dataset of stackGroup.datasets) {
                stackTotal += Math.max(0, dataset.data[labelIndex] ?? 0);
            }
            let currentTop = plotBottom;

            for (const dataset of stackGroup.datasets) {
                const value = Math.max(0, dataset.data[labelIndex] ?? 0);
                if (value <= 0) continue;
                const height = (value / yMax) * plotHeight;
                const drawHeight = Math.max(1, height);
                const nextTop = currentTop - drawHeight;
                context.fillStyle = dataset.backgroundColor;
                context.fillRect(barX, nextTop, barWidth, drawHeight);
                bars.push({
                    labelIndex,
                    label: model.labels[labelIndex] ?? labelIndex,
                    stack: dataset.stack,
                    stackIndex,
                    datasetLabel: dataset.label,
                    segmentValue: value,
                    stackTotal,
                    color: dataset.backgroundColor,
                    canvasX: barX + barWidth / 2,
                    canvasY: nextTop,
                    left: barX,
                    top: nextTop,
                    width: barWidth,
                    height: drawHeight,
                });
                currentTop = nextTop;
            }
        }
    }

    const tickIndices = buildTickIndices(labelCount, MAX_X_TICKS);
    context.fillStyle = textColor;
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (const tickIndex of tickIndices) {
        const tickX = plotLeft + (tickIndex + 0.5) * groupWidth;
        const label = String(model.labels[tickIndex] ?? "");
        context.save();
        context.translate(tickX, plotBottom + 10);
        context.rotate(-Math.PI / 4);
        context.fillText(label, 0, 0);
        context.restore();
    }

    context.restore();
    return { bars };
}

export function findTieringCanvasHoverBar(
    renderResult: TieringCanvasRenderResult | null,
    x: number,
    y: number,
): TieringCanvasHoverBar | null {
    if (!renderResult) return null;

    for (let index = renderResult.bars.length - 1; index >= 0; index--) {
        const bar = renderResult.bars[index];
        const left = bar.left - TIERING_HOVER_HIT_SLOP_PX;
        const right = bar.left + bar.width + TIERING_HOVER_HIT_SLOP_PX;
        const top = bar.top - TIERING_HOVER_HIT_SLOP_PX;
        const bottom = bar.top + bar.height + TIERING_HOVER_HIT_SLOP_PX;
        if (x < left || x > right || y < top || y > bottom) {
            continue;
        }

        return bar;
    }

    return null;
}