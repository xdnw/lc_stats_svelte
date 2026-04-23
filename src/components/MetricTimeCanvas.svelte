<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import {
        clearMetricTimeCanvas,
        findMetricTimeHoverDatum,
        renderMetricTimeCanvas,
        type MetricTimeCanvasModel,
        type MetricTimeCanvasRenderResult,
        type MetricTimeHoverDatum,
    } from "$lib/metricTimeCanvas";

    export let model: MetricTimeCanvasModel | null = null;
    export let ariaLabel = "Metric timeline";
    export let height = "clamp(320px, 62vh, 640px)";

    const dispatch = createEventDispatcher<{
        hover: {
            datum: MetricTimeHoverDatum | null;
            width: number;
            height: number;
        };
        rendered: {
            renderResult: MetricTimeCanvasRenderResult;
        };
    }>();

    let canvas: HTMLCanvasElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let renderFrame: number | null = null;
    let renderResult: MetricTimeCanvasRenderResult | null = null;

    function cancelScheduledRender(): void {
        if (renderFrame == null) return;
        cancelAnimationFrame(renderFrame);
        renderFrame = null;
    }

    function dispatchHover(datum: MetricTimeHoverDatum | null): void {
        dispatch("hover", {
            datum,
            width: renderResult?.cssWidth ?? 0,
            height: renderResult?.cssHeight ?? 0,
        });
    }

    function renderNow(): void {
        if (!canvas) return;
        renderResult = renderMetricTimeCanvas({
            canvas,
            model,
        });
        dispatch("rendered", { renderResult });
    }

    function scheduleRender(): void {
        cancelScheduledRender();
        renderFrame = requestAnimationFrame(() => {
            renderFrame = null;
            renderNow();
        });
    }

    function handlePointerMove(event: PointerEvent): void {
        dispatchHover(
            findMetricTimeHoverDatum(
                renderResult,
                event.offsetX,
                event.offsetY,
            ),
        );
    }

    function handlePointerLeave(): void {
        dispatchHover(null);
    }

    onMount(() => {
        if (!canvas) return;
        resizeObserver = new ResizeObserver(() => {
            scheduleRender();
        });
        resizeObserver.observe(canvas);
        scheduleRender();
    });

    onDestroy(() => {
        cancelScheduledRender();
        resizeObserver?.disconnect();
        resizeObserver = null;
    });

    $: if (canvas && model) {
        scheduleRender();
    }

    $: if (!model && canvas) {
        clearMetricTimeCanvas(canvas);
        renderResult = null;
    }
</script>

<canvas
    bind:this={canvas}
    aria-label={ariaLabel}
    class="ux-metric-time-canvas"
    style={`height:${height};`}
    on:pointermove={handlePointerMove}
    on:pointerleave={handlePointerLeave}
></canvas>

<style>
    .ux-metric-time-canvas {
        display: block;
        width: 100%;
        cursor: crosshair;
        color: var(--bs-body-color);
        --metric-time-axis-color: rgba(71, 85, 105, 0.92);
        --metric-time-grid-color: rgba(148, 163, 184, 0.22);
        --metric-time-text-color: var(--bs-body-color);
        --metric-time-empty-color: rgba(71, 85, 105, 0.88);
    }

    :global([data-bs-theme="dark"]) .ux-metric-time-canvas {
        --metric-time-axis-color: rgba(203, 213, 225, 0.92);
        --metric-time-grid-color: rgba(148, 163, 184, 0.18);
        --metric-time-empty-color: rgba(203, 213, 225, 0.86);
    }
</style>
