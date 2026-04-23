<script lang="ts">
    import { onDestroy } from "svelte";
    import {
        buildSliderContextSignature,
        cloneSliderValues,
        normalizeGraphSliderScalar,
        normalizeGraphSliderValues,
        resolveDraggedThumbIndex,
        sliderValuesEqual,
        type SliderContext,
        type SliderMode,
        type SliderValueNormalizer,
    } from "$lib/graphSlider";
    import type { SliderTickDescriptor } from "$lib/sliderTicks";

    export let min = 0;
    export let max = 100;
    export let step = 1;
    export let mode: SliderMode = "single";
    export let values: number[] = [0];
    export let ticks: SliderTickDescriptor[] = [];
    export let formatValue: (value: number) => string = (value) => `${value}`;
    export let normalizeValues: SliderValueNormalizer = normalizeGraphSliderValues;
    export let normalizationKey = "";
    export let selectionLabel: string | null = null;
    export let getSelectionLabel: ((values: number[]) => string) | null = null;
    export let showSelectionSummary = true;
    export let ariaLabel = "Slider";
    export let ariaLabelStart = "Start value";
    export let ariaLabelEnd = "End value";
    export let disabled = false;
    export let onValuesInput: (values: number[]) => void = () => {};
    export let onValuesCommit: (values: number[]) => void = () => {};

    let railElement: HTMLDivElement | null = null;
    let sliderContext: SliderContext = { min, max, step, mode };
    let contextSignature = buildSliderContextSignature(
        sliderContext,
        normalizationKey,
    );
    let localValues = normalizeForContext(values);
    let isDragging = false;
    let activeThumbIndex = 0;
    let focusedThumbIndex: number | null = null;
    let hoveredThumbIndex: number | null = null;
    let activePointerId: number | null = null;
    let lastRawExternalValues = cloneSliderValues(values);
    let lastContextSignature = contextSignature;
    let pendingLocalValues: number[] | null = null;

    function normalizeForContext(nextValues: number[]): number[] {
        return normalizeValues(cloneSliderValues(nextValues), sliderContext);
    }

    function buildSelectionLabel(nextValues: number[]): string {
        if (getSelectionLabel) {
            return getSelectionLabel(cloneSliderValues(nextValues));
        }

        if (selectionLabel != null) {
            return selectionLabel;
        }

        if (mode === "range") {
            return `${formatValue(nextValues[0] ?? min)} - ${formatValue(nextValues[1] ?? max)}`;
        }

        return formatValue(nextValues[0] ?? min);
    }

    function valueToPercent(value: number): number {
        const spanStart = Math.min(min, max);
        const spanEnd = Math.max(min, max);
        if (spanEnd <= spanStart) {
            return 50;
        }
        return ((value - spanStart) / (spanEnd - spanStart)) * 100;
    }

    function percentToValue(clientX: number): number {
        const rect = railElement?.getBoundingClientRect();
        if (!rect || rect.width <= 0) {
            return localValues[activeThumbIndex] ?? min;
        }

        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return normalizeGraphSliderScalar(min + ratio * (max - min), sliderContext);
    }

    function updateLocalValues(
        thumbIndex: number,
        nextValue: number,
        options?: {
            emitInput?: boolean;
            emitCommit?: boolean;
        },
    ): number[] {
        const nextValues = cloneSliderValues(localValues);
        nextValues[thumbIndex] = nextValue;
        const normalizedValues = normalizeForContext(nextValues);

        if (!sliderValuesEqual(localValues, normalizedValues)) {
            localValues = normalizedValues;
            if (options?.emitInput) {
                pendingLocalValues = cloneSliderValues(normalizedValues);
                onValuesInput(cloneSliderValues(normalizedValues));
            }
        }

        if (options?.emitCommit) {
            pendingLocalValues = cloneSliderValues(normalizedValues);
            onValuesCommit(cloneSliderValues(normalizedValues));
        }

        return normalizedValues;
    }

    function chooseNearestThumb(value: number): number {
        if (mode !== "range") {
            return 0;
        }

        const startDistance = Math.abs(value - (localValues[0] ?? min));
        const endDistance = Math.abs(value - (localValues[1] ?? max));
        return startDistance <= endDistance ? 0 : 1;
    }

    function stopDragging(): void {
        if (!isDragging) return;
        isDragging = false;
        if (
            railElement &&
            activePointerId != null &&
            railElement.hasPointerCapture?.(activePointerId)
        ) {
            railElement.releasePointerCapture(activePointerId);
        }
        activePointerId = null;
    }

    function beginDragging(
        thumbIndex: number,
        event: PointerEvent,
    ): void {
        if (disabled) return;
        activeThumbIndex = thumbIndex;
        activePointerId = event.pointerId;
        isDragging = true;
        hoveredThumbIndex = thumbIndex;
        railElement?.setPointerCapture?.(event.pointerId);
    }

    function handleRailPointerDown(event: PointerEvent): void {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        const nextValue = percentToValue(event.clientX);
        const thumbIndex = chooseNearestThumb(nextValue);
        updateLocalValues(thumbIndex, nextValue, {
            emitInput: true,
        });
        beginDragging(thumbIndex, event);
    }

    function handleThumbPointerDown(
        thumbIndex: number,
        event: PointerEvent,
    ): void {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        beginDragging(thumbIndex, event);
    }

    function handleRailPointerMove(event: PointerEvent): void {
        if (!isDragging || activePointerId !== event.pointerId) return;
        event.preventDefault();
        const nextValue = percentToValue(event.clientX);
        activeThumbIndex = resolveDraggedThumbIndex(
            mode,
            activeThumbIndex,
            localValues,
            nextValue,
        );
        updateLocalValues(activeThumbIndex, nextValue, {
            emitInput: true,
        });
    }

    function finishDrag(event: PointerEvent): void {
        if (!isDragging || activePointerId !== event.pointerId) return;
        event.preventDefault();
        const nextValue = percentToValue(event.clientX);
        activeThumbIndex = resolveDraggedThumbIndex(
            mode,
            activeThumbIndex,
            localValues,
            nextValue,
        );
        updateLocalValues(activeThumbIndex, nextValue, {
            emitInput: true,
            emitCommit: true,
        });
        stopDragging();
    }

    function handleRailPointerUp(event: PointerEvent): void {
        finishDrag(event);
    }

    function handleRailPointerCancel(event: PointerEvent): void {
        finishDrag(event);
    }

    function stepValue(currentValue: number, direction: number): number {
        const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
        return normalizeGraphSliderScalar(
            currentValue + safeStep * direction,
            sliderContext,
        );
    }

    function handleThumbKeyDown(
        thumbIndex: number,
        event: KeyboardEvent,
    ): void {
        if (disabled) return;

        const currentValue = localValues[thumbIndex] ?? min;
        let nextValue: number | null = null;

        switch (event.key) {
            case "ArrowLeft":
            case "ArrowDown":
                nextValue = stepValue(currentValue, -1);
                break;
            case "ArrowRight":
            case "ArrowUp":
                nextValue = stepValue(currentValue, 1);
                break;
            case "PageDown":
                nextValue = stepValue(currentValue, -10);
                break;
            case "PageUp":
                nextValue = stepValue(currentValue, 10);
                break;
            case "Home":
                nextValue = Math.min(min, max);
                break;
            case "End":
                nextValue = Math.max(min, max);
                break;
            default:
                return;
        }

        event.preventDefault();
        updateLocalValues(thumbIndex, nextValue, {
            emitInput: true,
            emitCommit: true,
        });
    }

    onDestroy(() => {
        stopDragging();
    });

    $: sliderContext = { min, max, step, mode };
    $: contextSignature = buildSliderContextSignature(
        sliderContext,
        normalizationKey,
    );
    $: normalizedExternalValues = normalizeValues(
        cloneSliderValues(values),
        sliderContext,
    );
    $: {
        const rawExternalValues = cloneSliderValues(values);
        const rawExternalChanged = !sliderValuesEqual(
            lastRawExternalValues,
            rawExternalValues,
        );
        const contextChanged = lastContextSignature !== contextSignature;
        const externalCaughtUp =
            pendingLocalValues != null &&
            sliderValuesEqual(pendingLocalValues, normalizedExternalValues);

        if (rawExternalChanged) {
            lastRawExternalValues = rawExternalValues;
            lastContextSignature = contextSignature;
            pendingLocalValues = null;
            if (!sliderValuesEqual(localValues, normalizedExternalValues)) {
                localValues = normalizedExternalValues;
            }
        } else if (contextChanged) {
            lastContextSignature = contextSignature;
            pendingLocalValues = null;
            const adaptedLocalValues = normalizeForContext(localValues);
            if (!sliderValuesEqual(localValues, adaptedLocalValues)) {
                localValues = adaptedLocalValues;
            }
        } else if (
            !isDragging &&
            (pendingLocalValues == null || externalCaughtUp) &&
            !sliderValuesEqual(localValues, normalizedExternalValues)
        ) {
            pendingLocalValues = null;
            localValues = normalizedExternalValues;
        }

        if (!contextChanged) {
            lastContextSignature = contextSignature;
        }
    }

    $: sliderSelectionLabel = buildSelectionLabel(localValues);
    $: startPercent = valueToPercent(localValues[0] ?? min);
    $: endPercent =
        mode === "range"
            ? valueToPercent(localValues[1] ?? max)
            : Math.max(startPercent, min === max ? 100 : startPercent);
    $: selectedTickValues = new Set(localValues);
</script>

<div class="ux-slider" class:ux-slider--disabled={disabled}>
    {#if showSelectionSummary}
        <div class="ux-slider__summary" aria-live="polite">{sliderSelectionLabel}</div>
    {/if}
    <div
        class="ux-slider__rail-shell"
        bind:this={railElement}
        role="presentation"
        on:pointerdown={handleRailPointerDown}
        on:pointermove={handleRailPointerMove}
        on:pointerup={handleRailPointerUp}
        on:pointercancel={handleRailPointerCancel}
    >
        <div class="ux-slider__rail">
            <div
                class="ux-slider__fill"
                style={`left:${mode === "range" ? startPercent : 0}%;width:${mode === "range" ? Math.max(endPercent - startPercent, 0) : endPercent}%;`}
            ></div>
            <div
                class="ux-slider__thumb"
                class:is-active={isDragging && activeThumbIndex === 0}
                class:is-focused={focusedThumbIndex === 0}
                class:is-hovered={hoveredThumbIndex === 0}
                style={`left:${startPercent}%;`}
                aria-label={mode === "range" ? ariaLabelStart : ariaLabel}
                aria-disabled={disabled}
                aria-orientation="horizontal"
                aria-valuemax={mode === "range" ? localValues[1] ?? max : max}
                aria-valuemin={min}
                aria-valuenow={localValues[0] ?? min}
                aria-valuetext={formatValue(localValues[0] ?? min)}
                role="slider"
                tabindex={disabled ? -1 : 0}
                on:pointerdown|stopPropagation={(event) =>
                    handleThumbPointerDown(0, event)}
                on:keydown={(event) => handleThumbKeyDown(0, event)}
                on:focus={() => (focusedThumbIndex = 0)}
                on:blur={() => (focusedThumbIndex = null)}
                on:pointerenter={() => (hoveredThumbIndex = 0)}
                on:pointerleave={() =>
                    hoveredThumbIndex = hoveredThumbIndex === 0 ? null : hoveredThumbIndex}
            >
                <span class="ux-slider__thumb-label">{formatValue(localValues[0] ?? min)}</span>
            </div>
            {#if mode === "range"}
                <div
                    class="ux-slider__thumb"
                    class:is-active={isDragging && activeThumbIndex === 1}
                    class:is-focused={focusedThumbIndex === 1}
                    class:is-hovered={hoveredThumbIndex === 1}
                    style={`left:${endPercent}%;`}
                    aria-label={ariaLabelEnd}
                    aria-disabled={disabled}
                    aria-orientation="horizontal"
                    aria-valuemax={max}
                    aria-valuemin={localValues[0] ?? min}
                    aria-valuenow={localValues[1] ?? max}
                    aria-valuetext={formatValue(localValues[1] ?? max)}
                    role="slider"
                    tabindex={disabled ? -1 : 0}
                    on:pointerdown|stopPropagation={(event) =>
                        handleThumbPointerDown(1, event)}
                    on:keydown={(event) => handleThumbKeyDown(1, event)}
                    on:focus={() => (focusedThumbIndex = 1)}
                    on:blur={() => (focusedThumbIndex = null)}
                    on:pointerenter={() => (hoveredThumbIndex = 1)}
                    on:pointerleave={() =>
                        hoveredThumbIndex = hoveredThumbIndex === 1 ? null : hoveredThumbIndex}
                >
                    <span class="ux-slider__thumb-label">
                        {formatValue(localValues[1] ?? max)}
                    </span>
                </div>
            {/if}
        </div>
    </div>
    {#if ticks.length > 0}
        <div class="ux-slider__ticks" aria-hidden="true">
            {#each ticks as tick (tick.value)}
                <span
                    class="ux-slider__tick"
                    class:is-start={tick.anchor === "start"}
                    class:is-end={tick.anchor === "end"}
                    class:is-selected={selectedTickValues.has(tick.value)}
                    style={`left:${tick.percent}%;`}
                >
                    {tick.label}
                </span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .ux-slider {
        min-width: 0;
        display: grid;
        gap: 0.24rem;
        user-select: none;
    }

    .ux-slider--disabled {
        opacity: 0.72;
    }

    .ux-slider__summary {
        min-height: 1rem;
        color: var(--ux-text-muted);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1.15;
        letter-spacing: 0.02em;
    }

    .ux-slider__rail-shell {
        min-width: 0;
        position: relative;
        padding: 0.28rem 0;
        touch-action: none;
    }

    .ux-slider__rail {
        position: relative;
        height: 0.38rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 88%, transparent);
        border-radius: 4px;
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--ux-surface-alt) 96%, transparent),
            color-mix(in srgb, rgba(148, 163, 184, 0.18) 82%, var(--ux-surface))
        );
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.06);
    }

    .ux-slider__fill {
        position: absolute;
        top: -1px;
        bottom: -1px;
        border: 1px solid color-mix(in srgb, var(--ux-brand) 28%, transparent);
        border-radius: 4px;
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--ux-brand) 82%, white),
            color-mix(in srgb, var(--ux-brand) 68%, white)
        );
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
        pointer-events: none;
    }

    .ux-slider__thumb {
        position: absolute;
        top: 50%;
        width: 0.92rem;
        height: 1.1rem;
        margin: 0;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--ux-brand) 32%, var(--ux-border));
        border-radius: 4px;
        background: linear-gradient(
            180deg,
            color-mix(in srgb, white 96%, var(--ux-surface)),
            color-mix(in srgb, var(--ux-surface-alt) 92%, rgba(148, 163, 184, 0.08))
        );
        box-shadow:
            0 2px 6px rgba(15, 23, 42, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        transform: translate(-50%, -50%);
        cursor: grab;
        z-index: 1;
    }

    .ux-slider__thumb::before {
        content: "";
        position: absolute;
        inset: 0.2rem 0.32rem;
        border-radius: 2px;
        background: linear-gradient(
            180deg,
            rgba(148, 163, 184, 0.85),
            rgba(100, 116, 139, 0.92)
        );
    }

    .ux-slider__thumb[aria-disabled="true"] {
        cursor: default;
    }

    .ux-slider__thumb-label {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 0.28rem);
        transform: translateX(-50%);
        padding: 0.08rem 0.28rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 84%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
        color: var(--ux-text);
        font-size: 0.64rem;
        font-weight: 600;
        line-height: 1.1;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 120ms ease;
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
    }

    .ux-slider__thumb.is-active,
    .ux-slider__thumb.is-focused,
    .ux-slider__thumb.is-hovered {
        border-color: color-mix(in srgb, var(--ux-brand) 54%, transparent);
        box-shadow:
            0 0 0 3px color-mix(in srgb, var(--ux-brand) 16%, transparent),
            0 4px 10px rgba(15, 23, 42, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.62);
        outline: none;
        z-index: 2;
    }

    .ux-slider__thumb.is-active {
        cursor: grabbing;
    }

    .ux-slider__thumb.is-active .ux-slider__thumb-label,
    .ux-slider__thumb.is-focused .ux-slider__thumb-label,
    .ux-slider__thumb.is-hovered .ux-slider__thumb-label {
        opacity: 1;
    }

    .ux-slider__ticks {
        min-width: 0;
        position: relative;
        height: 1rem;
        pointer-events: none;
    }

    .ux-slider__tick {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        color: var(--ux-text-muted);
        font-size: 0.64rem;
        line-height: 1;
        white-space: nowrap;
    }

    .ux-slider__tick::before {
        content: "";
        position: absolute;
        left: 50%;
        bottom: calc(100% + 0.14rem);
        width: 1px;
        height: 0.28rem;
        transform: translateX(-50%);
        background: rgba(148, 163, 184, 0.75);
    }

    .ux-slider__tick.is-start {
        transform: none;
        text-align: left;
    }

    .ux-slider__tick.is-end {
        transform: translateX(-100%);
        text-align: right;
    }

    .ux-slider__tick.is-start::before {
        left: 0;
        transform: none;
    }

    .ux-slider__tick.is-end::before {
        left: 100%;
        transform: translateX(-100%);
    }

    .ux-slider__tick.is-selected {
        color: color-mix(in srgb, var(--ux-text) 88%, var(--ux-brand));
        font-weight: 700;
    }

    :global(html[data-bs-theme="dark"]) .ux-slider__summary,
    :global(html[data-bs-theme="dark"]) .ux-slider__tick {
        color: rgba(203, 213, 225, 0.86);
    }

    :global(html[data-bs-theme="dark"]) .ux-slider__tick.is-selected {
        color: rgba(248, 250, 252, 0.96);
    }

    :global(html[data-bs-theme="dark"]) .ux-slider__rail {
        border-color: rgba(148, 163, 184, 0.3);
        background: linear-gradient(
            180deg,
            rgba(30, 41, 59, 0.94),
            rgba(51, 65, 85, 0.8)
        );
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.28);
    }

    :global(html[data-bs-theme="dark"]) .ux-slider__thumb {
        background: linear-gradient(
            180deg,
            rgba(248, 250, 252, 0.96),
            rgba(226, 232, 240, 0.9)
        );
    }

    :global(html[data-bs-theme="dark"]) .ux-slider__thumb-label {
        border-color: rgba(148, 163, 184, 0.28);
        background: rgba(15, 23, 42, 0.96);
        color: rgba(248, 250, 252, 0.96);
        box-shadow: 0 8px 18px rgba(2, 6, 23, 0.32);
    }

    @media (max-width: 768px) {
        .ux-slider__tick {
            font-size: 0.59rem;
        }
    }
</style>
