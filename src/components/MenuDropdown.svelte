<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import type { AppIconName } from "$lib/icons";
    import Icon from "./Icon.svelte";

    export let align: "start" | "end" = "start";
    export let buttonAriaLabel = "";
    export let buttonClass = "btn ux-btn btn-sm";
    export let closeOnContentClick = false;
    export let disabled = false;
    export let icon: AppIconName | null = "chevronDown";
    export let label = "";
    export let open = false;
    export let panelClass = "";
    export let panelStyle = "";
    export let title = "";

    let root: HTMLDivElement | null = null;
    let panel: HTMLDivElement | null = null;
    let trigger: HTMLButtonElement | null = null;
    let panelPositionStyle = "";
    let panelPositionReady = false;
    let panelPositionFrame = 0;
    let viewportListenersAttached = false;
    const PANEL_VIEWPORT_MARGIN_PX = 8;
    const PANEL_OFFSET_PX = 6;
    const panelId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `ux-menu-${crypto.randomUUID()}`
            : `ux-menu-${Math.random().toString(36).slice(2, 10)}`;

    $: resolvedButtonAriaLabel = buttonAriaLabel || label;
    $: resolvedButtonTitle = title || label;
    $: resolvedPanelAriaLabel = resolvedButtonAriaLabel || resolvedButtonTitle;
    $: resolvedPanelStyle = [
        panelStyle,
        panelPositionStyle,
        `visibility:${panelPositionReady ? "visible" : "hidden"}`,
    ]
        .filter(Boolean)
        .join("; ");

    function closeMenu(options: { restoreFocus?: boolean } = {}): void {
        if (!open) return;
        open = false;
        if (options.restoreFocus) {
            trigger?.focus();
        }
    }

    function toggleMenu(): void {
        if (disabled) return;
        open = !open;
    }

    function cancelPanelPositionFrame(): void {
        if (panelPositionFrame === 0 || typeof cancelAnimationFrame !== "function") return;
        cancelAnimationFrame(panelPositionFrame);
        panelPositionFrame = 0;
    }

    function clampPanelCoordinate(
        desired: number,
        panelSize: number,
        viewportSize: number,
    ): number {
        const min = PANEL_VIEWPORT_MARGIN_PX;
        const max = Math.max(
            min,
            viewportSize - PANEL_VIEWPORT_MARGIN_PX - panelSize,
        );
        return Math.min(Math.max(min, desired), max);
    }

    async function syncPanelPosition(): Promise<void> {
        if (!open) {
            panelPositionReady = false;
            return;
        }

        await tick();
        if (!open || !trigger || !panel || typeof window === "undefined") {
            return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const maxPanelWidth = Math.max(0, viewportWidth - PANEL_VIEWPORT_MARGIN_PX * 2);
        const maxPanelHeight = Math.max(0, viewportHeight - PANEL_VIEWPORT_MARGIN_PX * 2);
        const panelWidth = Math.min(
            Math.max(panelRect.width, panel.scrollWidth, 0),
            maxPanelWidth,
        );
        const panelHeight = Math.min(
            Math.max(panelRect.height, panel.scrollHeight, 0),
            maxPanelHeight,
        );
        const preferredLeft =
            align === "end" ? triggerRect.right - panelWidth : triggerRect.left;
        const preferredTop = triggerRect.bottom + PANEL_OFFSET_PX;
        const preferredAboveTop = triggerRect.top - PANEL_OFFSET_PX - panelHeight;
        const top =
            preferredTop + panelHeight <= viewportHeight - PANEL_VIEWPORT_MARGIN_PX
                ? preferredTop
                : preferredAboveTop >= PANEL_VIEWPORT_MARGIN_PX
                  ? preferredAboveTop
                  : preferredTop;

        panelPositionStyle = [
            "position:fixed",
            `left:${Math.round(clampPanelCoordinate(preferredLeft, panelWidth, viewportWidth))}px`,
            `top:${Math.round(clampPanelCoordinate(top, panelHeight, viewportHeight))}px`,
            `max-width:${Math.round(maxPanelWidth)}px`,
            `max-height:${Math.round(maxPanelHeight)}px`,
            "right:auto",
            "bottom:auto",
        ].join("; ");
        panelPositionReady = true;
    }

    function requestPanelPositionSync(): void {
        cancelPanelPositionFrame();
        panelPositionReady = false;
        if (!open || typeof requestAnimationFrame !== "function") {
            void syncPanelPosition();
            return;
        }

        panelPositionFrame = requestAnimationFrame(() => {
            panelPositionFrame = 0;
            void syncPanelPosition();
        });
    }

    function handleViewportChange(): void {
        if (!open) return;
        requestPanelPositionSync();
    }

    function attachViewportListeners(): void {
        if (viewportListenersAttached || typeof window === "undefined") return;
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
        viewportListenersAttached = true;
    }

    function detachViewportListeners(): void {
        if (!viewportListenersAttached || typeof window === "undefined") return;
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
        viewportListenersAttached = false;
    }

    function handleDocumentPointerDown(event: PointerEvent): void {
        if (!open) return;
        const target = event.target;
        if (target instanceof Node && root?.contains(target)) return;
        closeMenu();
    }

    function handleDocumentFocusIn(event: FocusEvent): void {
        if (!open) return;
        const target = event.target;
        if (target instanceof Node && root?.contains(target)) return;
        closeMenu();
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (!open || !closeOnContentClick || !panel) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!panel.contains(target)) return;
        if (target.closest("[data-menu-keep-open]")) return;
        if (target.closest("button, [href], [role='button']")) {
            closeMenu();
        }
    }

    function handleDocumentKeyDown(event: KeyboardEvent): void {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        closeMenu({ restoreFocus: true });
    }

    function handleTriggerKeyDown(event: KeyboardEvent): void {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeMenu({ restoreFocus: true });
    }

    $: if (disabled && open) {
        closeMenu();
    }

    $: if (open) {
        attachViewportListeners();
        requestPanelPositionSync();
    } else {
        detachViewportListeners();
        cancelPanelPositionFrame();
        panelPositionReady = false;
        panelPositionStyle = "";
    }

    onDestroy(() => {
        detachViewportListeners();
        cancelPanelPositionFrame();
    });
</script>

<svelte:document
    on:pointerdown={handleDocumentPointerDown}
    on:focusin={handleDocumentFocusIn}
    on:click={handleDocumentClick}
    on:keydown={handleDocumentKeyDown}
/>

<div bind:this={root} class="ux-menu">
    <button
        bind:this={trigger}
        type="button"
        class={buttonClass}
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={resolvedButtonAriaLabel || undefined}
        {disabled}
        title={resolvedButtonTitle || undefined}
        on:click={toggleMenu}
        on:keydown={handleTriggerKeyDown}
    >
        <span class="ux-menu-trigger-content">
            <slot name="label">{label}</slot>
            {#if icon}
                <Icon name={icon} className="ux-menu-trigger-icon" />
            {/if}
        </span>
    </button>
    {#if open}
        <div
            bind:this={panel}
            id={panelId}
            class={`ux-menu-panel ${align === "end" ? "ux-menu-panel-end" : ""} ${panelClass}`.trim()}
            style={resolvedPanelStyle}
            role="group"
            aria-label={resolvedPanelAriaLabel || undefined}
        >
            <slot />
        </div>
    {/if}
</div>

<style>
    .ux-menu {
        position: relative;
        display: inline-flex;
        align-items: center;
    }

    .ux-menu-panel {
        position: fixed;
        top: 0;
        left: 0;
        width: fit-content;
        min-width: 0;
        max-width: min(12rem, calc(100vw - 0.75rem));
        max-height: min(70vh, calc(100vh - 1rem));
        overflow: auto;
        overscroll-behavior: contain;
        padding: 0.14rem;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-elevated) 95%, transparent);
        box-shadow: var(--ux-shadow-sm);
        z-index: 26000;
    }

    .ux-menu-trigger-content {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }

    .ux-menu-trigger-icon {
        width: 0.95em;
        height: 0.95em;
    }
</style>
