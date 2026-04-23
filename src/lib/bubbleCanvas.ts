import {
    buildBubbleChartModel,
    buildCompactLabel,
    clearBubbleChart,
    clampBubbleFrameIndex,
    findBubbleHoverPoint,
    renderBubbleChart,
    type BubbleChartConfig,
    type BubbleChartHoverPoint,
    type BubbleChartModel as SharedBubbleChartModel,
    type BubbleChartRenderResult,
    type BubbleChartTheme,
} from "../components/bubble";
import type { BubbleChartDatum } from "../components/bubble";
import { Palette, generateColors, palettePrimary } from "./colors";
import { formatDaysToDate, formatTurnsToDate } from "./formatting";
import type { TraceBuildResult } from "./graphDerivedCache";
import type { TierMetric } from "./types";

export type BubbleCanvasLegendItem = {
    label: string;
    color: string;
};

export type BubbleCanvasPointMeta = {
    allianceId: number;
    coalitionId: number;
    coalitionName: string;
    time: number;
    timeLabel: string;
};

export type BubbleCanvasFrame = {
    index: number;
    time: number;
    label: string;
    pointCount: number;
    maxSizeValue: number;
};

export type BubbleCanvasModel = {
    chartModel: SharedBubbleChartModel<BubbleCanvasPointMeta>;
    chartConfig: BubbleChartConfig;
    frames: BubbleCanvasFrame[];
    xLabel: string;
    yLabel: string;
    sizeLabel: string;
    xDomain: [number, number];
    yDomain: [number, number];
    legendItems: BubbleCanvasLegendItem[];
};

export type BubbleCanvasHoverPoint =
    BubbleChartHoverPoint<BubbleCanvasPointMeta>;
export type BubbleCanvasRenderResult =
    BubbleChartRenderResult<BubbleCanvasPointMeta>;

const DEFAULT_BUBBLE_LIGHT_THEME: Partial<BubbleChartTheme> = {
    backgroundColor: "transparent",
    axisColor: "rgba(71, 85, 105, 0.95)",
    gridColor: "rgba(148, 163, 184, 0.24)",
    textColor: "rgb(15, 23, 42)",
    mutedTextColor: "rgba(71, 85, 105, 0.9)",
    bubbleStrokeColor: "rgba(15, 23, 42, 0.12)",
    bubbleStrokeWidth: 1,
    bubbleOpacity: 0.8,
    trailOpacity: 0.34,
    trailWidth: 1.35,
    labelStrokeColor: "rgba(248, 250, 252, 0.86)",
    labelStrokeWidth: 2,
    labelFillColor: "rgba(15, 23, 42, 0.96)",
    fontFamily: "system-ui, sans-serif",
    tickFontSize: 12,
    axisLabelFontSize: 13,
    bubbleLabelMinFontSize: 8,
    bubbleLabelMaxFontSize: 12,
};

const DEFAULT_BUBBLE_DARK_THEME: Partial<BubbleChartTheme> = {
    ...DEFAULT_BUBBLE_LIGHT_THEME,
    axisColor: "rgba(226, 232, 240, 0.92)",
    gridColor: "rgba(148, 163, 184, 0.26)",
    textColor: "rgba(241, 245, 249, 0.98)",
    mutedTextColor: "rgba(203, 213, 225, 0.9)",
    bubbleStrokeColor: "rgba(226, 232, 240, 0.18)",
};

function metricLabel(metric: TierMetric): string {
    let fullName = metric.name;
    if (metric.cumulative) {
        fullName += " (sum)";
    }
    if (metric.normalize) {
        fullName += " (avg)";
    }
    return fullName;
}

function fallbackColor(index: number): string {
    return `rgb(${palettePrimary[index % palettePrimary.length]})`;
}

function resolvePalette(coalitionId: number): Palette {
    switch (coalitionId) {
        case 0:
            return Palette.REDS;
        case 1:
            return Palette.BLUES;
        case 2:
            return Palette.GREENS;
        default:
            return Palette.NEUTRALS;
    }
}

function buildTimeLabel(value: number, isTurn: boolean): string {
    return isTurn ? formatTurnsToDate(value) : formatDaysToDate(value);
}

function collectCoalitionIds(
    traces: TraceBuildResult["traces"],
    coalitionNames: string[],
): number[] {
    const coalitionIds = new Set<number>();

    for (const frame of Object.values(traces)) {
        for (const coalitionId of Object.keys(frame ?? {})) {
            coalitionIds.add(Number(coalitionId));
        }
    }

    if (coalitionIds.size === 0) {
        coalitionNames.forEach((_name, coalitionId) => {
            coalitionIds.add(coalitionId);
        });
    }

    return Array.from(coalitionIds).sort((left, right) => left - right);
}

function buildColorLookup(options: {
    lookup: TraceBuildResult["traces"];
    coalitionIds: number[];
    coalitionNames: string[];
}): {
    colorBySeriesKey: Map<string, string>;
    legendItems: BubbleCanvasLegendItem[];
} {
    const colorBySeriesKey = new Map<string, string>();
    const legendItems: BubbleCanvasLegendItem[] = [];
    const times = Object.keys(options.lookup)
        .map(Number)
        .sort((left, right) => left - right);

    for (const coalitionId of options.coalitionIds) {
        const seenAllianceIds = new Set<number>();
        const allianceIds: number[] = [];

        for (const time of times) {
            const trace = options.lookup[time]?.[coalitionId];
            if (!trace) continue;
            for (const allianceId of trace.id ?? []) {
                if (seenAllianceIds.has(allianceId)) continue;
                seenAllianceIds.add(allianceId);
                allianceIds.push(allianceId);
            }
        }

        const colors = generateColors(
            Math.max(allianceIds.length, 1),
            resolvePalette(coalitionId),
        );

        legendItems.push({
            label:
                options.coalitionNames[coalitionId] ??
                `Coalition ${coalitionId + 1}`,
            color: colors[0] ?? fallbackColor(coalitionId),
        });

        allianceIds.forEach((allianceId, index) => {
            colorBySeriesKey.set(
                `${coalitionId}:${allianceId}`,
                colors[index] ?? fallbackColor(coalitionId + index),
            );
        });
    }

    return { colorBySeriesKey, legendItems };
}

function buildFramePointCounts(
    traces: TraceBuildResult["traces"],
    coalitionIds: number[],
    time: number,
): { pointCount: number; maxSizeValue: number } {
    let pointCount = 0;
    let maxSizeValue = 0;

    for (const coalitionId of coalitionIds) {
        const trace = traces[time]?.[coalitionId];
        if (!trace) continue;
        pointCount += trace.id.length;
        for (const value of trace.customdata ?? []) {
            if (Number.isFinite(value)) {
                maxSizeValue = Math.max(maxSizeValue, value);
            }
        }
    }

    return { pointCount, maxSizeValue };
}

export function buildBubbleCompactLabel(label: string): string {
    return buildCompactLabel(label);
}

export function getBubbleCanvasTheme(
    isDarkMode: boolean,
): Partial<BubbleChartTheme> {
    return isDarkMode
        ? { ...DEFAULT_BUBBLE_DARK_THEME }
        : { ...DEFAULT_BUBBLE_LIGHT_THEME };
}

export function buildBubbleCanvasModel(options: {
    traceBuildResult: TraceBuildResult;
    coalitionNames: string[];
    metrics: [TierMetric, TierMetric, TierMetric];
    isDarkMode?: boolean;
}): BubbleCanvasModel | null {
    const { traceBuildResult, coalitionNames, metrics, isDarkMode = false } =
        options;
    const times = Object.keys(traceBuildResult.traces)
        .map(Number)
        .sort((left, right) => left - right);
    if (times.length === 0) return null;

    const coalitionIds = collectCoalitionIds(
        traceBuildResult.traces,
        coalitionNames,
    );
    const { colorBySeriesKey, legendItems } = buildColorLookup({
        lookup: traceBuildResult.traces,
        coalitionIds,
        coalitionNames,
    });

    const frames: BubbleCanvasFrame[] = times.map((time, index) => {
        const { pointCount, maxSizeValue } = buildFramePointCounts(
            traceBuildResult.traces,
            coalitionIds,
            time,
        );
        return {
            index,
            time,
            label: buildTimeLabel(time, traceBuildResult.times.is_turn),
            pointCount,
            maxSizeValue,
        };
    });

    const data: BubbleChartDatum<BubbleCanvasPointMeta>[] = [];
    for (const frame of frames) {
        const frameLookup = traceBuildResult.traces[frame.time] ?? {};

        for (const coalitionId of coalitionIds) {
            const trace = frameLookup[coalitionId];
            if (!trace) continue;

            const coalitionName =
                coalitionNames[coalitionId] ?? `Coalition ${coalitionId + 1}`;

            for (let index = 0; index < trace.id.length; index += 1) {
                const allianceId = trace.id[index];
                const seriesId = `${coalitionId}:${allianceId}`;
                data.push({
                    seriesId,
                    frameId: frame.time,
                    frameLabel: frame.label,
                    x: trace.x[index] ?? 0,
                    y: trace.y[index] ?? 0,
                    size: trace.customdata[index] ?? 0,
                    label: trace.text[index] ?? `AA:${allianceId}`,
                    color:
                        colorBySeriesKey.get(seriesId) ??
                        fallbackColor(coalitionId + index),
                    meta: {
                        allianceId,
                        coalitionId,
                        coalitionName,
                        time: frame.time,
                        timeLabel: frame.label,
                    },
                });
            }
        }
    }

    const xLabel = metricLabel(metrics[0]);
    const yLabel = metricLabel(metrics[1]);
    const sizeLabel = metricLabel(metrics[2]);
    const chartConfig: BubbleChartConfig = {
        model: {
            frames: frames.map((frame) => ({
                id: frame.time,
                label: frame.label,
            })),
            frameSort: "numeric-asc",
            paddingRatio: 0.08,
        },
        render: {
            xLabel,
            yLabel,
            sizeLabel,
            sizeScaleMode: "frame",
            showGrid: true,
            showAxes: true,
            showTickLabels: true,
            showAxisLabels: true,
            showBubbleLabels: true,
            showTrails: true,
            sortBubbles: "size-asc",
            labelMode: "auto",
            labelMinRadius: 11,
            emptyMessage: "No points for this time frame",
            maxDevicePixelRatio: 1.5,
        },
        theme: getBubbleCanvasTheme(isDarkMode),
    };

    const chartModel = buildBubbleChartModel(
        data,
        chartConfig.model,
    );
    if (!chartModel) return null;

    return {
        chartModel,
        chartConfig,
        frames,
        xLabel,
        yLabel,
        sizeLabel,
        xDomain: chartModel.xDomain,
        yDomain: chartModel.yDomain,
        legendItems,
    };
}

export function clearBubbleCanvas(canvas: HTMLCanvasElement | null): void {
    clearBubbleChart(canvas);
}

export function renderBubbleCanvas(options: {
    canvas: HTMLCanvasElement;
    model: BubbleCanvasModel;
    activeFrameIndex: number;
}): BubbleCanvasRenderResult {
    return renderBubbleChart({
        canvas: options.canvas,
        model: options.model.chartModel,
        frameIndex: options.activeFrameIndex,
        renderConfig: options.model.chartConfig.render,
        theme: options.model.chartConfig.theme,
    });
}

export function findBubbleCanvasHoverPoint(
    renderResult: BubbleCanvasRenderResult | null,
    x: number,
    y: number,
): BubbleCanvasHoverPoint | null {
    return findBubbleHoverPoint(renderResult, x, y);
}

export { clampBubbleFrameIndex };
