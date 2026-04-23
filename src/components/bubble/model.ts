import { resolveBubbleChartModelConfig } from "./config";
import { hashSeriesIdToColor } from "./color";
import type {
  BubbleChartDatum,
  BubbleChartFrame,
  BubbleChartFrameDefinition,
  BubbleChartFrameId,
  BubbleChartFramePoint,
  BubbleChartModel,
  BubbleChartModelConfig,
  BubbleChartSeries,
  BubbleChartSeriesPoint,
  ResolvedBubbleChartModelConfig,
} from "./types";

type KeptDatum<TMeta> = {
  inputIndex: number;
  seriesId: string;
  frameId: BubbleChartFrameId;
  frameLabel: string;
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  meta?: TMeta;
};

type TempPoint<TMeta> = {
  inputIndex: number;
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
  historyLength: number;
};

type InternalFrameOrders = {
  inputOrder: number[];
  sizeAsc: number[];
  sizeDesc: number[];
};

type InternalModelCache = {
  frameOrders: InternalFrameOrders[];
};

const INTERNAL_MODEL_CACHE = new WeakMap<object, InternalModelCache>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function expandEqualDomain(min: number, max: number): [number, number] {
  if (min !== max) return [min, max];
  const padding = Math.max(Math.abs(min) * 0.12, 1);
  return [min - padding, max + padding];
}

function resolveAutoDomain(
  explicit: [number, number] | undefined,
  min: number,
  max: number,
  hasData: boolean,
  paddingRatio: number
): [number, number] {
  if (explicit) return explicit;
  if (!hasData) return [0, 1];

  let domain: [number, number] =
    min === max ? expandEqualDomain(min, max) : [min, max];

  const span = domain[1] - domain[0];
  const pad = span * paddingRatio;
  domain = [domain[0] - pad, domain[1] + pad];

  return domain;
}

function compareLex(a: BubbleChartFrameId, b: BubbleChartFrameId): number {
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function compareNumericAsc(a: BubbleChartFrameId, b: BubbleChartFrameId): number {
  const an = Number(a);
  const bn = Number(b);

  if (!Number.isFinite(an) || !Number.isFinite(bn)) {
    return compareLex(a, b);
  }

  if (an < bn) return -1;
  if (an > bn) return 1;
  return compareLex(a, b);
}

function dedupeConfiguredFrames(
  frames?: readonly BubbleChartFrameDefinition[]
): BubbleChartFrameDefinition[] {
  if (!frames?.length) return [];

  const seen = new Map<BubbleChartFrameId, true>();
  const result: BubbleChartFrameDefinition[] = [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (!frame) continue;
    if (seen.has(frame.id)) continue;
    seen.set(frame.id, true);
    result.push({
      id: frame.id,
      label: trimString(frame.label) || undefined,
    });
  }

  return result;
}

function sortUnlistedFrameIds(
  ids: BubbleChartFrameId[],
  config: ResolvedBubbleChartModelConfig
): BubbleChartFrameId[] {
  if (ids.length <= 1) return ids.slice();

  let comparator:
    | ((a: BubbleChartFrameId, b: BubbleChartFrameId) => number)
    | undefined;

  if (typeof config.frameSort === "function") {
    comparator = config.frameSort;
  } else if (config.frameSort === "numeric-asc") {
    comparator = compareNumericAsc;
  } else if (config.frameSort === "lex-asc") {
    comparator = compareLex;
  } else {
    const allNumbers = ids.every((id) => typeof id === "number");
    comparator = allNumbers ? compareNumericAsc : compareLex;
  }

  return ids
    .map((id, encounterIndex) => ({ id, encounterIndex }))
    .sort((a, b) => {
      const compared = comparator!(a.id, b.id);
      return compared || a.encounterIndex - b.encounterIndex;
    })
    .map((entry) => entry.id);
}

function buildInternalFrameOrders<TMeta>(
  frames: readonly BubbleChartFrame<TMeta>[]
): InternalFrameOrders[] {
  const result: InternalFrameOrders[] = new Array(frames.length);

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const count = frame.points.length;
    const inputOrder = new Array<number>(count);
    const sizeAsc = new Array<number>(count);
    const sizeDesc = new Array<number>(count);

    for (let i = 0; i < count; i += 1) {
      inputOrder[i] = i;
      sizeAsc[i] = i;
      sizeDesc[i] = i;
    }

    sizeAsc.sort((a, b) => {
      const pa = frame.points[a];
      const pb = frame.points[b];
      return pa.size - pb.size || pa.frameOrder - pb.frameOrder;
    });

    sizeDesc.sort((a, b) => {
      const pa = frame.points[a];
      const pb = frame.points[b];
      return pb.size - pa.size || pa.frameOrder - pb.frameOrder;
    });

    result[frameIndex] = { inputOrder, sizeAsc, sizeDesc };
  }

  return result;
}

export function clampBubbleFrameIndex(frameCount: number, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (frameCount <= 0) return 0;
  const index = Math.trunc(value);
  if (index < 0) return 0;
  if (index >= frameCount) return frameCount - 1;
  return index;
}

export function getBubbleChartFrameIndex<TMeta>(
  model: BubbleChartModel<TMeta>,
  frameId: BubbleChartFrameId
): number {
  return model.frameIndexById.get(frameId) ?? 0;
}

export function getBubbleChartFramePointOrderInternal<TMeta>(
  model: BubbleChartModel<TMeta>,
  frameIndex: number,
  sortBubbles: "size-asc" | "size-desc" | "none"
): readonly number[] {
  const cache = INTERNAL_MODEL_CACHE.get(model as object);
  const safeIndex = clampBubbleFrameIndex(model.frames.length, frameIndex);

  if (!cache || !cache.frameOrders[safeIndex]) {
    const frame = model.frames[safeIndex];
    const inputOrder = frame.points.map((_, index) => index);
    return inputOrder;
  }

  if (sortBubbles === "size-asc") return cache.frameOrders[safeIndex].sizeAsc;
  if (sortBubbles === "size-desc") return cache.frameOrders[safeIndex].sizeDesc;
  return cache.frameOrders[safeIndex].inputOrder;
}

export function buildBubbleChartModel<TMeta>(
  data: readonly BubbleChartDatum<TMeta>[],
  rawConfig?: BubbleChartModelConfig
): BubbleChartModel<TMeta> | null {
  const config = resolveBubbleChartModelConfig(rawConfig);

  const latestBySeriesFrame = new Map<string, Map<BubbleChartFrameId, KeptDatum<TMeta>>>();

  let xMin = 0;
  let xMax = 0;
  let yMin = 0;
  let yMax = 0;
  let hasValidPoints = false;
  let globalMaxSize = 0;

  const frameMaxSizeById = new Map<BubbleChartFrameId, number>();

  for (let inputIndex = 0; inputIndex < data.length; inputIndex += 1) {
    const datum = data[inputIndex];
    if (!datum) continue;

    const seriesId = trimString(datum.seriesId);
    const frameId = datum.frameId;

    if (!seriesId) continue;
    if (
      typeof frameId !== "string" &&
      !(typeof frameId === "number" && Number.isFinite(frameId))
    ) {
      continue;
    }

    if (
      !isFiniteNumber(datum.x) ||
      !isFiniteNumber(datum.y) ||
      !isFiniteNumber(datum.size) ||
      datum.size < 0
    ) {
      continue;
    }

    if (!hasValidPoints) {
      xMin = datum.x;
      xMax = datum.x;
      yMin = datum.y;
      yMax = datum.y;
      hasValidPoints = true;
    } else {
      if (datum.x < xMin) xMin = datum.x;
      if (datum.x > xMax) xMax = datum.x;
      if (datum.y < yMin) yMin = datum.y;
      if (datum.y > yMax) yMax = datum.y;
    }

    if (datum.size > globalMaxSize) {
      globalMaxSize = datum.size;
    }

    const frameMax = frameMaxSizeById.get(frameId) ?? 0;
    if (datum.size > frameMax) {
      frameMaxSizeById.set(frameId, datum.size);
    }

    let frameMap = latestBySeriesFrame.get(seriesId);
    if (!frameMap) {
      frameMap = new Map<BubbleChartFrameId, KeptDatum<TMeta>>();
      latestBySeriesFrame.set(seriesId, frameMap);
    }

    frameMap.set(frameId, {
      inputIndex,
      seriesId,
      frameId,
      frameLabel: trimString(datum.frameLabel),
      x: datum.x,
      y: datum.y,
      size: datum.size,
      label: trimString(datum.label),
      color: trimString(datum.color),
      meta: datum.meta,
    });
  }

  const kept: KeptDatum<TMeta>[] = [];
  for (const frameMap of latestBySeriesFrame.values()) {
    for (const value of frameMap.values()) {
      kept.push(value);
    }
  }

  kept.sort((a, b) => a.inputIndex - b.inputIndex);

  const configuredFrames = dedupeConfiguredFrames(config.frames);
  if (kept.length === 0 && configuredFrames.length === 0) {
    return null;
  }

  const configuredFrameIds = new Map<BubbleChartFrameId, BubbleChartFrameDefinition>();
  for (let i = 0; i < configuredFrames.length; i += 1) {
    configuredFrameIds.set(configuredFrames[i].id, configuredFrames[i]);
  }

  const unlistedFrameIds: BubbleChartFrameId[] = [];
  const seenUnlistedFrameIds = new Map<BubbleChartFrameId, true>();

  for (let i = 0; i < kept.length; i += 1) {
    const frameId = kept[i].frameId;
    if (configuredFrameIds.has(frameId) || seenUnlistedFrameIds.has(frameId)) continue;
    seenUnlistedFrameIds.set(frameId, true);
    unlistedFrameIds.push(frameId);
  }

  const sortedUnlistedFrameIds = sortUnlistedFrameIds(unlistedFrameIds, config);

  const frameEntries: Array<{ id: BubbleChartFrameId; configuredLabel?: string }> = [];
  for (let i = 0; i < configuredFrames.length; i += 1) {
    frameEntries.push({
      id: configuredFrames[i].id,
      configuredLabel: trimString(configuredFrames[i].label) || undefined,
    });
  }
  for (let i = 0; i < sortedUnlistedFrameIds.length; i += 1) {
    frameEntries.push({ id: sortedUnlistedFrameIds[i] });
  }

  const firstKeptFrameLabelById = new Map<BubbleChartFrameId, string>();
  for (let i = 0; i < kept.length; i += 1) {
    const { frameId, frameLabel } = kept[i];
    if (frameLabel && !firstKeptFrameLabelById.has(frameId)) {
      firstKeptFrameLabelById.set(frameId, frameLabel);
    }
  }

  const frames: BubbleChartFrame<TMeta>[] = new Array(frameEntries.length);
  const frameIndexById = new Map<BubbleChartFrameId, number>();
  const framePointsBuckets: TempPoint<TMeta>[][] = new Array(frameEntries.length);

  for (let i = 0; i < frameEntries.length; i += 1) {
    const entry = frameEntries[i];
    frameIndexById.set(entry.id, i);

    const callbackFrameLabel = config.getFrameLabel
      ? trimString(config.getFrameLabel(entry.id))
      : "";

    const label =
      entry.configuredLabel ||
      firstKeptFrameLabelById.get(entry.id) ||
      callbackFrameLabel ||
      String(entry.id);


    frames[i] = {
      id: entry.id,
      label,
      index: i,
      points: [],
      maxSize: frameMaxSizeById.get(entry.id) ?? 0,
    };
    framePointsBuckets[i] = [];
  }

  const seriesOrder: string[] = [];
  const seriesIndexById = new Map<string, number>();
  for (let i = 0; i < kept.length; i += 1) {
    const seriesId = kept[i].seriesId;
    if (seriesIndexById.has(seriesId)) continue;
    const nextIndex = seriesOrder.length;
    seriesIndexById.set(seriesId, nextIndex);
    seriesOrder.push(seriesId);
  }

  const firstSeriesLabelById = new Map<string, string>();
  const firstSeriesColorById = new Map<string, string>();

  for (let i = 0; i < kept.length; i += 1) {
    const datum = kept[i];
    if (datum.label && !firstSeriesLabelById.has(datum.seriesId)) {
      firstSeriesLabelById.set(datum.seriesId, datum.label);
    }
    if (datum.color && !firstSeriesColorById.has(datum.seriesId)) {
      firstSeriesColorById.set(datum.seriesId, datum.color);
    }
  }

  const seriesPointsBuckets: TempPoint<TMeta>[][] = new Array(seriesOrder.length);
  const series: BubbleChartSeries<TMeta>[] = new Array(seriesOrder.length);

  for (let i = 0; i < seriesOrder.length; i += 1) {
    const seriesId = seriesOrder[i];
    const seriesLabel = firstSeriesLabelById.get(seriesId) || seriesId;
    const callbackColor = config.fallbackColor
      ? trimString(config.fallbackColor(seriesId, i))
      : "";

    const seriesColor =
      firstSeriesColorById.get(seriesId) ||
      callbackColor ||
      hashSeriesIdToColor(seriesId);

    series[i] = {
      id: seriesId,
      index: i,
      label: seriesLabel,
      color: seriesColor,
      points: [],
    };

    seriesPointsBuckets[i] = [];
  }

  for (let i = 0; i < kept.length; i += 1) {
    const datum = kept[i];
    const seriesIndex = seriesIndexById.get(datum.seriesId)!;
    const frameIndex = frameIndexById.get(datum.frameId)!;
    const seriesMeta = series[seriesIndex];

    const tempPoint: TempPoint<TMeta> = {
      inputIndex: datum.inputIndex,
      seriesId: datum.seriesId,
      seriesIndex,
      frameId: datum.frameId,
      frameIndex,
      x: datum.x,
      y: datum.y,
      size: datum.size,
      label: datum.label || seriesMeta.label,
      color: datum.color || seriesMeta.color,
      meta: datum.meta,
      historyLength: 0,
    };

    framePointsBuckets[frameIndex].push(tempPoint);
    seriesPointsBuckets[seriesIndex].push(tempPoint);
  }

  for (let seriesIndex = 0; seriesIndex < seriesPointsBuckets.length; seriesIndex += 1) {
    const bucket = seriesPointsBuckets[seriesIndex];
    bucket.sort((a, b) => a.frameIndex - b.frameIndex || a.inputIndex - b.inputIndex);

    let historyLength = 0;
    const seriesPoints: BubbleChartSeriesPoint<TMeta>[] = new Array(bucket.length);

    for (let i = 0; i < bucket.length; i += 1) {
      const point = bucket[i];
      historyLength += 1;
      point.historyLength = historyLength;

      seriesPoints[i] = {
        seriesId: point.seriesId,
        seriesIndex: point.seriesIndex,
        frameId: point.frameId,
        frameIndex: point.frameIndex,
        x: point.x,
        y: point.y,
        size: point.size,
        label: point.label,
        color: point.color,
        meta: point.meta,
      };
    }

    series[seriesIndex] = {
      ...series[seriesIndex],
      points: seriesPoints,
    };
  }

  for (let frameIndex = 0; frameIndex < framePointsBuckets.length; frameIndex += 1) {
    const bucket = framePointsBuckets[frameIndex];
    const framePoints: BubbleChartFramePoint<TMeta>[] = new Array(bucket.length);

    for (let i = 0; i < bucket.length; i += 1) {
      const point = bucket[i];
      framePoints[i] = {
        seriesId: point.seriesId,
        seriesIndex: point.seriesIndex,
        frameId: point.frameId,
        frameIndex: point.frameIndex,
        frameOrder: i,
        x: point.x,
        y: point.y,
        size: point.size,
        historyLength: point.historyLength,
        label: point.label,
        color: point.color,
        meta: point.meta,
      };
    }

    frames[frameIndex] = {
      ...frames[frameIndex],
      points: framePoints,
    };
  }

  const seriesById = new Map<string, BubbleChartSeries<TMeta>>();
  for (let i = 0; i < series.length; i += 1) {
    seriesById.set(series[i].id, series[i]);
  }

  const model: BubbleChartModel<TMeta> = {
    frames,
    frameIndexById,
    series,
    seriesById,
    xDomain: resolveAutoDomain(
      config.xDomain,
      xMin,
      xMax,
      hasValidPoints,
      config.paddingRatio.x
    ),
    yDomain: resolveAutoDomain(
      config.yDomain,
      yMin,
      yMax,
      hasValidPoints,
      config.paddingRatio.y
    ),
    maxSize: globalMaxSize,
    totalPointCount: kept.length,
  };

  INTERNAL_MODEL_CACHE.set(model as object, {
    frameOrders: buildInternalFrameOrders(frames),
  });

  return model;
}