import { resolveBubbleChartRenderConfig, resolveBubbleChartTheme } from "./config";
import { DEFAULT_RENDER_CONFIG } from "./defaults";
import { clampBubbleFrameIndex } from "./model";
import { createLinearScale } from "./scales";
import {
  createBubbleChartRenderCache,
  createBubbleChartScene,
} from "./scene";
import type {
  BubbleChartCanvasSize,
  BubbleChartRenderOptions,
  BubbleChartRenderResult,
  BubbleChartScene,
  ResolveBubbleChartCanvasSizeOptions,
} from "./types";

function shouldFillBackground(color: string): boolean {
  const trimmed = color.trim().toLowerCase();
  return trimmed !== "" && trimmed !== "transparent";
}

function getWindowDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const value = window.devicePixelRatio || 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function alignStrokePosition(value: number, lineWidth: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  return Math.round(lineWidth) % 2 === 1 ? rounded + 0.5 : rounded;
}

function getCanvas2DContext(
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", { alpha: true }) ?? canvas.getContext("2d");
}

function resolveViewDomain(
  domain: [number, number] | undefined,
  fallback: [number, number]
): [number, number] {
  if (!domain || !Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) {
    return [fallback[0], fallback[1]];
  }

  return domain[0] <= domain[1]
    ? [domain[0], domain[1]]
    : [domain[1], domain[0]];
}

function createZeroSafeRenderResult<TMeta>(
  options: BubbleChartRenderOptions<TMeta>,
  size: BubbleChartCanvasSize
): BubbleChartRenderResult<TMeta> {
  const render = resolveBubbleChartRenderConfig(options.renderConfig);
  const theme = resolveBubbleChartTheme(options.theme);
  const xDomain = resolveViewDomain(options.viewXDomain, options.model.xDomain);
  const yDomain = resolveViewDomain(options.viewYDomain, options.model.yDomain);

  const safeFrameIndex = clampBubbleFrameIndex(
    options.model.frames.length,
    options.frameIndex
  );
  const frame = options.model.frames[safeFrameIndex];

  const plotArea = {
    left: 0,
    top: 0,
    right: size.cssWidth,
    bottom: size.cssHeight,
    width: size.cssWidth,
    height: size.cssHeight,
  };

  const scene: BubbleChartScene<TMeta> = {
    frameIndex: safeFrameIndex,
    frameId: frame.id,
    frameLabel: frame.label,
    cssWidth: size.cssWidth,
    cssHeight: size.cssHeight,
    plotArea,
    xScale: createLinearScale(xDomain, [plotArea.left, plotArea.right]),
    yScale: createLinearScale(yDomain, [plotArea.bottom, plotArea.top]),
    xTicks: [],
    yTicks: [],
    xAxisLabel: render.xLabel,
    yAxisLabel: render.yLabel,
    showGrid: render.showGrid,
    showAxes: render.showAxes,
    showTickLabels: render.showTickLabels,
    showAxisLabels: render.showAxisLabels,
    points: [],
    trails: [],
    emptyMessage: frame.points.length === 0 ? render.emptyMessage : null,
    theme,
  };

  return {
    ...scene,
    ...size,
  };
}

export function resolveBubbleChartCanvasSize(
  options: ResolveBubbleChartCanvasSizeOptions
): BubbleChartCanvasSize {
  const rect = options.canvas.getBoundingClientRect();

  const rawCssWidth =
    Number.isFinite(options.cssWidth) && options.cssWidth != null
      ? Number(options.cssWidth)
      : rect.width;

  const rawCssHeight =
    Number.isFinite(options.cssHeight) && options.cssHeight != null
      ? Number(options.cssHeight)
      : rect.height;

  const cssWidth = Math.max(1, rawCssWidth || 0);
  const cssHeight = Math.max(1, rawCssHeight || 0);

  const actualDpr =
    Number.isFinite(options.devicePixelRatio) && options.devicePixelRatio != null
      ? Number(options.devicePixelRatio)
      : getWindowDevicePixelRatio();

  const maxDpr = Math.max(
    1,
    Number.isFinite(options.maxDevicePixelRatio)
      ? Number(options.maxDevicePixelRatio)
      : DEFAULT_RENDER_CONFIG.maxDevicePixelRatio
  );

  const devicePixelRatio = Math.max(1, Math.min(actualDpr, maxDpr));

  return {
    cssWidth,
    cssHeight,
    devicePixelRatio,
    backingWidth: Math.max(1, Math.round(cssWidth * devicePixelRatio)),
    backingHeight: Math.max(1, Math.round(cssHeight * devicePixelRatio)),
  };
}

export function drawBubbleChartScene<TMeta>(
  context: CanvasRenderingContext2D,
  scene: BubbleChartScene<TMeta>
): void {
  const { theme, plotArea } = scene;

  context.save();
  context.clearRect(0, 0, scene.cssWidth, scene.cssHeight);

  if (shouldFillBackground(theme.backgroundColor)) {
    context.fillStyle = theme.backgroundColor;
    context.fillRect(0, 0, scene.cssWidth, scene.cssHeight);
  }

  if (
    scene.showGrid &&
    theme.gridWidth > 0 &&
    (scene.xTicks.length > 0 || scene.yTicks.length > 0)
  ) {
    context.save();
    context.beginPath();
    context.strokeStyle = theme.gridColor;
    context.lineWidth = theme.gridWidth;

    for (let i = 0; i < scene.xTicks.length; i += 1) {
      const x = alignStrokePosition(scene.xTicks[i].cssX, theme.gridWidth);
      context.moveTo(x, plotArea.top);
      context.lineTo(x, plotArea.bottom);
    }

    for (let i = 0; i < scene.yTicks.length; i += 1) {
      const y = alignStrokePosition(scene.yTicks[i].cssY, theme.gridWidth);
      context.moveTo(plotArea.left, y);
      context.lineTo(plotArea.right, y);
    }

    context.stroke();
    context.restore();
  }

  if (scene.showTickLabels) {
    context.save();
    context.fillStyle = theme.mutedTextColor;
    context.font = `${theme.tickFontSize}px ${theme.fontFamily}`;

    context.textAlign = "center";
    context.textBaseline = "top";
    for (let i = 0; i < scene.xTicks.length; i += 1) {
      const tick = scene.xTicks[i];
      if (!tick.text) continue;
      context.fillText(tick.text, tick.cssX, plotArea.bottom + 6);
    }

    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let i = 0; i < scene.yTicks.length; i += 1) {
      const tick = scene.yTicks[i];
      if (!tick.text) continue;
      context.fillText(tick.text, plotArea.left - 6, tick.cssY);
    }

    context.restore();
  }

  if (scene.showAxes && theme.axisWidth > 0) {
    const left = alignStrokePosition(plotArea.left, theme.axisWidth);
    const bottom = alignStrokePosition(plotArea.bottom, theme.axisWidth);

    context.save();
    context.beginPath();
    context.strokeStyle = theme.axisColor;
    context.lineWidth = theme.axisWidth;
    context.moveTo(left, plotArea.top);
    context.lineTo(left, bottom);
    context.lineTo(plotArea.right, bottom);
    context.stroke();
    context.restore();
  }

  if (scene.showAxisLabels) {
    context.save();
    context.fillStyle = theme.textColor;
    context.font = `${theme.axisLabelFontSize}px ${theme.fontFamily}`;

    if (scene.xAxisLabel.trim()) {
      const bottomGutter = Math.max(0, scene.cssHeight - plotArea.bottom);
      const xLabelY =
        plotArea.bottom +
        Math.max(theme.axisLabelFontSize * 0.5, bottomGutter * 0.5);

      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        scene.xAxisLabel,
        (plotArea.left + plotArea.right) * 0.5,
        xLabelY
      );
    }

    if (scene.yAxisLabel.trim()) {
      const yAxisX = Math.max(theme.axisLabelFontSize * 0.75, plotArea.left * 0.5);
      context.save();
      context.translate(yAxisX, (plotArea.top + plotArea.bottom) * 0.5);
      context.rotate(-Math.PI / 2);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(scene.yAxisLabel, 0, 0);
      context.restore();
    }

    context.restore();
  }

  if (scene.trails.length > 0) {
    context.save();
    context.beginPath();
    context.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
    context.clip();
    context.lineWidth = theme.trailWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = theme.trailOpacity;

    for (let i = 0; i < scene.trails.length; i += 1) {
      const trail = scene.trails[i];
      if (trail.points.length < 2) continue;

      context.beginPath();
      context.strokeStyle = trail.color;
      context.moveTo(trail.points[0].cssX, trail.points[0].cssY);
      for (let j = 1; j < trail.points.length; j += 1) {
        context.lineTo(trail.points[j].cssX, trail.points[j].cssY);
      }
      context.stroke();
    }

    context.restore();
  }

  if (scene.points.length > 0) {
    context.save();
    context.beginPath();
    context.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
    context.clip();

    context.globalAlpha = theme.bubbleOpacity;
    for (let i = 0; i < scene.points.length; i += 1) {
      const point = scene.points[i];
      context.beginPath();
      context.arc(point.cssX, point.cssY, point.radius, 0, Math.PI * 2);
      context.fillStyle = point.color;
      context.fill();
    }

    if (theme.bubbleStrokeWidth > 0) {
      context.globalAlpha = 1;
      context.beginPath();
      for (let i = 0; i < scene.points.length; i += 1) {
        const point = scene.points[i];
        context.moveTo(point.cssX + point.radius, point.cssY);
        context.arc(point.cssX, point.cssY, point.radius, 0, Math.PI * 2);
      }
      context.lineWidth = theme.bubbleStrokeWidth;
      context.strokeStyle = theme.bubbleStrokeColor;
      context.stroke();
    }

    context.restore();
  }

  if (scene.points.length > 0) {
    context.save();
    context.beginPath();
    context.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
    context.clip();

    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = theme.labelStrokeColor;
    context.fillStyle = theme.labelFillColor;

    for (let i = 0; i < scene.points.length; i += 1) {
      const point = scene.points[i];
      if (!point.labelText || point.labelFontSize == null) continue;

      context.save();
      context.beginPath();
      context.arc(point.cssX, point.cssY, point.radius, 0, Math.PI * 2);
      context.clip();

      context.font = `${point.labelFontSize}px ${theme.fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      if (theme.labelStrokeWidth > 0) {
        context.lineWidth = theme.labelStrokeWidth;
        context.strokeText(point.labelText, point.cssX, point.cssY);
      }
      context.fillText(point.labelText, point.cssX, point.cssY);
      context.restore();
    }

    context.restore();
  }

  if (scene.emptyMessage) {
    context.save();
    context.fillStyle = theme.mutedTextColor;
    context.font = `${theme.axisLabelFontSize}px ${theme.fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      scene.emptyMessage,
      plotArea.left + plotArea.width * 0.5,
      plotArea.top + plotArea.height * 0.5
    );
    context.restore();
  }

  context.restore();
}

export function renderBubbleChart<TMeta>(
  options: BubbleChartRenderOptions<TMeta>
): BubbleChartRenderResult<TMeta> {
  const render = resolveBubbleChartRenderConfig(options.renderConfig);

  const size = resolveBubbleChartCanvasSize({
    canvas: options.canvas,
    cssWidth: options.cssWidth,
    cssHeight: options.cssHeight,
    devicePixelRatio: options.devicePixelRatio,
    maxDevicePixelRatio: render.maxDevicePixelRatio,
  });

  const context = getCanvas2DContext(options.canvas);
  if (!context) {
    return createZeroSafeRenderResult(options, size);
  }

  if (
    options.canvas.width !== size.backingWidth ||
    options.canvas.height !== size.backingHeight
  ) {
    options.canvas.width = size.backingWidth;
    options.canvas.height = size.backingHeight;
  }

  context.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0);

  const scene = createBubbleChartScene({
    textContext: context,
    model: options.model,
    frameIndex: options.frameIndex,
    cssWidth: size.cssWidth,
    cssHeight: size.cssHeight,
    renderConfig: options.renderConfig,
    theme: options.theme,
    cache: options.cache ?? createBubbleChartRenderCache(),
    viewXDomain: options.viewXDomain,
    viewYDomain: options.viewYDomain,
    sizeMultiplier: options.sizeMultiplier,
  });

  drawBubbleChartScene(context, scene);

  return {
    ...scene,
    ...size,
  };
}

export function clearBubbleChart(
  canvas: HTMLCanvasElement | null | undefined
): void {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}
