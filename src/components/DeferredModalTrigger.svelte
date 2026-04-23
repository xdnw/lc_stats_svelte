<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { AppIconName } from "$lib/icons";
    import Icon from "./Icon.svelte";

    type ModalShellComponent = typeof import("./ModalShell.svelte").default;

    export let active = false;
    export let activeClass = "";
    export let buttonAriaLabel = "";
    export let buttonClass = "btn ux-btn btn-sm";
    export let buttonIcon: AppIconName | null = null;
    export let buttonIconClass = "";
    export let buttonIconSize = "0.8rem";
    export let buttonLabel = "Open";
    export let buttonTitle = "";
    export let closeOnBackdrop = true;
    export let disabled = false;
    export let iconOnly = false;
    export let open = false;
    export let scrollable = true;
    export let showActiveIndicator = false;
    export let size: "sm" | "md" | "lg" | "xl" = "md";
    export let title = "Modal";

    const dispatch = createEventDispatcher<{
        open: void;
        close: void;
    }>();

    let modalShellComponent: ModalShellComponent | null = null;
    let modalShellLoadPromise: Promise<void> | null = null;
    let lastOpen = open;

    async function ensureModalShellLoaded(): Promise<void> {
        if (modalShellComponent) return;
        if (!modalShellLoadPromise) {
            modalShellLoadPromise = import("./ModalShell.svelte")
                .then((module) => {
                    modalShellComponent = module.default;
                })
                .catch((error) => {
                    open = false;
                    console.error("Failed to load deferred modal shell", error);
                })
                .finally(() => {
                    modalShellLoadPromise = null;
                });
        }

        await modalShellLoadPromise;
    }

    function requestOpen(): void {
        if (disabled || open) return;
        open = true;
    }

    function requestClose(): void {
        if (!open) return;
        open = false;
    }

    $: resolvedTriggerTitle = buttonTitle || buttonLabel || title;
    $: resolvedTriggerAriaLabel =
        buttonAriaLabel || resolvedTriggerTitle || title;
    $: resolvedTriggerClass = [
        buttonClass,
        active && activeClass ? activeClass : "",
    ]
        .filter(Boolean)
        .join(" ");

    $: if (disabled && open) {
        open = false;
    }

    $: if (open && !modalShellComponent) {
        void ensureModalShellLoaded();
    }

    $: if (open !== lastOpen) {
        lastOpen = open;
        dispatch(open ? "open" : "close");
    }
</script>

<button
    class={resolvedTriggerClass}
    class:ux-deferred-modal-trigger={true}
    type="button"
    on:click={requestOpen}
    title={resolvedTriggerTitle}
    aria-label={resolvedTriggerAriaLabel}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-pressed={active}
    disabled={disabled}
>
    {#if buttonIcon}
        <Icon name={buttonIcon} size={buttonIconSize} className={buttonIconClass} />
    {/if}
    {#if !iconOnly}
        <span>{buttonLabel}</span>
    {/if}
    {#if showActiveIndicator && active}
        <span class="ux-deferred-modal-trigger-indicator" aria-hidden="true"></span>
    {/if}
</button>

{#if open && modalShellComponent}
    {#if $$slots.footer}
        <svelte:component
            this={modalShellComponent}
            {open}
            {title}
            {size}
            {scrollable}
            {closeOnBackdrop}
            on:close={requestClose}
        >
            <slot close={requestClose} />
            <slot name="footer" slot="footer" close={requestClose} />
        </svelte:component>
    {:else}
        <svelte:component
            this={modalShellComponent}
            {open}
            {title}
            {size}
            {scrollable}
            {closeOnBackdrop}
            on:close={requestClose}
        >
            <slot close={requestClose} />
        </svelte:component>
    {/if}
{/if}

<style>
    .ux-deferred-modal-trigger {
        position: relative;
    }

    .ux-deferred-modal-trigger-indicator {
        position: absolute;
        inset-block-start: 0.08rem;
        inset-inline-end: 0.08rem;
        width: 0.24rem;
        height: 0.24rem;
        border-radius: 999px;
        background: currentColor;
        pointer-events: none;
    }
</style>