function clampDiscreteValue(
    value: number,
    lowerBound: number,
    upperBound: number,
): number {
    return Math.min(
        upperBound,
        Math.max(lowerBound, Math.round(Number(value) || 0)),
    );
}

export function normalizeTieringSliderValues(
    values: number[],
    timeRange: [number, number] | null,
    usesRangeSelection: boolean,
): number[] {
    if (!timeRange) {
        return [0];
    }

    const rangeStart = Math.min(timeRange[0], timeRange[1]);
    const rangeEnd = Math.max(timeRange[0], timeRange[1]);

    if (usesRangeSelection) {
        if (!Array.isArray(values) || values.length === 0) {
            return [rangeStart, rangeEnd];
        }

        if (values.length === 1) {
            const pointValue = clampDiscreteValue(
                values[0] ?? rangeEnd,
                rangeStart,
                rangeEnd,
            );
            return [rangeStart, pointValue];
        }

        const startValue = clampDiscreteValue(
            values[0] ?? rangeStart,
            rangeStart,
            rangeEnd,
        );
        const endValue = clampDiscreteValue(
            values[1] ?? rangeEnd,
            rangeStart,
            rangeEnd,
        );

        return [startValue, Math.max(startValue, endValue)];
    }

    const pointValue = clampDiscreteValue(
        values[values.length - 1] ?? rangeStart,
        rangeStart,
        rangeEnd,
    );
    return [pointValue];
}
