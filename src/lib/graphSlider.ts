export type SliderMode = "single" | "range";

export type SliderContext = {
    min: number;
    max: number;
    step: number;
    mode: SliderMode;
};

export type SliderValueNormalizer = (
    values: number[],
    context: SliderContext,
) => number[];

export function cloneSliderValues(values: number[]): number[] {
    return Array.isArray(values) ? values.slice() : [];
}

export function sliderValuesEqual(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function fractionDigits(value: number): number {
    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue)) {
        return 0;
    }

    const text = `${normalizedValue}`;
    if (text.includes("e-")) {
        const [, exponent = "0"] = text.split("e-");
        return Number(exponent) || 0;
    }

    const [, decimals = ""] = text.split(".");
    return decimals.length;
}

function clampValue(value: number, lower: number, upper: number): number {
    return Math.min(upper, Math.max(lower, value));
}

function snapDiscreteValue(value: number, context: SliderContext): number {
    const spanStart = Math.min(context.min, context.max);
    const spanEnd = Math.max(context.min, context.max);
    if (spanEnd <= spanStart) {
        return spanStart;
    }

    const safeStep = Number.isFinite(context.step) && context.step > 0
        ? context.step
        : 1;
    const snapped =
        spanStart +
        Math.round((value - spanStart) / safeStep) * safeStep;
    const precision = fractionDigits(safeStep);
    return Number(
        clampValue(snapped, spanStart, spanEnd).toFixed(precision),
    );
}

export function normalizeGraphSliderScalar(
    value: number,
    context: SliderContext,
): number {
    const spanStart = Math.min(context.min, context.max);
    const spanEnd = Math.max(context.min, context.max);
    return clampValue(snapDiscreteValue(value, context), spanStart, spanEnd);
}

export function normalizeGraphSliderValues(
    values: number[],
    context: SliderContext,
): number[] {
    const spanStart = Math.min(context.min, context.max);
    const spanEnd = Math.max(context.min, context.max);
    const fallbackValue = normalizeGraphSliderScalar(spanStart, context);
    const normalizedCandidate =
        Array.isArray(values) && values.length > 0
            ? values
            : [fallbackValue];

    if (context.mode === "range") {
        const startValue = normalizeGraphSliderScalar(
            Number(normalizedCandidate[0] ?? spanStart),
            context,
        );
        const endValue = normalizeGraphSliderScalar(
            Number(normalizedCandidate[1] ?? normalizedCandidate[0] ?? spanEnd),
            context,
        );
        const normalizedStart = clampValue(startValue, spanStart, spanEnd);
        const normalizedEnd = clampValue(endValue, normalizedStart, spanEnd);
        return [normalizedStart, normalizedEnd];
    }

    return [
        normalizeGraphSliderScalar(Number(normalizedCandidate[0] ?? spanStart), context),
    ];
}

export function buildSliderContextSignature(
    context: SliderContext,
    normalizationKey = "",
): string {
    return [
        context.mode,
        context.min,
        context.max,
        context.step,
        normalizationKey,
    ].join("|");
}

export function resolveDraggedThumbIndex(
    mode: SliderMode,
    activeThumbIndex: number,
    currentValues: number[],
    nextValue: number,
): number {
    if (mode !== "range") {
        return 0;
    }

    const startValue = currentValues[0] ?? nextValue;
    const endValue = currentValues[1] ?? startValue;

    if (startValue !== endValue) {
        return activeThumbIndex;
    }

    if (activeThumbIndex === 1 && nextValue < startValue) {
        return 0;
    }

    if (activeThumbIndex === 0 && nextValue > endValue) {
        return 1;
    }

    return activeThumbIndex;
}
