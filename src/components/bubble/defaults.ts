import type { BubbleChartTheme } from "./types";

export const DEFAULT_MODEL_CONFIG = {
  paddingRatio: 0.08,
  frameSort: "auto",
} as const;

export const DEFAULT_RENDER_CONFIG = {
  xLabel: "",
  yLabel: "",
  sizeLabel: "",
  minRadius: 8,
  maxRadius: 30,
  sizeScaleMode: "global",
  xTickCount: 6,
  yTickCount: 6,
  showGrid: true,
  showAxes: true,
  showTickLabels: true,
  showAxisLabels: true,
  showBubbleLabels: true,
  showTrails: true,
  maxTrailLength: null,
  trailSampleStep: 1,
  sortBubbles: "size-asc",
  labelMode: "auto",
  labelMinRadius: 11,
  emptyMessage: "No points for this frame",
  maxDevicePixelRatio: 2,
} as const;

export const DEFAULT_INTERACTION_CONFIG = {
  extraHitRadius: 4,
  hitTestMode: "topmost",
} as const;

export const DEFAULT_THEME: BubbleChartTheme = {
  backgroundColor: "transparent",
  axisColor: "rgba(71, 85, 105, 0.95)",
  axisWidth: 1,
  gridColor: "rgba(148, 163, 184, 0.24)",
  gridWidth: 1,
  textColor: "#0f172a",
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