<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SelectionModal from "../../components/SelectionModal.svelte";
    import { encodeGridSelectionFilterValue, parseGridSelectionFilterValue } from "./filterValue";
    import type { GridColumnDefinition, GridColumnFilterUi } from "./types";
    import type { SelectionId } from "../selection/types";

    const DEFAULT_TEXT_FILTER_UI: GridColumnFilterUi = {
        kind: "text",
    };

    export let column: GridColumnDefinition;
    export let value = "";

    const dispatch = createEventDispatcher<{
        change: { value: string };
    }>();

    function selectionTokenMatchesItemId(token: string, itemId: SelectionId): boolean {
        if (typeof itemId === "number") {
            const parsed = Number(token);
            return Number.isFinite(parsed) && parsed === itemId;
        }

        return token === itemId;
    }

    function handleTextInput(event: Event): void {
        dispatch("change", {
            value: (event.currentTarget as HTMLInputElement).value,
        });
    }

    function handleSelectionApply(event: CustomEvent<{ ids: SelectionId[] }>): void {
        dispatch("change", {
            value: encodeGridSelectionFilterValue(event.detail.ids),
        });
    }

    $: resolvedFilterUi = column.filterUi ?? DEFAULT_TEXT_FILTER_UI;
    $: selectionFilterUi =
        resolvedFilterUi.kind === "selection" ? resolvedFilterUi : null;
    $: selectedSelectionTokens = selectionFilterUi
        ? parseGridSelectionFilterValue(value) ?? []
        : [];
    $: selectedSelectionItems = selectionFilterUi
        ? selectionFilterUi.items.filter((item) =>
              selectedSelectionTokens.some((token) =>
                  selectionTokenMatchesItemId(token, item.id),
              ),
          )
        : [];
    $: selectedSelectionIds = selectedSelectionItems.map((item) => item.id);
    $: selectedSelectionLabels = selectedSelectionItems.map((item) => item.label);
    $: selectedCount = selectedSelectionIds.length;
    $: buttonLabel =
        selectedCount === 0
            ? `Filter ${column.title}`
            : selectedSelectionLabels.length > 0 && selectedSelectionLabels.length <= 3
              ? `${column.title}: ${selectedSelectionLabels.join(", ")}`
              : `${column.title}: ${selectedCount} selected`;
</script>

{#if selectionFilterUi}
    <div class="ux-grid-filter-selection-shell">
        <SelectionModal
            title={selectionFilterUi.title ?? `Filter ${column.title}`}
            description={selectionFilterUi.description ?? ""}
            items={selectionFilterUi.items}
            selectedIds={selectedSelectionIds}
            searchPlaceholder={
                selectionFilterUi.searchPlaceholder ??
                `Search ${column.title.toLowerCase()}`
            }
            applyLabel={selectionFilterUi.applyLabel ?? "Apply"}
            selectedCountLabel={selectionFilterUi.selectedCountLabel ?? "Selected"}
            size="md"
            buttonLabel=""
            buttonClass="ux-grid-filter-button"
            buttonTitle={buttonLabel}
            buttonAriaLabel={buttonLabel}
            buttonIcon="filter"
            buttonIconSize="0.68rem"
            iconOnly={true}
            active={selectedCount > 0}
            activeClass="ux-grid-filter-button-active"
            showActiveIndicator={true}
            on:apply={handleSelectionApply}
        />
    </div>
{:else}
    <input
        class="form-control form-control-sm"
        type="search"
        placeholder={resolvedFilterUi.kind === "text" ? resolvedFilterUi.placeholder ?? "Filter" : "Filter"}
        value={value}
        on:input={handleTextInput}
        aria-label={`Filter ${column.title}`}
    />
{/if}

<style>
    .ux-grid-filter-selection-shell {
        min-height: 1rem;
        width: 100%;
    }

    :global(.ux-grid-filter-button) {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1rem;
        height: 1rem;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--ux-border) 86%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--ux-surface) 94%, transparent);
        color: color-mix(in srgb, var(--ux-text) 76%, transparent);
        box-shadow: none;
    }

    :global(.ux-grid-filter-button:hover),
    :global(.ux-grid-filter-button:focus-visible),
    :global(.ux-grid-filter-button[aria-expanded="true"]) {
        border-color: color-mix(in srgb, var(--ux-brand) 55%, var(--ux-border));
        color: var(--ux-brand);
        outline: none;
    }

    :global(.ux-grid-filter-button[aria-expanded="true"]),
    :global(.ux-grid-filter-button.ux-grid-filter-button-active) {
        background: color-mix(in srgb, var(--ux-brand) 10%, var(--ux-surface));
    }
</style>
