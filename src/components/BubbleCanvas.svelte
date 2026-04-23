<script lang="ts">
  import { createEventDispatcher, onMount, tick } from "svelte";
  import {
    buildBubbleChartModel,
    clearBubbleChart,
    createBubbleChartRenderCache,
    findBubbleHoverPoint,
    renderBubbleChart,
  } from "./bubble";
  import type {
    BubbleChartConfig,
    BubbleChartDomain,
    BubbleChartDatum,
    BubbleChartHoverPoint,
    BubbleChartModel,
    BubbleChartPointer,
    BubbleChartPointerEventDetail,
    BubbleChartRenderResult,
  } from "./bubble";

  export let data: BubbleChartDatum[] = [];
  export let model: BubbleChartModel | null = null;
  export let frameIndex = 0;
  export let config: BubbleChartConfig = {};
  export let ariaLabel = "Bubble chart";
  export let width: number | string = "100%";
  export let height: number | string = 420;
  export let sizeMultiplier = 1;
  export let enableZoomPan = true;
  export let maxZoom = 24;

  const dispatch = createEventDispatcher<{
    hover: BubbleChartPointerEventDetail;
    click: BubbleChartPointerEventDetail;
    frameRendered: BubbleChartRenderResult;
  }>();

  let host: HTMLDivElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let resolvedModel: BubbleChartModel | null = model;
  let renderResult: BubbleChartRenderResult | null = null;

  const cache = createBubbleChartRenderCache();

  let measuredWidth = 0;
  let measuredHeight = 0;
  let mounted = false;
  let rafId = 0;
  let resizeObserver: ResizeObserver | null = null;

  let lastDataRef: BubbleChartDatum[] = data;
  let lastProvidedModelRef: BubbleChartModel | null = model;
  let lastModelConfigRef = config?.model;
  let lastInteractionConfigRef = config?.interaction;

  let lastRenderModelRef: BubbleChartModel | null = resolvedModel;
  let lastRenderFrameIndex = frameIndex;
  let lastRenderConfigRef = config?.render;
  let lastThemeRef = config?.theme;
  let lastMeasuredWidth = measuredWidth;
  let lastMeasuredHeight = measuredHeight;
  let lastSizeMultiplier = 1;

  let lastPointer: BubbleChartPointer | null = null;
  let lastHoverKey: string | null = null;
  let pointerInside = false;

  let resolvedSizeMultiplier = 1;
  let viewXDomain: BubbleChartDomain | undefined;
  let viewYDomain: BubbleChartDomain | undefined;
  let isPanning = false;
  let panPointerId: number | null = null;
  let panStartPointerX = 0;
  let panStartPointerY = 0;
  let panStartXDomain: BubbleChartDomain | null = null;
  let panStartYDomain: BubbleChartDomain | null = null;
  let suppressNextClick = false;

  type PointerLikeEvent = MouseEvent | PointerEvent | WheelEvent;

  function clampSizeMultiplierValue(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.max(0.25, Math.min(4, value));
  }

  export function getCanvasElement(): HTMLCanvasElement | null {
    return canvas;
  }

  export function resetView(): void {
    resetViewState(true);
  }

  export async function downloadPng(
    fileName = "bubble-chart.png"
  ): Promise<boolean> {
    if (!canvas) return false;

    flushPendingRender();
    if (!renderResult && resolvedModel) {
      renderNow();
    }
    if (!canvas.width || !canvas.height) return false;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;

    const context = exportCanvas.getContext("2d");
    if (!context) return false;

    const backgroundColor = resolveExportBackgroundColor();
    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    context.drawImage(canvas, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      exportCanvas.toBlob(resolve, "image/png");
    });
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safePngFileName(fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    return true;
  }

  function toCssSize(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
  }

  $: hostStyle = `display:block;position:relative;width:${toCssSize(width)};height:${toCssSize(height)};`;
  $: canvasStyle = `display:block;width:100%;height:100%;cursor:${
    enableZoomPan ? (isPanning ? "grabbing" : "grab") : "crosshair"
  };touch-action:none;`;

  function hoverKey(point: BubbleChartHoverPoint | null): string | null {
    return point
      ? `${typeof point.frameId}:${String(point.frameId)}::${point.seriesId}`
      : null;
  }

  function safePngFileName(value: string): string {
    const trimmed = value.trim() || "bubble-chart.png";
    const withExtension = trimmed.toLowerCase().endsWith(".png")
      ? trimmed
      : `${trimmed}.png`;
    return withExtension.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-");
  }

  function resolveExportBackgroundColor(): string {
    const configuredBackground =
      typeof config?.theme?.backgroundColor === "string"
        ? config.theme.backgroundColor.trim()
        : "";

    if (
      configuredBackground &&
      configuredBackground.toLowerCase() !== "transparent"
    ) {
      return configuredBackground;
    }

    if (host) {
      const style = getComputedStyle(host);
      const surface = style.getPropertyValue("--ux-surface").trim();
      if (surface) return surface;

      const background = style.backgroundColor.trim();
      if (
        background &&
        background !== "transparent" &&
        background !== "rgba(0, 0, 0, 0)"
      ) {
        return background;
      }
    }

    return "#ffffff";
  }

  function normalizeDomain(domain: BubbleChartDomain): BubbleChartDomain {
    return domain[0] <= domain[1]
      ? [domain[0], domain[1]]
      : [domain[1], domain[0]];
  }

  function domainSpan(domain: BubbleChartDomain): number {
    const normalized = normalizeDomain(domain);
    return normalized[1] - normalized[0];
  }

  function domainsAlmostEqual(
    left: BubbleChartDomain | undefined,
    right: BubbleChartDomain | undefined
  ): boolean {
    if (!left || !right) return left === right;
    const normalizedLeft = normalizeDomain(left);
    const normalizedRight = normalizeDomain(right);
    const epsilon = Math.max(
      1,
      domainSpan(normalizedLeft),
      domainSpan(normalizedRight)
    ) * 1e-6;
    return (
      Math.abs(normalizedLeft[0] - normalizedRight[0]) <= epsilon &&
      Math.abs(normalizedLeft[1] - normalizedRight[1]) <= epsilon
    );
  }

  function clampDomainWindow(
    fullDomain: BubbleChartDomain,
    desiredDomain: BubbleChartDomain
  ): BubbleChartDomain {
    const full = normalizeDomain(fullDomain);
    const desired = normalizeDomain(desiredDomain);
    const fullSpan = full[1] - full[0];
    if (!Number.isFinite(fullSpan) || fullSpan <= 0) return full;

    const desiredSpan = desired[1] - desired[0];
    if (!Number.isFinite(desiredSpan) || desiredSpan <= 0) return full;
    if (desiredSpan >= fullSpan) return full;

    let nextMin = desired[0];
    let nextMax = desired[1];

    if (nextMin < full[0]) {
      nextMin = full[0];
      nextMax = nextMin + desiredSpan;
    }
    if (nextMax > full[1]) {
      nextMax = full[1];
      nextMin = nextMax - desiredSpan;
    }

    return [nextMin, nextMax];
  }

  function flushPendingRender(): void {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    renderNow();
  }

  function isPointerInPlotArea(pointer: BubbleChartPointer | null): boolean {
    if (!pointer || !renderResult) return false;
    const { plotArea } = renderResult;
    return (
      pointer.canvasX >= plotArea.left &&
      pointer.canvasX <= plotArea.right &&
      pointer.canvasY >= plotArea.top &&
      pointer.canvasY <= plotArea.bottom
    );
  }

  function normalizeWheelDeltaY(event: WheelEvent): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * (renderResult?.plotArea.height ?? 400);
    }
    return event.deltaY;
  }

  function applyViewDomains(
    nextXDomain: BubbleChartDomain,
    nextYDomain: BubbleChartDomain
  ): boolean {
    if (!resolvedModel) return false;

    const fullX = normalizeDomain(resolvedModel.xDomain);
    const fullY = normalizeDomain(resolvedModel.yDomain);

    const clampedX = clampDomainWindow(fullX, nextXDomain);
    const clampedY = clampDomainWindow(fullY, nextYDomain);
    const nextVisibleX = domainsAlmostEqual(clampedX, fullX)
      ? undefined
      : clampedX;
    const nextVisibleY = domainsAlmostEqual(clampedY, fullY)
      ? undefined
      : clampedY;

    if (
      domainsAlmostEqual(viewXDomain, nextVisibleX) &&
      domainsAlmostEqual(viewYDomain, nextVisibleY)
    ) {
      return false;
    }

    viewXDomain = nextVisibleX;
    viewYDomain = nextVisibleY;
    return true;
  }

  function zoomDomainAroundAnchor(
    currentDomain: BubbleChartDomain,
    fullDomain: BubbleChartDomain,
    anchorValue: number,
    zoomFactor: number
  ): BubbleChartDomain {
    const current = normalizeDomain(currentDomain);
    const full = normalizeDomain(fullDomain);

    const fullSpan = full[1] - full[0];
    const currentSpan = current[1] - current[0];
    if (
      !Number.isFinite(fullSpan) ||
      fullSpan <= 0 ||
      !Number.isFinite(currentSpan) ||
      currentSpan <= 0
    ) {
      return full;
    }

    const safeMaxZoom = Math.max(1, Number.isFinite(maxZoom) ? maxZoom : 1);
    const minSpan = fullSpan / safeMaxZoom;
    const safeFactor =
      Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
    const nextSpan = Math.min(
      fullSpan,
      Math.max(minSpan, currentSpan * safeFactor)
    );

    const rawRatio = (anchorValue - current[0]) / currentSpan;
    const ratio = Number.isFinite(rawRatio)
      ? Math.max(0, Math.min(1, rawRatio))
      : 0.5;

    const nextMin = anchorValue - ratio * nextSpan;
    return clampDomainWindow(full, [nextMin, nextMin + nextSpan]);
  }

  function resetViewState(shouldSchedule = true): void {
    viewXDomain = undefined;
    viewYDomain = undefined;
    isPanning = false;
    if (panPointerId != null && canvas?.hasPointerCapture?.(panPointerId)) {
      canvas.releasePointerCapture(panPointerId);
    }
    panPointerId = null;
    panStartPointerX = 0;
    panStartPointerY = 0;
    panStartXDomain = null;
    panStartYDomain = null;
    suppressNextClick = false;
    clearHoverState();
    if (shouldSchedule) {
      scheduleRender();
    }
  }

  function setMeasuredSize(nextWidth: number, nextHeight: number): boolean {
    const safeWidth = Number.isFinite(nextWidth) ? nextWidth : 0;
    const safeHeight = Number.isFinite(nextHeight) ? nextHeight : 0;
    if (safeWidth === measuredWidth && safeHeight === measuredHeight) {
      return false;
    }
    measuredWidth = safeWidth;
    measuredHeight = safeHeight;
    return true;
  }

  function measureHostSize(): boolean {
    if (!host) return false;
    const rect = host.getBoundingClientRect();
    return setMeasuredSize(rect.width, rect.height);
  }

  function scheduleRender(immediate = false): void {
    if (!mounted) return;

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if (immediate) {
      renderNow();
      return;
    }

    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderNow();
    });
  }

  function dispatchHoverByRules(
    point: BubbleChartHoverPoint | null,
    pointer: BubbleChartPointer | null
  ): void {
    if (point) {
      lastHoverKey = hoverKey(point);
      dispatch("hover", { point, pointer });
      return;
    }

    if (lastHoverKey !== null) {
      lastHoverKey = null;
      dispatch("hover", { point: null, pointer });
    }
  }

  function clearHoverState(): void {
    lastPointer = null;
    pointerInside = false;

    if (lastHoverKey !== null) {
      lastHoverKey = null;
      dispatch("hover", { point: null, pointer: null });
    }
  }

  function makePointer(event: PointerLikeEvent): BubbleChartPointer | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    return {
      clientX: event.clientX,
      clientY: event.clientY,
      pageX: event.pageX,
      pageY: event.pageY,
      canvasX: event.clientX - rect.left,
      canvasY: event.clientY - rect.top,
    };
  }

  function getHoverPoint(
    pointer: BubbleChartPointer | null
  ): BubbleChartHoverPoint | null {
    if (!pointer || !renderResult) return null;
    return findBubbleHoverPoint(
      renderResult,
      pointer.canvasX,
      pointer.canvasY,
      config?.interaction
    );
  }

  function recomputeHoverAfterRender(): void {
    if (!canvas || !renderResult || !lastPointer || !pointerInside) return;

    const rect = canvas.getBoundingClientRect();
    const pointer: BubbleChartPointer = {
      ...lastPointer,
      canvasX: lastPointer.clientX - rect.left,
      canvasY: lastPointer.clientY - rect.top,
    };

    lastPointer = pointer;
    const point = getHoverPoint(pointer);
    dispatchHoverByRules(point, pointer);
  }

  function renderNow(): void {
    if (!canvas) return;

    if ((measuredWidth <= 0 || measuredHeight <= 0) && host) {
      measureHostSize();
    }

    if (measuredWidth <= 0 || measuredHeight <= 0) {
      clearBubbleChart(canvas);
      renderResult = null;
      clearHoverState();
      return;
    }

    if (!resolvedModel) {
      clearBubbleChart(canvas);
      renderResult = null;
      clearHoverState();
      return;
    }

    renderResult = renderBubbleChart({
      canvas,
      model: resolvedModel,
      frameIndex,
      renderConfig: config?.render,
      theme: config?.theme,
      cache,
      cssWidth: measuredWidth,
      cssHeight: measuredHeight,
      viewXDomain,
      viewYDomain,
      sizeMultiplier: resolvedSizeMultiplier,
    });

    dispatch("frameRendered", renderResult);
    recomputeHoverAfterRender();
  }

  function handleWheel(event: WheelEvent): void {
    if (!enableZoomPan || !resolvedModel || !renderResult) return;

    const pointer = makePointer(event);
    if (!pointer || !isPointerInPlotArea(pointer)) return;

    const pixelDeltaY = normalizeWheelDeltaY(event);
    if (!Number.isFinite(pixelDeltaY) || pixelDeltaY === 0) return;

    event.preventDefault();

    const currentX = normalizeDomain(viewXDomain ?? resolvedModel.xDomain);
    const currentY = normalizeDomain(viewYDomain ?? resolvedModel.yDomain);
    const zoomFactor = Math.exp(pixelDeltaY * 0.0015);

    const nextX = zoomDomainAroundAnchor(
      currentX,
      resolvedModel.xDomain,
      renderResult.xScale.invert(pointer.canvasX),
      zoomFactor
    );
    const nextY = zoomDomainAroundAnchor(
      currentY,
      resolvedModel.yDomain,
      renderResult.yScale.invert(pointer.canvasY),
      zoomFactor
    );

    if (applyViewDomains(nextX, nextY)) {
      lastPointer = pointer;
      pointerInside = true;
      scheduleRender();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!enableZoomPan || !resolvedModel || !renderResult) return;
    if (event.button !== 0) return;

    const pointer = makePointer(event);
    if (!pointer || !isPointerInPlotArea(pointer)) return;

    event.preventDefault();
    clearHoverState();

    isPanning = true;
    panPointerId = event.pointerId;
    panStartPointerX = pointer.canvasX;
    panStartPointerY = pointer.canvasY;
    panStartXDomain = normalizeDomain(viewXDomain ?? resolvedModel.xDomain);
    panStartYDomain = normalizeDomain(viewYDomain ?? resolvedModel.yDomain);
    suppressNextClick = false;

    canvas?.setPointerCapture?.(event.pointerId);
  }

  function endPan(event?: PointerEvent): void {
    if (!isPanning) return;

    const pointerId = panPointerId;
    isPanning = false;
    panPointerId = null;
    panStartXDomain = null;
    panStartYDomain = null;

    if (pointerId != null && canvas?.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    if (event) {
      const pointer = makePointer(event);
      pointerInside = pointer !== null;
      lastPointer = pointer;
      const point = getHoverPoint(pointer);
      dispatchHoverByRules(point, pointer);
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (
      isPanning &&
      event.pointerId === panPointerId &&
      resolvedModel &&
      renderResult &&
      panStartXDomain &&
      panStartYDomain
    ) {
      const pointer = makePointer(event);
      if (!pointer) return;

      const dx = pointer.canvasX - panStartPointerX;
      const dy = pointer.canvasY - panStartPointerY;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        suppressNextClick = true;
      }

      const xSpan = panStartXDomain[1] - panStartXDomain[0];
      const ySpan = panStartYDomain[1] - panStartYDomain[0];
      const { plotArea } = renderResult;

      const domainDx = plotArea.width > 0 ? -(dx / plotArea.width) * xSpan : 0;
      const domainDy = plotArea.height > 0 ? (dy / plotArea.height) * ySpan : 0;

      if (
        applyViewDomains(
          [panStartXDomain[0] + domainDx, panStartXDomain[1] + domainDx],
          [panStartYDomain[0] + domainDy, panStartYDomain[1] + domainDy]
        )
      ) {
        scheduleRender();
      }
      return;
    }

    const pointer = makePointer(event);
    pointerInside = true;
    lastPointer = pointer;

    const point = getHoverPoint(pointer);
    dispatchHoverByRules(point, pointer);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (isPanning && event.pointerId === panPointerId) {
      endPan(event);
    }
  }

  function handlePointerLeave(): void {
    if (isPanning) return;
    clearHoverState();
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (isPanning && event.pointerId === panPointerId) {
      endPan();
    }
    clearHoverState();
  }

  function handleLostPointerCapture(): void {
    isPanning = false;
    panPointerId = null;
    panStartXDomain = null;
    panStartYDomain = null;
  }

  function handleDoubleClick(event: MouseEvent): void {
    if (!enableZoomPan) return;
    event.preventDefault();
    resetView();
  }

  function handleClick(event: MouseEvent): void {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const pointer = makePointer(event);
    const point = getHoverPoint(pointer);
    dispatch("click", { point, pointer });
  }

  $: resolvedSizeMultiplier = clampSizeMultiplierValue(sizeMultiplier);

  $: {
    const nextProvidedModelRef = model;
    const nextModelConfigRef = config?.model;
    if (nextProvidedModelRef !== lastProvidedModelRef) {
      lastProvidedModelRef = nextProvidedModelRef;
      if (nextProvidedModelRef) {
        resolvedModel = nextProvidedModelRef;
      } else {
        lastDataRef = data;
        lastModelConfigRef = nextModelConfigRef;
        resolvedModel = buildBubbleChartModel(data, nextModelConfigRef);
      }
      scheduleRender();
    } else if (
      !nextProvidedModelRef &&
      (data !== lastDataRef || nextModelConfigRef !== lastModelConfigRef)
    ) {
      lastDataRef = data;
      lastModelConfigRef = nextModelConfigRef;
      resolvedModel = buildBubbleChartModel(data, nextModelConfigRef);
      scheduleRender();
    }
  }

  $: {
    const nextInteractionConfigRef = config?.interaction;
    if (nextInteractionConfigRef !== lastInteractionConfigRef) {
      lastInteractionConfigRef = nextInteractionConfigRef;

      if (pointerInside) {
        const point = getHoverPoint(lastPointer);
        dispatchHoverByRules(point, lastPointer);
      }
    }
  }

  $: {
    const nextRenderConfigRef = config?.render;
    const nextThemeRef = config?.theme;

    if (
      resolvedModel !== lastRenderModelRef ||
      frameIndex !== lastRenderFrameIndex ||
      nextRenderConfigRef !== lastRenderConfigRef ||
      nextThemeRef !== lastThemeRef ||
      measuredWidth !== lastMeasuredWidth ||
      measuredHeight !== lastMeasuredHeight ||
      resolvedSizeMultiplier !== lastSizeMultiplier
    ) {
      lastRenderModelRef = resolvedModel;
      lastRenderFrameIndex = frameIndex;
      lastRenderConfigRef = nextRenderConfigRef;
      lastThemeRef = nextThemeRef;
      lastMeasuredWidth = measuredWidth;
      lastMeasuredHeight = measuredHeight;
      lastSizeMultiplier = resolvedSizeMultiplier;
      scheduleRender();
    }
  }

  onMount(() => {
    let disposed = false;
    mounted = true;

    void tick().then(() => {
      if (disposed) return;
      measureHostSize();
      scheduleRender(true);
    });

    const handleWindowResize = () => {
      measureHostSize();
      scheduleRender();
    };

    if (typeof ResizeObserver !== "undefined" && host) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        let sizeChanged = false;
        if (entry) {
          sizeChanged = setMeasuredSize(
            entry.contentRect.width,
            entry.contentRect.height
          );
        } else {
          sizeChanged = measureHostSize();
        }
        if (sizeChanged) {
          scheduleRender();
        }
      });
      resizeObserver.observe(host);
    }

    window.addEventListener("resize", handleWindowResize);

    if (measuredWidth > 0 && measuredHeight > 0) {
      lastRenderModelRef = resolvedModel;
      lastRenderFrameIndex = frameIndex;
      lastRenderConfigRef = config?.render;
      lastThemeRef = config?.theme;
      lastMeasuredWidth = measuredWidth;
      lastMeasuredHeight = measuredHeight;
      lastSizeMultiplier = resolvedSizeMultiplier;
      renderNow();
    }

    return () => {
      disposed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener("resize", handleWindowResize);
      mounted = false;
    };
  });
</script>

<div bind:this={host} role="img" aria-label={ariaLabel} style={hostStyle}>
  <canvas
    bind:this={canvas}
    aria-hidden="true"
    on:pointerdown={handlePointerDown}
    on:pointermove={handlePointerMove}
    on:pointerleave={handlePointerLeave}
    on:pointerup={handlePointerUp}
    on:pointercancel={handlePointerCancel}
    on:lostpointercapture={handleLostPointerCapture}
    on:dblclick={handleDoubleClick}
    on:wheel|nonpassive={handleWheel}
    on:click={handleClick}
    style={canvasStyle}
  ></canvas>
</div>
