<script context="module" lang="ts">
    let activeModalCount = 0;
    let savedBodyOverflow = "";

    function lockBodyScroll(): void {
        if (typeof document === "undefined") return;
        if (activeModalCount === 0) {
            savedBodyOverflow = document.body.style.overflow;
            document.body.classList.add("modal-open");
            document.body.style.overflow = "hidden";
        }
        activeModalCount += 1;
    }

    function unlockBodyScroll(): void {
        if (typeof document === "undefined" || activeModalCount === 0) return;
        activeModalCount -= 1;
        if (activeModalCount > 0) return;

        document.body.classList.remove("modal-open");
        document.body.style.overflow = savedBodyOverflow;
        savedBodyOverflow = "";
    }
</script>

<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";

    export let open = false;
    export let title = "Modal";
    export let size: "sm" | "md" | "lg" | "xl" = "lg";
    export let scrollable = true;
    export let closeOnBackdrop = true;
    export let bodyClass = "";

    const dispatch = createEventDispatcher<{
        close: void;
    }>();

    let closeButton: HTMLButtonElement | null = null;
    let backdropPointerDown = false;
    let bodyScrollLocked = false;

    function queueCloseButtonFocus(): void {
        void tick().then(() => {
            closeButton?.focus();
        });
    }

    function syncBodyScrollLock(nextOpen: boolean): void {
        if (nextOpen) {
            if (!bodyScrollLocked) {
                lockBodyScroll();
                bodyScrollLocked = true;
            }
            queueCloseButtonFocus();
            return;
        }

        if (!bodyScrollLocked) {
            return;
        }

        unlockBodyScroll();
        bodyScrollLocked = false;
    }

    function close(): void {
        dispatch("close");
    }

    function handleBackdropPointerDown(event: PointerEvent): void {
        backdropPointerDown = event.target === event.currentTarget;
    }

    function handleBackdropPointerUp(event: PointerEvent): void {
        const releasedOnBackdrop = event.target === event.currentTarget;
        if (closeOnBackdrop && backdropPointerDown && releasedOnBackdrop) {
            close();
        }
        backdropPointerDown = false;
    }

    function portal(node: HTMLElement): { destroy(): void } | void {
        if (typeof document === "undefined") return;
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode === document.body) {
                    document.body.removeChild(node);
                }
            },
        };
    }

    $: dialogSizeClass =
        size === "sm"
            ? "modal-sm"
            : size === "md"
              ? ""
              : size === "xl"
                ? "modal-xl"
                : "modal-lg";
    $: dialogMaxWidth =
        size === "sm"
            ? "23rem"
            : size === "md"
              ? "40rem"
              : size === "xl"
                ? "72rem"
                : "58rem";

    $: shellVars = [
        `--ux-modal-max-width:${dialogMaxWidth}`,
        size === "sm"
            ? "--ux-modal-header-padding:0.2rem 0.3rem; --ux-modal-body-padding:0.3rem 0.34rem; --ux-modal-footer-padding:0.2rem 0.3rem; --ux-modal-title-size:0.82rem;"
            : "--ux-modal-header-padding:0.42rem 0.56rem; --ux-modal-body-padding:0.68rem 0.72rem; --ux-modal-footer-padding:0.42rem 0.56rem; --ux-modal-title-size:0.94rem;",
    ].join("; ");

    onMount(() => {
        syncBodyScrollLock(open);
    });

    onDestroy(() => {
        if (bodyScrollLocked) {
            unlockBodyScroll();
            bodyScrollLocked = false;
        }
    });

    $: if (!open) {
        backdropPointerDown = false;
    }
    $: syncBodyScrollLock(open);
</script>

{#if open}
    <div
        use:portal
        class={`modal show ux-modal-shell ${scrollable ? "" : "ux-modal-shell-static"}`.trim()}
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-ux-modal-size={size}
        style={shellVars}
        on:pointerdown={handleBackdropPointerDown}
        on:pointerup={handleBackdropPointerUp}
        on:keydown={(event) => {
            if (event.key === "Escape") close();
        }}
    >
        <div
            class={`modal-dialog ${dialogSizeClass} ${scrollable ? "modal-dialog-scrollable" : ""}`.trim()}
            role="document"
        >
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{title}</h5>
                    <button
                        bind:this={closeButton}
                        type="button"
                        class="btn-close"
                        aria-label="Close"
                        on:click={close}
                    ></button>
                </div>
                <div class={`modal-body ${bodyClass}`.trim()}>
                    <slot />
                </div>
                {#if $$slots.footer}
                    <div class="modal-footer">
                        <slot name="footer" />
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.ux-modal-shell) {
        --ux-modal-surface: color-mix(in srgb, var(--ux-surface-elevated) 98%, transparent);
        --ux-modal-header-surface: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
        --ux-modal-divider: color-mix(in srgb, var(--ux-border) 92%, transparent);
        --ux-modal-title-color: var(--ux-text);
        --ux-modal-muted: var(--ux-text-muted);
        --ux-modal-pane-surface: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
        --ux-modal-pane-border: color-mix(in srgb, var(--ux-border) 92%, transparent);
        --ux-modal-pane-radius: var(--ux-radius-sm);
        --ux-modal-shadow: var(--ux-shadow-md);
        position: fixed;
        inset: 0;
        z-index: 26000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0.75rem;
        overflow: auto;
        background: color-mix(in srgb, #0f172a 22%, transparent);
        animation: none !important;
        transition: none !important;
    }

    :global(.ux-modal-shell .modal-dialog) {
        width: min(var(--ux-modal-max-width), calc(100vw - 2rem));
        max-width: 100%;
        margin: 0;
        max-height: calc(100vh - 1.5rem);
        display: flex;
        align-items: stretch;
        animation: none !important;
        transition: none !important;
        transform: none !important;
    }

    :global(.ux-modal-shell .modal-content) {
        width: 100%;
        max-height: calc(100vh - 1.5rem);
        border: 1px solid var(--ux-modal-divider);
        border-radius: var(--ux-radius-lg);
        background: var(--ux-modal-surface);
        color: var(--ux-text);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--ux-modal-shadow);
    }

    :global(.ux-modal-shell .modal-header),
    :global(.ux-modal-shell .modal-footer) {
        padding: var(--ux-modal-header-padding);
    }

    :global(.ux-modal-shell .modal-header) {
        align-items: center;
        gap: 0.5rem;
        background: var(--ux-modal-header-surface);
        border-bottom: 1px solid var(--ux-modal-divider);
    }

    :global(.ux-modal-shell .modal-footer) {
        padding: var(--ux-modal-footer-padding);
        background: transparent;
        border-top: 1px solid var(--ux-modal-divider);
        gap: 0.45rem;
        justify-content: flex-end;
    }

    :global(.ux-modal-shell .modal-body) {
        padding: var(--ux-modal-body-padding);
        overflow: auto;
        overscroll-behavior: contain;
        min-height: 0;
        flex: 1 1 auto;
        color: var(--ux-text);
    }

    :global(.ux-modal-shell-static .modal-body) {
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    :global(.ux-modal-shell .modal-title) {
        margin: 0;
        color: var(--ux-modal-title-color);
        font-size: var(--ux-modal-title-size);
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: 0.01em;
    }

    :global(.ux-modal-shell .btn-close) {
        margin: 0 0 0 auto;
        width: 1.08rem;
        height: 1.08rem;
        border-radius: 999px;
        background-color: color-mix(in srgb, var(--ux-surface) 88%, transparent);
        opacity: 0.82;
    }

    :global(.ux-modal-shell .btn-close:hover),
    :global(.ux-modal-shell .btn-close:focus-visible) {
        opacity: 1;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ux-brand) 20%, transparent);
    }

    :global(.ux-modal-shell .form-label) {
        margin-bottom: 0.22rem !important;
        color: var(--ux-modal-muted);
        font-size: var(--ux-text-xs) !important;
        font-weight: 600;
        letter-spacing: 0.01em;
    }

    :global(.ux-modal-shell .form-control),
    :global(.ux-modal-shell .form-select) {
        border-color: color-mix(in srgb, var(--ux-border) 94%, var(--ux-text-muted));
        background-color: color-mix(in srgb, var(--ux-surface) 98%, transparent);
        color: var(--ux-text);
        box-shadow: none;
    }

    :global(.ux-modal-shell .form-control:focus),
    :global(.ux-modal-shell .form-select:focus) {
        border-color: color-mix(in srgb, var(--ux-brand) 56%, var(--ux-border));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ux-brand) 14%, transparent);
    }

    :global(.ux-modal-shell .form-control-sm),
    :global(.ux-modal-shell .form-select-sm),
    :global(.ux-modal-shell .btn.btn-sm) {
        min-height: 1.72rem;
        font-size: var(--ux-text-sm) !important;
    }

    :global(.ux-modal-shell .small) {
        font-size: var(--ux-text-sm);
    }

    :global(.ux-modal-shell .text-muted) {
        color: var(--ux-modal-muted) !important;
    }

    :global(.ux-modal-intro) {
        margin: 0 0 0.82rem;
        color: var(--ux-modal-muted);
        font-size: var(--ux-text-sm);
        line-height: 1.4;
    }

    :global(.ux-modal-section-title) {
        margin: 0 0 0.28rem;
        color: var(--ux-text);
        font-size: var(--ux-text-md);
        font-weight: 600;
        line-height: 1.25;
    }

    :global(.ux-modal-section-copy) {
        margin: 0 0 0.48rem;
        color: var(--ux-modal-muted);
        font-size: var(--ux-text-sm);
        line-height: 1.36;
    }

    :global(.ux-modal-pane) {
        border: 1px solid var(--ux-modal-pane-border);
        border-radius: var(--ux-modal-pane-radius);
        background: var(--ux-modal-pane-surface);
        padding: 0.56rem 0.62rem;
    }

    :global(.ux-modal-pane + .ux-modal-pane) {
        margin-top: 0.48rem;
    }

    :global(.ux-modal-preview) {
        border: 1px solid color-mix(in srgb, var(--ux-brand) 18%, var(--ux-modal-pane-border));
        border-radius: var(--ux-modal-pane-radius);
        background: color-mix(in srgb, var(--ux-brand) 6%, var(--ux-surface));
        padding: 0.5rem 0.58rem;
    }

    :global(.ux-modal-pane-title) {
        margin: 0;
        color: var(--ux-text);
        font-size: var(--ux-text-sm);
        font-weight: 600;
        line-height: 1.25;
    }

    :global(.ux-modal-pane-copy) {
        margin: 0.14rem 0 0;
        color: var(--ux-modal-muted);
        font-size: var(--ux-text-sm);
        line-height: 1.34;
    }

    @media (max-width: 640px) {
        :global(.ux-modal-shell) {
            padding: 0.5rem;
        }

        :global(.ux-modal-shell .modal-dialog) {
            width: calc(100vw - 1rem);
            max-height: calc(100vh - 1rem);
        }

        :global(.ux-modal-shell .modal-content) {
            max-height: calc(100vh - 1rem);
        }

        :global(.ux-modal-pane) {
            padding: 0.48rem 0.52rem;
        }
    }
</style>