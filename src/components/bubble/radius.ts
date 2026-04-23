export function getBubbleSizeRatio(size: number, maxSize: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  if (!Number.isFinite(maxSize) || maxSize <= 0) return 0;
  return Math.max(0, Math.min(1, size / maxSize));
}

export function getBubbleRadius(
  sizeRatio: number,
  minRadius: number,
  maxRadius: number
): number {
  const safeRatio = Number.isFinite(sizeRatio)
    ? Math.max(0, Math.min(1, sizeRatio))
    : 0;

  return minRadius + Math.sqrt(safeRatio) * (maxRadius - minRadius);
}