export function hashSeriesIdToColor(seriesId: string): string {
  let hash = 2166136261;

  for (let i = 0; i < seriesId.length; i += 1) {
    hash ^= seriesId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 55%)`;
}