import { formatCompactNumber } from "./format";
import { clampBubbleFrameIndex } from "./model";
import type {
  BubbleChartFrameRow,
  BubbleChartModel,
} from "./types";

export function getFrameDataTable<TMeta>(
  model: BubbleChartModel<TMeta>,
  frameIndex: number
): BubbleChartFrameRow<TMeta>[] {
  if (!model.frames.length) return [];

  const safeIndex = clampBubbleFrameIndex(model.frames.length, frameIndex);
  const frame = model.frames[safeIndex];
  const rows: BubbleChartFrameRow<TMeta>[] = new Array(frame.points.length);

  for (let i = 0; i < frame.points.length; i += 1) {
    const point = frame.points[i];
    rows[i] = {
      seriesId: point.seriesId,
      seriesIndex: point.seriesIndex,
      label: point.label,
      frameId: frame.id,
      frameLabel: frame.label,
      x: point.x,
      y: point.y,
      size: point.size,
      color: point.color,
      meta: point.meta,
    };
  }

  return rows;
}

export function getFrameSummary<TMeta>(
  model: BubbleChartModel<TMeta>,
  frameIndex: number
): string {
  if (!model.frames.length) return "No frames";

  const safeIndex = clampBubbleFrameIndex(model.frames.length, frameIndex);
  const frame = model.frames[safeIndex];
  const count = frame.points.length;

  if (count === 0) {
    return `${frame.label}: 0 points`;
  }

  let xMin = frame.points[0].x;
  let xMax = frame.points[0].x;
  let yMin = frame.points[0].y;
  let yMax = frame.points[0].y;
  let sizeMin = frame.points[0].size;
  let sizeMax = frame.points[0].size;

  for (let i = 1; i < frame.points.length; i += 1) {
    const point = frame.points[i];
    if (point.x < xMin) xMin = point.x;
    if (point.x > xMax) xMax = point.x;
    if (point.y < yMin) yMin = point.y;
    if (point.y > yMax) yMax = point.y;
    if (point.size < sizeMin) sizeMin = point.size;
    if (point.size > sizeMax) sizeMax = point.size;
  }

  return [
    `${frame.label}: ${count} point${count === 1 ? "" : "s"}`,
    `x ${formatCompactNumber(xMin)}–${formatCompactNumber(xMax)}`,
    `y ${formatCompactNumber(yMin)}–${formatCompactNumber(yMax)}`,
    `size ${formatCompactNumber(sizeMin)}–${formatCompactNumber(sizeMax)}`,
  ].join(", ");
}