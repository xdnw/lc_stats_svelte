import type {
  BubbleChartPlotArea,
  BubbleChartRenderCache,
  BubbleChartTextMeasureContext,
  BubbleChartTheme,
} from "./types";

type BubbleChartLayoutOptions = {
  textContext: BubbleChartTextMeasureContext;
  cache?: BubbleChartRenderCache;
  cssWidth: number;
  cssHeight: number;
  xTickTexts: readonly string[];
  yTickTexts: readonly string[];
  showTickLabels: boolean;
  showAxisLabels: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  theme: BubbleChartTheme;
};

function measureTextWidth(
  textContext: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  text: string
): number {
  const key = `${font}|${text}`;
  if (cache?.textWidth.has(key)) {
    return cache.textWidth.get(key)!;
  }
  textContext.font = font;
  const width = textContext.measureText(text).width;
  cache?.textWidth.set(key, width);
  return width;
}

function maxMeasuredWidth(
  textContext: BubbleChartTextMeasureContext,
  cache: BubbleChartRenderCache | undefined,
  font: string,
  values: readonly string[]
): number {
  let maxWidth = 0;
  for (let i = 0; i < values.length; i += 1) {
    const text = values[i];
    if (!text) continue;
    const width = measureTextWidth(textContext, cache, font, text);
    if (width > maxWidth) maxWidth = width;
  }
  return maxWidth;
}

function clampGutters(
  cssWidth: number,
  cssHeight: number,
  leftGutter: number,
  rightGutter: number,
  topGutter: number,
  bottomGutter: number
): BubbleChartPlotArea {
  let left = Math.max(0, leftGutter);
  let right = Math.max(0, rightGutter);
  let top = Math.max(0, topGutter);
  let bottom = Math.max(0, bottomGutter);

  const maxHorizontalGutters = Math.max(0, cssWidth - 1);
  const maxVerticalGutters = Math.max(0, cssHeight - 1);

  if (left + right > maxHorizontalGutters && left + right > 0) {
    const scale = maxHorizontalGutters / (left + right);
    left *= scale;
    right *= scale;
  }

  if (top + bottom > maxVerticalGutters && top + bottom > 0) {
    const scale = maxVerticalGutters / (top + bottom);
    top *= scale;
    bottom *= scale;
  }

  const plotLeft = Math.round(left);
  const plotTop = Math.round(top);
  const plotWidth = Math.max(1, Math.round(cssWidth - left - right));
  const plotHeight = Math.max(1, Math.round(cssHeight - top - bottom));

  return {
    left: plotLeft,
    top: plotTop,
    right: plotLeft + plotWidth,
    bottom: plotTop + plotHeight,
    width: plotWidth,
    height: plotHeight,
  };
}

export function computeBubbleChartPlotArea(
  options: BubbleChartLayoutOptions
): BubbleChartPlotArea {
  const cssWidth = Math.max(1, options.cssWidth);
  const cssHeight = Math.max(1, options.cssHeight);

  const outerPad = 8;
  const tickGap = 6;
  const axisGap = 8;
  const tickFont = `${options.theme.tickFontSize}px ${options.theme.fontFamily}`;

  let leftGutter = outerPad;
  let rightGutter = outerPad;
  let topGutter = outerPad;
  let bottomGutter = outerPad;

  if (options.showTickLabels) {
    const yTickWidth = maxMeasuredWidth(
      options.textContext,
      options.cache,
      tickFont,
      options.yTickTexts
    );
    if (yTickWidth > 0) {
      leftGutter += Math.ceil(yTickWidth) + tickGap;
    }

    let hasXTickText = false;
    for (let i = 0; i < options.xTickTexts.length; i += 1) {
      if (options.xTickTexts[i]) {
        hasXTickText = true;
        break;
      }
    }
    if (hasXTickText) {
      bottomGutter += options.theme.tickFontSize + tickGap;
    }

    const firstXText =
      options.xTickTexts.length > 0 ? options.xTickTexts[0] : "";
    const lastXText =
      options.xTickTexts.length > 0
        ? options.xTickTexts[options.xTickTexts.length - 1]
        : "";

    const firstXTickWidth = firstXText
      ? measureTextWidth(options.textContext, options.cache, tickFont, firstXText)
      : 0;
    const lastXTickWidth = lastXText
      ? measureTextWidth(options.textContext, options.cache, tickFont, lastXText)
      : 0;

    leftGutter += Math.max(0, Math.ceil(firstXTickWidth * 0.5) - outerPad);
    rightGutter += Math.max(0, Math.ceil(lastXTickWidth * 0.5) - outerPad);
  }

  if (options.showAxisLabels) {
    if (options.yAxisLabel.trim()) {
      leftGutter += options.theme.axisLabelFontSize + axisGap;
    }
    if (options.xAxisLabel.trim()) {
      bottomGutter += options.theme.axisLabelFontSize + axisGap;
    }
  }

  return clampGutters(
    cssWidth,
    cssHeight,
    leftGutter,
    rightGutter,
    topGutter,
    bottomGutter
  );
}