import { DEFAULT_INTERACTION_CONFIG } from "./defaults";
import type {
  BubbleChartHoverPoint,
  BubbleChartHoverSource,
  BubbleChartInteractionConfig,
} from "./types";

export function findBubbleHoverPoint<TMeta>(
  source: BubbleChartHoverSource<TMeta> | null,
  x: number,
  y: number,
  options?: BubbleChartInteractionConfig
): BubbleChartHoverPoint<TMeta> | null {
  if (!source || source.points.length === 0) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const extra =
    typeof options?.extraHitRadius === "number" &&
    Number.isFinite(options.extraHitRadius)
      ? Math.max(0, options.extraHitRadius)
      : DEFAULT_INTERACTION_CONFIG.extraHitRadius;

  const hitTestMode =
    options?.hitTestMode === "closest" || options?.hitTestMode === "topmost"
      ? options.hitTestMode
      : DEFAULT_INTERACTION_CONFIG.hitTestMode;

  if (hitTestMode === "topmost") {
    for (let i = source.points.length - 1; i >= 0; i -= 1) {
      const point = source.points[i];
      if (
        !Number.isFinite(point.cssX) ||
        !Number.isFinite(point.cssY) ||
        !Number.isFinite(point.radius)
      ) {
        continue;
      }

      const radius = point.radius + extra;
      const minX = point.cssX - radius;
      const maxX = point.cssX + radius;
      const minY = point.cssY - radius;
      const maxY = point.cssY + radius;

      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const dx = x - point.cssX;
      const dy = y - point.cssY;
      if (dx * dx + dy * dy <= radius * radius) {
        return point;
      }
    }
    return null;
  }

  let bestPoint: BubbleChartHoverPoint<TMeta> | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestIndex = -1;

  for (let i = 0; i < source.points.length; i += 1) {
    const point = source.points[i];
    if (
      !Number.isFinite(point.cssX) ||
      !Number.isFinite(point.cssY) ||
      !Number.isFinite(point.radius)
    ) {
      continue;
    }

    const radius = point.radius + extra;
    const minX = point.cssX - radius;
    const maxX = point.cssX + radius;
    const minY = point.cssY - radius;
    const maxY = point.cssY + radius;

    if (x < minX || x > maxX || y < minY || y > maxY) continue;

    const dx = x - point.cssX;
    const dy = y - point.cssY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radius * radius) continue;

    if (
      distanceSq < bestDistanceSq ||
      (distanceSq === bestDistanceSq && i > bestIndex)
    ) {
      bestDistanceSq = distanceSq;
      bestPoint = point;
      bestIndex = i;
    }
  }

  return bestPoint;
}