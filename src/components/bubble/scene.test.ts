import { describe, expect, it } from "vitest";
import {
  buildBubbleChartModel,
  createBubbleChartRenderCache,
  createBubbleChartScene,
  type BubbleChartTextMeasureContext,
} from ".";

const textContext = {
  font: "",
  measureText: () => ({ width: 0 } as TextMetrics),
} satisfies BubbleChartTextMeasureContext;

describe("bubble scene", () => {
  it("uses the visible domain and render-only size multiplier", () => {
    const model = buildBubbleChartModel(
      [
        {
          seriesId: "alpha",
          frameId: 1,
          x: 25,
          y: 75,
          size: 25,
          label: "Alpha",
          color: "rgb(255, 0, 0)",
        },
      ],
      {
        xDomain: [0, 100],
        yDomain: [0, 100],
      }
    );

    expect(model).not.toBeNull();
    if (!model) return;

    const baseScene = createBubbleChartScene({
      textContext,
      model,
      frameIndex: 0,
      cssWidth: 600,
      cssHeight: 400,
      renderConfig: {
        showGrid: false,
        showAxes: false,
        showTickLabels: false,
        showAxisLabels: false,
        showBubbleLabels: false,
        showTrails: false,
      },
      cache: createBubbleChartRenderCache(),
    });

    const zoomedScene = createBubbleChartScene({
      textContext,
      model,
      frameIndex: 0,
      cssWidth: 600,
      cssHeight: 400,
      renderConfig: {
        showGrid: false,
        showAxes: false,
        showTickLabels: false,
        showAxisLabels: false,
        showBubbleLabels: false,
        showTrails: false,
      },
      cache: createBubbleChartRenderCache(),
      viewXDomain: [0, 200],
      viewYDomain: [0, 200],
      sizeMultiplier: 2,
    });

    expect(baseScene.xScale.domain).toEqual([0, 100]);
    expect(zoomedScene.xScale.domain).toEqual([0, 200]);
    expect(zoomedScene.points[0]?.cssX).toBeLessThan(baseScene.points[0]?.cssX ?? 0);
    expect(zoomedScene.points[0]?.radius).toBeCloseTo((baseScene.points[0]?.radius ?? 0) * 2, 6);
  });
});
