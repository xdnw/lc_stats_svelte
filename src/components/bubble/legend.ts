import type { BubbleChartLegendItem, BubbleChartModel } from "./types";

export function getBubbleChartLegendItems<TMeta>(
  model: BubbleChartModel<TMeta>
): BubbleChartLegendItem[] {
  const result: BubbleChartLegendItem[] = new Array(model.series.length);

  for (let i = 0; i < model.series.length; i += 1) {
    const series = model.series[i];
    result[i] = {
      seriesId: series.id,
      seriesIndex: series.index,
      label: series.label,
      color: series.color,
      pointCount: series.points.length,
    };
  }

  return result;
}