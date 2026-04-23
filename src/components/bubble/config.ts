import {
  DEFAULT_INTERACTION_CONFIG,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_RENDER_CONFIG,
  DEFAULT_THEME,
} from "./defaults";
import type {
  BubbleChartConfig,
  BubbleChartFrameDefinition,
  BubbleChartInteractionConfig,
  BubbleChartModelConfig,
  BubbleChartRenderConfig,
  BubbleChartTheme,
  ResolvedBubbleChartConfig,
  ResolvedBubbleChartInteractionConfig,
  ResolvedBubbleChartModelConfig,
  ResolvedBubbleChartRenderConfig,
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const safe = isFiniteNumber(value) ? value : fallback;
  return Math.min(max, Math.max(min, safe));
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const safe = isFiniteNumber(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, safe));
}

function clampIntegerMin(value: unknown, min: number, fallback: number): number {
  const safe = isFiniteNumber(value) ? Math.round(value) : fallback;
  return Math.max(min, safe);
}

function sanitizeExplicitDomain(
  domain?: [number, number]
): [number, number] | undefined {
  if (
    !domain ||
    !isFiniteNumber(domain[0]) ||
    !isFiniteNumber(domain[1])
  ) {
    return undefined;
  }

  let min = domain[0];
  let max = domain[1];

  if (min > max) {
    [min, max] = [max, min];
  }

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.12, 1);
    return [min - padding, max + padding];
  }

  return [min, max];
}

function sanitizeFrames(
  frames?: readonly BubbleChartFrameDefinition[]
): readonly BubbleChartFrameDefinition[] | undefined {
  if (!Array.isArray(frames)) return undefined;

  const result: BubbleChartFrameDefinition[] = [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (!frame) continue;
    const id = frame.id;

    if (
      typeof id !== "string" &&
      !(typeof id === "number" && Number.isFinite(id))
    ) {
      continue;
    }

    result.push({
      id,
      label: typeof frame.label === "string" ? frame.label : undefined,
    });
  }

  return result;
}

function normalizePaddingRatio(
  paddingRatio: BubbleChartModelConfig["paddingRatio"]
): { x: number; y: number } {
  const fallback =
    typeof DEFAULT_MODEL_CONFIG.paddingRatio === "number"
      ? DEFAULT_MODEL_CONFIG.paddingRatio
      : 0.08;

  if (isFiniteNumber(paddingRatio)) {
    const value = Math.max(0, paddingRatio);
    return { x: value, y: value };
  }

  if (paddingRatio && typeof paddingRatio === "object") {
    const x = isFiniteNumber(paddingRatio.x)
      ? Math.max(0, paddingRatio.x)
      : fallback;
    const y = isFiniteNumber(paddingRatio.y)
      ? Math.max(0, paddingRatio.y)
      : fallback;
    return { x, y };
  }

  return { x: fallback, y: fallback };
}

export function resolveBubbleChartModelConfig(
  config?: BubbleChartModelConfig
): ResolvedBubbleChartModelConfig {
  const frameSort =
    typeof config?.frameSort === "function" ||
    config?.frameSort === "auto" ||
    config?.frameSort === "numeric-asc" ||
    config?.frameSort === "lex-asc"
      ? config.frameSort
      : DEFAULT_MODEL_CONFIG.frameSort;

  return {
    xDomain: sanitizeExplicitDomain(config?.xDomain),
    yDomain: sanitizeExplicitDomain(config?.yDomain),
    paddingRatio: normalizePaddingRatio(config?.paddingRatio),
    frames: sanitizeFrames(config?.frames),
    frameSort,
    getFrameLabel:
      typeof config?.getFrameLabel === "function" ? config.getFrameLabel : undefined,
    fallbackColor:
      typeof config?.fallbackColor === "function"
        ? config.fallbackColor
        : undefined,
  };
}

export function resolveBubbleChartRenderConfig(
  config?: BubbleChartRenderConfig
): ResolvedBubbleChartRenderConfig {
  let minRadius = clampNumber(
    config?.minRadius,
    0,
    Number.POSITIVE_INFINITY,
    DEFAULT_RENDER_CONFIG.minRadius
  );
  let maxRadius = clampNumber(
    config?.maxRadius,
    0,
    Number.POSITIVE_INFINITY,
    DEFAULT_RENDER_CONFIG.maxRadius
  );

  if (minRadius > maxRadius) {
    [minRadius, maxRadius] = [maxRadius, minRadius];
  }

  let maxTrailLength: number | null = DEFAULT_RENDER_CONFIG.maxTrailLength;
  if (config?.maxTrailLength === null) {
    maxTrailLength = null;
  } else if (isFiniteNumber(config?.maxTrailLength)) {
    maxTrailLength =
      config!.maxTrailLength >= 1 ? Math.round(config!.maxTrailLength) : null;
  }

  return {
    xLabel: sanitizeString(config?.xLabel, DEFAULT_RENDER_CONFIG.xLabel),
    yLabel: sanitizeString(config?.yLabel, DEFAULT_RENDER_CONFIG.yLabel),
    sizeLabel: sanitizeString(config?.sizeLabel, DEFAULT_RENDER_CONFIG.sizeLabel),
    minRadius,
    maxRadius,
    sizeScaleMode:
      config?.sizeScaleMode === "frame" || config?.sizeScaleMode === "global"
        ? config.sizeScaleMode
        : DEFAULT_RENDER_CONFIG.sizeScaleMode,
    xTickCount: clampInteger(
      config?.xTickCount,
      2,
      50,
      DEFAULT_RENDER_CONFIG.xTickCount
    ),
    yTickCount: clampInteger(
      config?.yTickCount,
      2,
      50,
      DEFAULT_RENDER_CONFIG.yTickCount
    ),
    showGrid: sanitizeBoolean(config?.showGrid, DEFAULT_RENDER_CONFIG.showGrid),
    showAxes: sanitizeBoolean(config?.showAxes, DEFAULT_RENDER_CONFIG.showAxes),
    showTickLabels: sanitizeBoolean(
      config?.showTickLabels,
      DEFAULT_RENDER_CONFIG.showTickLabels
    ),
    showAxisLabels: sanitizeBoolean(
      config?.showAxisLabels,
      DEFAULT_RENDER_CONFIG.showAxisLabels
    ),
    showBubbleLabels: sanitizeBoolean(
      config?.showBubbleLabels,
      DEFAULT_RENDER_CONFIG.showBubbleLabels
    ),
    showTrails: sanitizeBoolean(
      config?.showTrails,
      DEFAULT_RENDER_CONFIG.showTrails
    ),
    maxTrailLength,
    trailSampleStep: clampIntegerMin(
      config?.trailSampleStep,
      1,
      DEFAULT_RENDER_CONFIG.trailSampleStep
    ),
    sortBubbles:
      config?.sortBubbles === "size-desc" ||
      config?.sortBubbles === "size-asc" ||
      config?.sortBubbles === "none"
        ? config.sortBubbles
        : DEFAULT_RENDER_CONFIG.sortBubbles,
    labelMode:
      config?.labelMode === "auto" ||
      config?.labelMode === "full" ||
      config?.labelMode === "compact" ||
      config?.labelMode === "truncate" ||
      config?.labelMode === "none"
        ? config.labelMode
        : DEFAULT_RENDER_CONFIG.labelMode,
    labelMinRadius: clampNumber(
      config?.labelMinRadius,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_RENDER_CONFIG.labelMinRadius
    ),
    emptyMessage: sanitizeString(
      config?.emptyMessage,
      DEFAULT_RENDER_CONFIG.emptyMessage
    ),
    xTickFormat:
      typeof config?.xTickFormat === "function" ? config.xTickFormat : undefined,
    yTickFormat:
      typeof config?.yTickFormat === "function" ? config.yTickFormat : undefined,
    maxDevicePixelRatio: clampNumber(
      config?.maxDevicePixelRatio,
      1,
      Number.POSITIVE_INFINITY,
      DEFAULT_RENDER_CONFIG.maxDevicePixelRatio
    ),
  };
}

export function resolveBubbleChartInteractionConfig(
  config?: BubbleChartInteractionConfig
): ResolvedBubbleChartInteractionConfig {
  return {
    extraHitRadius: clampNumber(
      config?.extraHitRadius,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_INTERACTION_CONFIG.extraHitRadius
    ),
    hitTestMode:
      config?.hitTestMode === "closest" || config?.hitTestMode === "topmost"
        ? config.hitTestMode
        : DEFAULT_INTERACTION_CONFIG.hitTestMode,
  };
}

export function resolveBubbleChartTheme(
  theme?: Partial<BubbleChartTheme>
): BubbleChartTheme {
  let bubbleLabelMinFontSize = clampIntegerMin(
    theme?.bubbleLabelMinFontSize,
    1,
    DEFAULT_THEME.bubbleLabelMinFontSize
  );
  let bubbleLabelMaxFontSize = clampIntegerMin(
    theme?.bubbleLabelMaxFontSize,
    1,
    DEFAULT_THEME.bubbleLabelMaxFontSize
  );

  if (bubbleLabelMinFontSize > bubbleLabelMaxFontSize) {
    [bubbleLabelMinFontSize, bubbleLabelMaxFontSize] = [
      bubbleLabelMaxFontSize,
      bubbleLabelMinFontSize,
    ];
  }

  return {
    backgroundColor: sanitizeString(
      theme?.backgroundColor,
      DEFAULT_THEME.backgroundColor
    ),
    axisColor: sanitizeString(theme?.axisColor, DEFAULT_THEME.axisColor),
    axisWidth: clampNumber(
      theme?.axisWidth,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_THEME.axisWidth
    ),
    gridColor: sanitizeString(theme?.gridColor, DEFAULT_THEME.gridColor),
    gridWidth: clampNumber(
      theme?.gridWidth,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_THEME.gridWidth
    ),
    textColor: sanitizeString(theme?.textColor, DEFAULT_THEME.textColor),
    mutedTextColor: sanitizeString(
      theme?.mutedTextColor,
      DEFAULT_THEME.mutedTextColor
    ),
    bubbleStrokeColor: sanitizeString(
      theme?.bubbleStrokeColor,
      DEFAULT_THEME.bubbleStrokeColor
    ),
    bubbleStrokeWidth: clampNumber(
      theme?.bubbleStrokeWidth,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_THEME.bubbleStrokeWidth
    ),
    bubbleOpacity: clampNumber(
      theme?.bubbleOpacity,
      0,
      1,
      DEFAULT_THEME.bubbleOpacity
    ),
    trailOpacity: clampNumber(
      theme?.trailOpacity,
      0,
      1,
      DEFAULT_THEME.trailOpacity
    ),
    trailWidth: clampNumber(
      theme?.trailWidth,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_THEME.trailWidth
    ),
    labelStrokeColor: sanitizeString(
      theme?.labelStrokeColor,
      DEFAULT_THEME.labelStrokeColor
    ),
    labelStrokeWidth: clampNumber(
      theme?.labelStrokeWidth,
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_THEME.labelStrokeWidth
    ),
    labelFillColor: sanitizeString(
      theme?.labelFillColor,
      DEFAULT_THEME.labelFillColor
    ),
    fontFamily: sanitizeString(theme?.fontFamily, DEFAULT_THEME.fontFamily),
    tickFontSize: clampIntegerMin(
      theme?.tickFontSize,
      1,
      DEFAULT_THEME.tickFontSize
    ),
    axisLabelFontSize: clampIntegerMin(
      theme?.axisLabelFontSize,
      1,
      DEFAULT_THEME.axisLabelFontSize
    ),
    bubbleLabelMinFontSize,
    bubbleLabelMaxFontSize,
  };
}

export function resolveBubbleChartConfig(
  config?: BubbleChartConfig
): ResolvedBubbleChartConfig {
  return {
    model: resolveBubbleChartModelConfig(config?.model),
    render: resolveBubbleChartRenderConfig(config?.render),
    interaction: resolveBubbleChartInteractionConfig(config?.interaction),
    theme: resolveBubbleChartTheme(config?.theme),
  };
}