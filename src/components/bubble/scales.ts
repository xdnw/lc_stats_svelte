import type { LinearScale } from "./types";

function expandEqualDomain(min: number, max: number): [number, number] {
  if (min !== max) return [min, max];
  const padding = Math.max(Math.abs(min) * 0.12, 1);
  return [min - padding, max + padding];
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getDecimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || step >= 1) return 0;
  return Math.min(12, Math.max(0, Math.ceil(-Math.log10(step)) + 2));
}

function getNiceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;

  const power = Math.floor(Math.log10(rawStep));
  const base = 10 ** power;
  const error = rawStep / base;

  let factor = 10;
  if (error <= 1) factor = 1;
  else if (error <= 2) factor = 2;
  else if (error <= 2.5) factor = 2.5;
  else if (error <= 5) factor = 5;

  return factor * base;
}

function uniqueSortedFinite(values: number[]): number[] {
  const filtered = values.filter(Number.isFinite).sort((a, b) => a - b);
  const result: number[] = [];

  for (let i = 0; i < filtered.length; i += 1) {
    if (i === 0 || filtered[i] !== filtered[i - 1]) {
      result.push(filtered[i]);
    }
  }

  return result;
}

export function createLinearScale(
  domain: [number, number],
  range: [number, number]
): LinearScale {
  const safeDomain = expandEqualDomain(domain[0], domain[1]);
  const safeRange: [number, number] = [
    Number.isFinite(range[0]) ? range[0] : 0,
    Number.isFinite(range[1]) ? range[1] : 1,
  ];

  const d0 = safeDomain[0];
  const d1 = safeDomain[1];
  const r0 = safeRange[0];
  const r1 = safeRange[1];
  const span = d1 - d0;
  const rangeSpan = r1 - r0;

  const scale = (value: number): number => {
    if (!Number.isFinite(value)) return Number.NaN;
    if (span === 0) return (r0 + r1) * 0.5;
    return r0 + ((value - d0) / span) * rangeSpan;
  };

  const invert = (value: number): number => {
    if (!Number.isFinite(value)) return Number.NaN;
    if (rangeSpan === 0) return (d0 + d1) * 0.5;
    return d0 + ((value - r0) / rangeSpan) * span;
  };

  const ticks = (count: number): number[] => {
    const targetCount = Number.isFinite(count)
      ? Math.max(2, Math.min(50, Math.round(count)))
      : 6;

    const min = Math.min(d0, d1);
    const max = Math.max(d0, d1);
    const safeSpan = max - min;

    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (safeSpan === 0) return [min];

    const step = getNiceStep(safeSpan / Math.max(1, targetCount - 1));
    const decimals = getDecimalPlaces(step);
    const epsilon = Math.abs(step) / 1e6;

    const start = Math.ceil((min - epsilon) / step) * step;
    const end = Math.floor((max + epsilon) / step) * step;

    const result: number[] = [];
    let guard = 0;

    for (let value = start; value <= end + epsilon && guard < 1000; value += step) {
      const rounded = roundTo(value, decimals);
      if (
        !result.length ||
        Math.abs(rounded - result[result.length - 1]) > epsilon
      ) {
        result.push(rounded);
      }
      guard += 1;
    }

    if (!result.length) {
      return uniqueSortedFinite([
        roundTo(min, decimals),
        roundTo(max, decimals),
      ]);
    }

    return uniqueSortedFinite(result);
  };

  return {
    domain: [domain[0], domain[1]],
    range: [range[0], range[1]],
    scale,
    invert,
    ticks,
  };
}