import type {
  BubbleChartRenderConfig,
  BubbleChartTextMeasureContext,
} from "./types";

const STOPWORDS = new Set(["of", "and", "the"]);

export function buildCompactLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";

  const fragments = trimmed
    .split(/[\s/&-]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !STOPWORDS.has(part.toLowerCase()));

  if (fragments.length < 2) return trimmed;

  let acronym = "";
  for (let i = 0; i < fragments.length && acronym.length < 6; i += 1) {
    const first = Array.from(fragments[i])[0];
    if (first) acronym += first.toUpperCase();
  }

  return acronym.length >= 2 ? acronym : trimmed;
}

export function fitLabelToWidth(
  context: BubbleChartTextMeasureContext,
  label: string,
  maxWidth: number
): string {
  const text = label.trim();
  if (!text || !Number.isFinite(maxWidth) || maxWidth <= 0) return "";

  if (context.measureText(text).width <= maxWidth) return text;

  const ellipsis = "…";
  if (context.measureText(ellipsis).width > maxWidth) return "";

  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  let best = "";

  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = `${chars.slice(0, mid).join("")}${ellipsis}`;

    if (context.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function resolveBubbleLabel(
  context: BubbleChartTextMeasureContext,
  label: string,
  maxWidth: number,
  mode: BubbleChartRenderConfig["labelMode"]
): string {
  const full = label.trim();
  if (!full) return "";
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (mode === "none") return "";

  const compact = buildCompactLabel(full);

  if (mode === "auto") {
    if (context.measureText(full).width <= maxWidth) return full;
    if (compact && compact !== full && context.measureText(compact).width <= maxWidth) {
      return compact;
    }

    const truncatedCompact =
      compact && compact !== full ? fitLabelToWidth(context, compact, maxWidth) : "";
    if (truncatedCompact) return truncatedCompact;

    return fitLabelToWidth(context, full, maxWidth);
  }

  if (mode === "full") {
    if (context.measureText(full).width <= maxWidth) return full;
    return fitLabelToWidth(context, full, maxWidth);
  }

  if (mode === "compact") {
    const chosen = compact || full;
    if (context.measureText(chosen).width <= maxWidth) return chosen;
    return fitLabelToWidth(context, chosen, maxWidth);
  }

  if (mode === "truncate") {
    return fitLabelToWidth(context, full, maxWidth);
  }

  return "";
}
