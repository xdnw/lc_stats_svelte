function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatFixed(value: number, decimals: number): string {
  return trimTrailingZeros(value.toFixed(decimals));
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";

  const abs = Math.abs(value);

  if (abs >= 1e12) return `${formatFixed(value / 1e12, abs >= 1e13 ? 0 : 1)}T`;
  if (abs >= 1e9) return `${formatFixed(value / 1e9, abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${formatFixed(value / 1e6, abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${formatFixed(value / 1e3, abs >= 1e4 ? 0 : 1)}K`;

  if (abs >= 100) return formatFixed(value, 0);
  if (abs >= 10) return formatFixed(value, 1);
  if (abs >= 1) return formatFixed(value, 2);

  return trimTrailingZeros(Number(value.toPrecision(2)).toString());
}