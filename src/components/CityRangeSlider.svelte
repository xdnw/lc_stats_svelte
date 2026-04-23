<script lang="ts">
    import {
        CITY_RANGE_CONTEXT,
        DEFAULT_CITY_RANGE,
        normalizeCityRange,
        type CityRange,
    } from "$lib/cityRange";
    import { buildSliderTickDescriptors } from "$lib/sliderTicks";
    import GraphSlider from "./GraphSlider.svelte";

    export let cityRange: CityRange = DEFAULT_CITY_RANGE;
    export let onCommit: (cityRange: CityRange) => void = () => {};

    function cityRangesEqual(left: CityRange, right: CityRange): boolean {
        return left[0] === right[0] && left[1] === right[1];
    }

    function buildCityRangeTicks() {
        const tickValues: number[] = [];
        for (
            let value = CITY_RANGE_CONTEXT.min;
            value <= CITY_RANGE_CONTEXT.max;
            value += 5
        ) {
            tickValues.push(value);
        }

        return buildSliderTickDescriptors(
            tickValues,
            (value) => `${Math.round(value)}`,
        );
    }

    function handleCommit(nextCityRange: number[]): void {
        const normalizedRange = normalizeCityRange(nextCityRange);
        if (cityRangesEqual(normalizedCityRange, normalizedRange)) {
            return;
        }

        onCommit(normalizedRange);
    }

    const cityRangeTicks = buildCityRangeTicks();

    $: normalizedCityRange = normalizeCityRange(cityRange);
</script>

<div class="ux-range-slider-wrap">
    <GraphSlider
        mode={CITY_RANGE_CONTEXT.mode}
        min={CITY_RANGE_CONTEXT.min}
        max={CITY_RANGE_CONTEXT.max}
        step={CITY_RANGE_CONTEXT.step}
        values={normalizedCityRange}
        ticks={cityRangeTicks}
        formatValue={(value) => `City ${Math.round(value)}`}
        getSelectionLabel={(values) =>
            `Cities ${Math.round(values[0] ?? DEFAULT_CITY_RANGE[0])}-${Math.round(values[1] ?? DEFAULT_CITY_RANGE[1])}`}
        ariaLabelStart="Minimum city"
        ariaLabelEnd="Maximum city"
        onValuesCommit={handleCommit}
    />
</div>
