import { resolveBubbleChartRenderConfig, resolveBubbleChartTheme } from "./config";
import { formatCompactNumber } from "./format";
import { computeBubbleChartPlotArea } from "./layout";
import { buildCompactLabel } from "./labels";
import {
  clampBubbleFrameIndex,
  getBubbleChartFramePointOrderInternal,
} from "./model";
import { getBubbleRadius, getBubbleSizeRatio } from "./radius";
import { createLinearScale } from "./scales";
import type {
  BubbleChartDomain,
  BubbleChartCssPoint,
  BubbleChartRenderCache,
  BubbleChartScene,
  BubbleChartSceneOptions,
  BubbleChartScenePoint,
  BubbleChartSceneTrail,
  BubbleChartSeriesPoint,
  BubbleChartTextMeasureContext,
  BubbleChartTick,
} from "./types";

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeVisibleDomain(
  domain: BubbleChartDomain | undefined,
  fallback: BubbleChartDomain
): BubbleChartDomain {
  if (!domain || !Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) {
    return [fallback[0], fallback[1]];
  }

  let min = domain[0];
  let max = domain[1];
  if (min > max) [min, max] = [max, min];
  if (min === max) return [fallback[0], fallback[1]];
  return [min, max];
}

function sanitizeSizeMultiplier(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0.25, Math.min(4, value));
}

function measureTextWidthCached(
  context: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  text: string
): number {
  const key = `${font}|${text}`;
  if (cache?.textWidth.has(key)) {
    return cache.textWidth.get(key)!;
  }
  context.font = font;
  const width = context.measureText(text).width;
  cache?.textWidth.set(key, width);
  return width;
}

function getCompactLabelCached(
  cache: BubbleChartRenderCache | undefined,
  label: string
): string {
  if (!cache) return buildCompactLabel(label);
  if (cache.compactLabel.has(label)) return cache.compactLabel.get(label)!;
  const compact = buildCompactLabel(label);
  cache.compactLabel.set(label, compact);
  return compact;
}

function fitLabelToWidthCached(
  context: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  label: string,
  maxWidth: number
): string {
  const text = label.trim();
  if (!text || !Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (measureTextWidthCached(context, cache, font, text) <= maxWidth) return text;

  const ellipsis = "…";
  if (measureTextWidthCached(context, cache, font, ellipsis) > maxWidth) return "";

  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  let best = "";

  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = `${chars.slice(0, mid).join("")}${ellipsis}`;
    if (measureTextWidthCached(context, cache, font, candidate) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function resolveBubbleLabelCached(
  context: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  label: string,
  maxWidth: number,
  mode: "auto" | "full" | "compact" | "truncate" | "none"
): string {
  const full = label.trim();
  if (!full) return "";
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (mode === "none") return "";

  const roundedMaxWidth = Math.max(0, Math.round(maxWidth));
  const key = `${font}|${roundedMaxWidth}|${mode}|${full}`;
  if (cache?.resolvedLabel.has(key)) {
    return cache.resolvedLabel.get(key)!;
  }

  const compact = getCompactLabelCached(cache, full);
  let result = "";

  if (mode === "auto") {
    if (measureTextWidthCached(context, cache, font, full) <= maxWidth) {
      result = full;
    } else if (
      compact &&
      compact !== full &&
      measureTextWidthCached(context, cache, font, compact) <= maxWidth
    ) {
      result = compact;
    } else {
      const truncatedCompact =
        compact && compact !== full
          ? fitLabelToWidthCached(context, cache, font, compact, maxWidth)
          : "";
      result =
        truncatedCompact ||
        fitLabelToWidthCached(context, cache, font, full, maxWidth);
    }
  } else if (mode === "full") {
    result =
      measureTextWidthCached(context, cache, font, full) <= maxWidth
        ? full
        : fitLabelToWidthCached(context, cache, font, full, maxWidth);
  } else if (mode === "compact") {
    const chosen = compact || full;
    result =
      measureTextWidthCached(context, cache, font, chosen) <= maxWidth
        ? chosen
        : fitLabelToWidthCached(context, cache, font, chosen, maxWidth);
  } else if (mode === "truncate") {
    result = fitLabelToWidthCached(context, cache, font, full, maxWidth);
  }

  cache?.resolvedLabel.set(key, result);
  return result;
}

function intersectsPlotArea(
  x: number,
  y: number,
  radius: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): boolean {
  return (
    x + radius >= left &&
    x - radius <= right &&
    y + radius >= top &&
    y - radius <= bottom
  );
}

function buildTrailCssPointsForHistory<TMeta>(
  seriesPoints: readonly BubbleChartSeriesPoint<TMeta>[],
  historyLength: number,
  xScale: ReturnType<typeof createLinearScale>,
  yScale: ReturnType<typeof createLinearScale>,
  maxTrailLength: number | null,
  sampleStep: number
): BubbleChartCssPoint[] | null {
  const boundedHistoryLength = Math.min(seriesPoints.length, historyLength);
  const endIndex = boundedHistoryLength - 1;
  if (endIndex < 1) return null;

  let startIndex = 0;
  if (maxTrailLength != null) {
    startIndex = Math.max(0, endIndex - maxTrailLength + 1);
  }

  const safeStep = Math.max(1, Math.round(sampleStep));
  const estimatedCount = Math.ceil((endIndex - startIndex) / safeStep) + 1;
  const result: BubbleChartCssPoint[] = new Array(estimatedCount);

  let count = 0;
  for (let i = startIndex; i < endIndex; i += safeStep) {
    const point = seriesPoints[i];
    result[count] = {
      cssX: xScale.scale(point.x),
      cssY: yScale.scale(point.y),
    };
    count += 1;
  }

  const current = seriesPoints[endIndex];
  result[count] = {
    cssX: xScale.scale(current.x),
    cssY: yScale.scale(current.y),
  };
  count += 1;

  if (count < 2) return null;
  result.length = count;
  return result;
}

function suppressCollidingXTickTexts(
  context: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  ticks: BubbleChartTick[],
  minGap: number
): void {
  const count = ticks.length;
  if (count <= 1) return;

  const widths = new Array<number>(count);
  const keep = new Array<boolean>(count);

  for (let i = 0; i < count; i += 1) {
    const text = ticks[i].text;
    widths[i] = text ? measureTextWidthCached(context, cache, font, text) : 0;
    keep[i] = false;
  }

  let lastRight = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const width = widths[i];
    if (width <= 0) continue;

    const left = ticks[i].cssX - width * 0.5;
    const right = ticks[i].cssX + width * 0.5;

    if (left >= lastRight + minGap) {
      keep[i] = true;
      lastRight = right;
    }
  }

  const lastIndex = count - 1;
  if (widths[lastIndex] > 0) {
    keep[lastIndex] = true;
    const lastLeft = ticks[lastIndex].cssX - widths[lastIndex] * 0.5;

    for (let i = lastIndex - 1; i >= 0; i -= 1) {
      if (!keep[i] || widths[i] <= 0) continue;
      const right = ticks[i].cssX + widths[i] * 0.5;
      if (right > lastLeft - minGap) {
        keep[i] = false;
      } else {
        break;
      }
    }
  }

  for (let i = 0; i < count; i += 1) {
    if (!keep[i]) ticks[i].text = "";
  }
}

function suppressCollidingYTickTexts(
  ticks: BubbleChartTick[],
  fontSize: number,
  minGap: number
): void {
  const count = ticks.length;
  if (count <= 1) return;

  const order = new Array<number>(count);
  const keep = new Array<boolean>(count);
  const halfHeight = fontSize * 0.5;

  for (let i = 0; i < count; i += 1) {
    order[i] = i;
    keep[i] = false;
  }

  order.sort((a, b) => ticks[a].cssY - ticks[b].cssY);

  let lastBottom = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < order.length; i += 1) {
    const index = order[i];
    if (!ticks[index].text) continue;

    const top = ticks[index].cssY - halfHeight;
    const bottom = ticks[index].cssY + halfHeight;

    if (top >= lastBottom + minGap) {
      keep[index] = true;
      lastBottom = bottom;
    }
  }

  const lastVisualIndex = order[order.length - 1];
  if (ticks[lastVisualIndex].text) {
    keep[lastVisualIndex] = true;
    const lastTop = ticks[lastVisualIndex].cssY - halfHeight;

    for (let i = order.length - 2; i >= 0; i -= 1) {
      const index = order[i];
      if (!keep[index]) continue;
      const bottom = ticks[index].cssY + halfHeight;
      if (bottom > lastTop - minGap) {
        keep[index] = false;
      } else {
        break;
      }
    }
  }

  for (let i = 0; i < count; i += 1) {
    if (!keep[i]) ticks[i].text = "";
  }
}

export function createBubbleChartRenderCache(): BubbleChartRenderCache {
  return {
    textWidth: new Map(),
    compactLabel: new Map(),
    resolvedLabel: new Map(),
  };
}

export function createBubbleChartScene<TMeta>(
  options: BubbleChartSceneOptions<TMeta>
): BubbleChartScene<TMeta> {
  const render = resolveBubbleChartRenderConfig(options.renderConfig);
  const theme = resolveBubbleChartTheme(options.theme);
  const cache = options.cache;

  const cssWidth = Math.max(1, options.cssWidth);
  const cssHeight = Math.max(1, options.cssHeight);

  const safeFrameIndex = clampBubbleFrameIndex(
    options.model.frames.length,
    options.frameIndex
  );
  const frame = options.model.frames[safeFrameIndex];

  const visibleXDomain = sanitizeVisibleDomain(
    options.viewXDomain,
    options.model.xDomain
  );
  const visibleYDomain = sanitizeVisibleDomain(
    options.viewYDomain,
    options.model.yDomain
  );
  const sizeMultiplier = sanitizeSizeMultiplier(options.sizeMultiplier);

  const xMeasureScale = createLinearScale(visibleXDomain, [0, 1]);
  const yMeasureScale = createLinearScale(visibleYDomain, [1, 0]);

  const xTickValues = xMeasureScale.ticks(render.xTickCount);
  const yTickValues = yMeasureScale.ticks(render.yTickCount);

  const xFormatter = render.xTickFormat ?? formatCompactNumber;
  const yFormatter = render.yTickFormat ?? formatCompactNumber;

  const xTickTexts = new Array<string>(xTickValues.length);
  const yTickTexts = new Array<string>(yTickValues.length);

  for (let i = 0; i < xTickValues.length; i += 1) {
    xTickTexts[i] = String(xFormatter(xTickValues[i]));
  }
  for (let i = 0; i < yTickValues.length; i += 1) {
    yTickTexts[i] = String(yFormatter(yTickValues[i]));
  }

  const plotArea = computeBubbleChartPlotArea({
    textContext: options.textContext,
    cache,
    cssWidth,
    cssHeight,
    xTickTexts,
    yTickTexts,
    showTickLabels: render.showTickLabels,
    showAxisLabels: render.showAxisLabels,
    xAxisLabel: render.xLabel,
    yAxisLabel: render.yLabel,
    theme,
  });

  const xScale = createLinearScale(visibleXDomain, [
    plotArea.left,
    plotArea.right,
  ]);
  const yScale = createLinearScale(visibleYDomain, [
    plotArea.bottom,
    plotArea.top,
  ]);

  const xTicks: BubbleChartTick[] = new Array(xTickValues.length);
  const yTicks: BubbleChartTick[] = new Array(yTickValues.length);

  for (let i = 0; i < xTickValues.length; i += 1) {
    const value = xTickValues[i];
    xTicks[i] = {
      value,
      text: xTickTexts[i],
      cssX: xScale.scale(value),
      cssY: plotArea.bottom,
    };
  }

  for (let i = 0; i < yTickValues.length; i += 1) {
    const value = yTickValues[i];
    yTicks[i] = {
      value,
      text: yTickTexts[i],
      cssX: plotArea.left,
      cssY: yScale.scale(value),
    };
  }

  if (render.showTickLabels) {
    const tickFont = `${theme.tickFontSize}px ${theme.fontFamily}`;
    suppressCollidingXTickTexts(
      options.textContext,
      cache,
      tickFont,
      xTicks,
      6
    );
    suppressCollidingYTickTexts(yTicks, theme.tickFontSize, 4);
  }

  const points: BubbleChartScenePoint<TMeta>[] = [];
  const trails: BubbleChartSceneTrail[] = [];

  const sizeMax =
    render.sizeScaleMode === "frame" ? frame.maxSize : options.model.maxSize;

  const scaledMinRadius = render.minRadius * sizeMultiplier;
  const scaledMaxRadius = render.maxRadius * sizeMultiplier;

  const pointOrder = getBubbleChartFramePointOrderInternal(
    options.model,
    safeFrameIndex,
    render.sortBubbles
  );

  for (let orderIndex = 0; orderIndex < pointOrder.length; orderIndex += 1) {
    const point = frame.points[pointOrder[orderIndex]];
    const cssX = xScale.scale(point.x);
    const cssY = yScale.scale(point.y);
    const radius = getBubbleRadius(
      getBubbleSizeRatio(point.size, sizeMax),
      scaledMinRadius,
      scaledMaxRadius
    );

    if (
      !intersectsPlotArea(
        cssX,
        cssY,
        radius,
        plotArea.left,
        plotArea.top,
        plotArea.right,
        plotArea.bottom
      )
    ) {
      continue;
    }

    let labelText = "";
    let labelFontSize: number | null = null;

    if (
      render.showBubbleLabels &&
      render.labelMode !== "none" &&
      radius >= render.labelMinRadius &&
      point.label
    ) {
      const fontSize = clampInteger(
        radius * 0.55,
        theme.bubbleLabelMinFontSize,
        theme.bubbleLabelMaxFontSize
      );
      const font = `${fontSize}px ${theme.fontFamily}`;
      const maxWidth = Math.max(0, radius * 2 - 4);
      const resolved = resolveBubbleLabelCached(
        options.textContext,
        cache,
        font,
        point.label,
        maxWidth,
        render.labelMode
      );
      if (resolved) {
        labelText = resolved;
        labelFontSize = fontSize;
      }
    }

    points.push({
      seriesId: point.seriesId,
      seriesIndex: point.seriesIndex,
      frameId: point.frameId,
      frameIndex: point.frameIndex,
      frameLabel: frame.label,
      label: point.label,
      color: point.color,
      xValue: point.x,
      yValue: point.y,
      sizeValue: point.size,
      cssX,
      cssY,
      radius,
      labelText,
      labelFontSize,
      meta: point.meta,
    });

    if (!render.showTrails || point.historyLength < 2) {
      continue;
    }

    const series = options.model.seriesById.get(point.seriesId);
    if (!series) continue;

    const trailPoints = buildTrailCssPointsForHistory(
      series.points,
      point.historyLength,
      xScale,
      yScale,
      render.maxTrailLength,
      render.trailSampleStep
    );

    if (!trailPoints || trailPoints.length < 2) continue;

    trails.push({
      seriesId: point.seriesId,
      seriesIndex: point.seriesIndex,
      color: point.color,
      points: trailPoints,
    });
  }

  return {
    frameIndex: safeFrameIndex,
    frameId: frame.id,
    frameLabel: frame.label,
    cssWidth,
    cssHeight,
    plotArea,
    xScale,
    yScale,
    xTicks,
    yTicks,
    xAxisLabel: render.xLabel,
    yAxisLabel: render.yLabel,
    showGrid: render.showGrid,
    showAxes: render.showAxes,
    showTickLabels: render.showTickLabels,
    showAxisLabels: render.showAxisLabels,
    points,
    trails,
    emptyMessage: frame.points.length === 0 ? render.emptyMessage : null,
    theme,
  };
}