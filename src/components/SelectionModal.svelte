<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { AppIconName } from "$lib/icons";
    import DeferredModalTrigger from "./DeferredModalTrigger.svelte";
    import type { SelectionId, SelectionModalItem } from "$lib/selection/types";

    type SelectionPickerPanelComponent = typeof import("./SelectionPickerPanel.svelte").default;

    export let title = "Select Items";
    export let description = "";
    export let items: SelectionModalItem[] = [];
    export let selectedIds: SelectionId[] = [];
    export let searchPlaceholder = "Search...";
    export let applyLabel = "Apply";
    export let selectedCountLabel = "Selected";
    export let singleSelect = false;
    export let maxSelectedCount: number | null = null;
    export let size: "sm" | "md" | "lg" | "xl" = "md";
    export let validateSelection:
        | ((ids: SelectionId[]) => string | null)
        | null = null;
    export let buttonLabel = "Open";
    export let buttonClass = "btn ux-btn btn-sm";
    export let buttonTitle = "";
    export let buttonAriaLabel = "";
    export let buttonIcon: AppIconName | null = null;
    export let buttonIconSize = "0.8rem";
    export let buttonIconClass = "";
    export let iconOnly = false;
    export let active = false;
    export let activeClass = "";
    export let showActiveIndicator = false;
    export let disabled = false;

    const dispatch = createEventDispatcher<{
        open: void;
        close: void;
        apply: { ids: SelectionId[] };
    }>();

    let open = false;
    let selectionPickerPanelComponent: SelectionPickerPanelComponent | null = null;
    let selectionPickerPanelLoadPromise: Promise<void> | null = null;

    async function ensureSelectionPickerLoaded(): Promise<void> {
        if (selectionPickerPanelComponent) return;
        if (!selectionPickerPanelLoadPromise) {
            selectionPickerPanelLoadPromise = import("./SelectionPickerPanel.svelte")
                .then((module) => {
                    selectionPickerPanelComponent = module.default;
                })
                .catch((error) => {
                    open = false;
                    console.error("Failed to load selection picker panel", error);
                })
                .finally(() => {
                    selectionPickerPanelLoadPromise = null;
                });
        }

        await selectionPickerPanelLoadPromise;
    }

    function close(): void {
        open = false;
    }

    function handleApply(event: CustomEvent<{ ids: SelectionId[] }>): void {
        open = false;
        dispatch("apply", event.detail);
    }

    $: if (open && !selectionPickerPanelComponent) {
        void ensureSelectionPickerLoaded();
    }
</script>

<DeferredModalTrigger
    bind:open
    {title}
    {size}
    scrollable={false}
    {buttonLabel}
    {buttonClass}
    {buttonTitle}
    {buttonAriaLabel}
    {buttonIcon}
    {buttonIconSize}
    {buttonIconClass}
    {iconOnly}
    {active}
    {activeClass}
    {showActiveIndicator}
    {disabled}
    on:open={() => dispatch("open")}
    on:close={() => dispatch("close")}
>
    {#if selectionPickerPanelComponent}
        <svelte:component
            this={selectionPickerPanelComponent}
            {description}
            {items}
            {selectedIds}
            {searchPlaceholder}
            {applyLabel}
            {selectedCountLabel}
            {singleSelect}
            {maxSelectedCount}
            {validateSelection}
            on:cancel={close}
            on:apply={handleApply}
        />
    {:else}
        <div class="selection-modal-loading small ux-muted">Loading options...</div>
    {/if}
</DeferredModalTrigger>

<style>
    .selection-modal-loading {
        min-height: 5rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
