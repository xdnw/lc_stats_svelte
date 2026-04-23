export type SliderTickDescriptor = {
    value: number;
    label: string;
    percent: number;
    anchor: "start" | "center" | "end";
};

function normalizeTickValues(values: number[]): number[] {
    return Array.from(
        new Set(
            values
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value)),
        ),
    ).sort((left, right) => left - right);
}

export function buildSliderTickDescriptors(
    values: number[],
    formatLabel: (value: number) => string,
): SliderTickDescriptor[] {
    const normalizedValues = normalizeTickValues(values);
    if (normalizedValues.length === 0) {
        return [];
    }

    const startValue = normalizedValues[0] ?? 0;
    const endValue = normalizedValues[normalizedValues.length - 1] ?? startValue;
    const span = endValue - startValue;

    return normalizedValues.map((value, index) => ({
        value,
        label: formatLabel(value),
        percent: span <= 0 ? 50 : ((value - startValue) / span) * 100,
        anchor:
            span <= 0
                ? "center"
                : index === 0
                  ? "start"
                  : index === normalizedValues.length - 1
                    ? "end"
                    : "center",
    }));
}
