export type BubbleChartFrameId = string | number;

export type BubbleChartDomain = [number, number];

export type BubbleChartDatum<TMeta = unknown> = {
  seriesId: string;
  frameId: BubbleChartFrameId;
  frameLabel?: string;
  x: number;
  y: number;
  size: number;
  label?: string;
  color?: string;
  meta?: TMeta;
};

export type BubbleChartFrameDefinition = {
  id: BubbleChartFrameId;
  label?: string;
};

export type BubbleChartModelConfig = {
  xDomain?: BubbleChartDomain;
  yDomain?: BubbleChartDomain;
  paddingRatio?: number | { x?: number; y?: number };
  frames?: readonly BubbleChartFrameDefinition[];
  frameSort?:
    | "auto"
    | "numeric-asc"
    | "lex-asc"
    | ((a: BubbleChartFrameId, b: BubbleChartFrameId) => number);
  getFrameLabel?: (frameId: BubbleChartFrameId) => string;
  fallbackColor?: (seriesId: string, seriesIndex: number) => string;
};

export type BubbleChartRenderConfig = {
  xLabel?: string;
  yLabel?: string;
  sizeLabel?: string;
  minRadius?: number;
  maxRadius?: number;
  sizeScaleMode?: "global" | "frame";
  xTickCount?: number;
  yTickCount?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  showTickLabels?: boolean;
  showAxisLabels?: boolean;
  showBubbleLabels?: boolean;
  showTrails?: boolean;
  maxTrailLength?: number | null;
  trailSampleStep?: number;
  sortBubbles?: "size-asc" | "size-desc" | "none";
  labelMode?: "auto" | "full" | "compact" | "truncate" | "none";
  labelMinRadius?: number;
  emptyMessage?: string;
  xTickFormat?: (value: number) => string;
  yTickFormat?: (value: number) => string;
  maxDevicePixelRatio?: number;
};

export type BubbleChartInteractionConfig = {
  extraHitRadius?: number;
  hitTestMode?: "topmost" | "closest";
};

export type BubbleChartTheme = {
  backgroundColor: string;
  axisColor: string;
  axisWidth: number;
  gridColor: string;
  gridWidth: number;
  textColor: string;
  mutedTextColor: string;
  bubbleStrokeColor: string;
  bubbleStrokeWidth: number;
  bubbleOpacity: number;
  trailOpacity: number;
  trailWidth: number;
  labelStrokeColor: string;
  labelStrokeWidth: number;
  labelFillColor: string;
  fontFamily: string;
  tickFontSize: number;
  axisLabelFontSize: number;
  bubbleLabelMinFontSize: number;
  bubbleLabelMaxFontSize: number;
};

export type BubbleChartConfig = {
  model?: BubbleChartModelConfig;
  render?: BubbleChartRenderConfig;
  interaction?: BubbleChartInteractionConfig;
  theme?: Partial<BubbleChartTheme>;
};

export type ResolvedBubbleChartModelConfig = {
  xDomain?: BubbleChartDomain;
  yDomain?: BubbleChartDomain;
  paddingRatio: { x: number; y: number };
  frames?: readonly BubbleChartFrameDefinition[];
  frameSort:
    | "auto"
    | "numeric-asc"
    | "lex-asc"
    | ((a: BubbleChartFrameId, b: BubbleChartFrameId) => number);
  getFrameLabel?: (frameId: BubbleChartFrameId) => string;
  fallbackColor?: (seriesId: string, seriesIndex: number) => string;
};

export type ResolvedBubbleChartRenderConfig = {
  xLabel: string;
  yLabel: string;
  sizeLabel: string;
  minRadius: number;
  maxRadius: number;
  sizeScaleMode: "global" | "frame";
  xTickCount: number;
  yTickCount: number;
  showGrid: boolean;
  showAxes: boolean;
  showTickLabels: boolean;
  showAxisLabels: boolean;
  showBubbleLabels: boolean;
  showTrails: boolean;
  maxTrailLength: number | null;
  trailSampleStep: number;
  sortBubbles: "size-asc" | "size-desc" | "none";
  labelMode: "auto" | "full" | "compact" | "truncate" | "none";
  labelMinRadius: number;
  emptyMessage: string;
  xTickFormat?: (value: number) => string;
  yTickFormat?: (value: number) => string;
  maxDevicePixelRatio: number;
};

export type ResolvedBubbleChartInteractionConfig = {
  extraHitRadius: number;
  hitTestMode: "topmost" | "closest";
};

export type ResolvedBubbleChartConfig = {
  model: ResolvedBubbleChartModelConfig;
  render: ResolvedBubbleChartRenderConfig;
  interaction: ResolvedBubbleChartInteractionConfig;
  theme: BubbleChartTheme;
};

export type BubbleChartModel<TMeta = unknown> = {
  frames: readonly BubbleChartFrame<TMeta>[];
  frameIndexById: ReadonlyMap<BubbleChartFrameId, number>;
  series: readonly BubbleChartSeries<TMeta>[];
  seriesById: ReadonlyMap<string, BubbleChartSeries<TMeta>>;
  xDomain: [number, number];
  yDomain: [number, number];
  maxSize: number;
  totalPointCount: number;
};

export type BubbleChartFrame<TMeta = unknown> = {
  id: BubbleChartFrameId;
  label: string;
  index: number;
  points: readonly BubbleChartFramePoint<TMeta>[];
  maxSize: number;
};

export type BubbleChartSeries<TMeta = unknown> = {
  id: string;
  index: number;
  label: string;
  color: string;
  points: readonly BubbleChartSeriesPoint<TMeta>[];
};

export type BubbleChartSeriesPoint<TMeta = unknown> = {
  seriesId: string;
  seriesIndex: number;
  frameId: BubbleChartFrameId;
  frameIndex: number;
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  meta?: TMeta;
};

export type BubbleChartFramePoint<TMeta = unknown> = {
  seriesId: string;
  seriesIndex: number;
  frameId: BubbleChartFrameId;
  frameIndex: number;
  frameOrder: number;
  x: number;
  y: number;
  size: number;
  historyLength: number;
  label: string;
  color: string;
  meta?: TMeta;
};

export type BubbleChartLegendItem = {
  seriesId: string;
  seriesIndex: number;
  label: string;
  color: string;
  pointCount: number;
};

export type BubbleChartFrameRow<TMeta = unknown> = {
  seriesId: string;
  seriesIndex: number;
  label: string;
  frameId: BubbleChartFrameId;
  frameLabel: string;
  x: number;
  y: number;
  size: number;
  color: string;
  meta?: TMeta;
};

export type LinearScale = {
  domain: [number, number];
  range: [number, number];
  scale(value: number): number;
  invert(value: number): number;
  ticks(count: number): number[];
};

export type BubbleChartTextMeasureContext = Pick<
  CanvasRenderingContext2D,
  "font" | "measureText"
>;

export type BubbleChartRenderCache = {
  textWidth: Map<string, number>;
  compactLabel: Map<string, string>;
  resolvedLabel: Map<string, string>;
};

export type BubbleChartPlotArea = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type BubbleChartTick = {
  value: number;
  text: string;
  cssX: number;
  cssY: number;
};

export type BubbleChartCssPoint = {
  cssX: number;
  cssY: number;
};

export type BubbleChartSceneTrail = {
  seriesId: string;
  seriesIndex: number;
  color: string;
  points: readonly BubbleChartCssPoint[];
};

export type BubbleChartScenePoint<TMeta = unknown> = {
  seriesId: string;
  seriesIndex: number;
  frameId: BubbleChartFrameId;
  frameIndex: number;
  frameLabel: string;
  label: string;
  color: string;
  xValue: number;
  yValue: number;
  sizeValue: number;
  cssX: number;
  cssY: number;
  radius: number;
  labelText: string;
  labelFontSize: number | null;
  meta?: TMeta;
};

export type BubbleChartHoverPoint<TMeta = unknown> =
  BubbleChartScenePoint<TMeta>;

export type BubbleChartScene<TMeta = unknown> = {
  frameIndex: number;
  frameId: BubbleChartFrameId;
  frameLabel: string;
  cssWidth: number;
  cssHeight: number;
  plotArea: BubbleChartPlotArea;
  xScale: LinearScale;
  yScale: LinearScale;
  xTicks: readonly BubbleChartTick[];
  yTicks: readonly BubbleChartTick[];
  xAxisLabel: string;
  yAxisLabel: string;
  showGrid: boolean;
  showAxes: boolean;
  showTickLabels: boolean;
  showAxisLabels: boolean;
  points: readonly BubbleChartScenePoint<TMeta>[];
  trails: readonly BubbleChartSceneTrail[];
  emptyMessage: string | null;
  theme: BubbleChartTheme;
};

export type BubbleChartSceneOptions<TMeta = unknown> = {
  textContext: BubbleChartTextMeasureContext;
  model: BubbleChartModel<TMeta>;
  frameIndex: number;
  cssWidth: number;
  cssHeight: number;
  renderConfig?: BubbleChartRenderConfig;
  theme?: Partial<BubbleChartTheme>;
  cache?: BubbleChartRenderCache;
  viewXDomain?: BubbleChartDomain;
  viewYDomain?: BubbleChartDomain;
  sizeMultiplier?: number;
};

export type BubbleChartCanvasSize = {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  backingWidth: number;
  backingHeight: number;
};

export type ResolveBubbleChartCanvasSizeOptions = {
  canvas: HTMLCanvasElement;
  cssWidth?: number;
  cssHeight?: number;
  devicePixelRatio?: number;
  maxDevicePixelRatio?: number;
};

export type BubbleChartRenderResult<TMeta = unknown> =
  BubbleChartScene<TMeta> & BubbleChartCanvasSize;

export type BubbleChartRenderOptions<TMeta = unknown> = {
  canvas: HTMLCanvasElement;
  model: BubbleChartModel<TMeta>;
  frameIndex: number;
  renderConfig?: BubbleChartRenderConfig;
  theme?: Partial<BubbleChartTheme>;
  cache?: BubbleChartRenderCache;
  cssWidth?: number;
  cssHeight?: number;
  devicePixelRatio?: number;
  viewXDomain?: BubbleChartDomain;
  viewYDomain?: BubbleChartDomain;
  sizeMultiplier?: number;
};

export type BubbleChartHoverSource<TMeta = unknown> = {
  points: readonly BubbleChartHoverPoint<TMeta>[];
};

export type BubbleChartPointer = {
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  canvasX: number;
  canvasY: number;
};

export type BubbleChartPointerEventDetail<TMeta = unknown> = {
  point: BubbleChartHoverPoint<TMeta> | null;
  pointer: BubbleChartPointer | null;
};