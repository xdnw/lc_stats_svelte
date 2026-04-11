<script lang="ts">
    import { createEventDispatcher } from "svelte";

    export let open = false;
    export let title = "Modal";
    export let size: "sm" | "md" | "lg" | "xl" = "lg";
    export let scrollable = true;
    export let closeOnBackdrop = true;

    const dispatch = createEventDispatcher<{
        close: void;
    }>();

    function close(): void {
        dispatch("close");
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
            ? "28rem"
            : size === "md"
              ? "40rem"
              : size === "xl"
                ? "72rem"
                : "58rem";
</script>

{#if open}
    <div
        class="modal show d-block ux-modal-shell"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={`--ux-modal-max-width:${dialogMaxWidth};`}
        on:click|self={() => {
            if (closeOnBackdrop) close();
        }}
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
                        type="button"
                        class="btn-close"
                        aria-label="Close"
                        on:click={close}
                    ></button>
                </div>
                <div class="modal-body">
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
    <div class="modal-backdrop show ux-modal-backdrop"></div>
{/if}

<style>
    :global(.ux-modal-shell) {
        position: fixed;
        inset: 0;
        z-index: 26000;
        padding: 1rem;
        overflow: auto;
        background: rgba(15, 23, 42, 0.08);
        animation: none !important;
        transition: none !important;
    }

    :global(.ux-modal-shell .modal-dialog) {
        width: min(var(--ux-modal-max-width), calc(100vw - 2rem));
        max-width: 100%;
        margin: 0 auto;
        min-height: calc(100vh - 2rem);
        display: flex;
        align-items: flex-start;
        animation: none !important;
        transition: none !important;
        transform: none !important;
    }

    :global(.ux-modal-backdrop) {
        animation: none !important;
        transition: none !important;
    }

    :global(.ux-modal-shell .modal-content) {
        width: 100%;
        max-height: calc(100vh - 2rem);
        border-radius: 0.75rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    :global(.ux-modal-shell .modal-header),
    :global(.ux-modal-shell .modal-footer) {
        padding: 0.4rem 0.72rem;
    }

    :global(.ux-modal-shell .modal-header) {
        border-bottom-color: rgba(15, 23, 42, 0.08);
    }

    :global(.ux-modal-shell .modal-footer) {
        border-top-color: rgba(15, 23, 42, 0.08);
    }

    :global(.ux-modal-shell .modal-body) {
        padding: 0.75rem 0.85rem;
        overflow: auto;
        min-height: 0;
        flex: 1 1 auto;
    }

    :global(.ux-modal-shell .modal-title) {
        margin: 0;
        font-size: 0.98rem;
        line-height: 1.2;
    }

    :global(.ux-modal-shell .modal-footer) {
        gap: 0.45rem;
    }

    :global(.ux-modal-shell .btn-close) {
        padding: 0.35rem;
        margin: -0.08rem -0.08rem -0.08rem auto;
    }

    @media (max-width: 640px) {
        :global(.ux-modal-shell) {
            padding: 0.5rem;
        }

        :global(.ux-modal-shell .modal-dialog) {
            width: calc(100vw - 1rem);
        }

        :global(.ux-modal-shell .modal-content) {
            max-height: calc(100vh - 1rem);
        }
    }
</style>