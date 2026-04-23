<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { formatAllianceName } from "$lib/formatting";
    import {
        buildCoalitionAllianceItems,
        getSelectedAllianceIdsForCoalition,
        mergeCoalitionAllianceSelection,
        toNumberSelection,
        validateAtLeastOnePerCoalition,
        validateAtLeastOneSelection,
    } from "$lib/selectionModalHelpers";
    import type { AppIconName } from "$lib/icons";
    import type { SelectionId, SelectionModalItem } from "$lib/selection/types";
    import SelectionModal from "./SelectionModal.svelte";

    type AllianceFilterCoalition = {
        name?: string;
        alliance_ids: number[];
        alliance_names?: Array<string | null | undefined>;
    };

    type AllianceFilterMode =
        | "direct"
        | "coalition-scoped"
        | "coalition-merged"
        | "all-coalitions";

    type AllianceFilterValidationMode =
        | "none"
        | "at-least-one"
        | "at-least-one-per-coalition";

    export let title = "Filter Alliances";
    export let description = "";
    export let items: SelectionModalItem[] = [];
    export let coalitions: AllianceFilterCoalition[] = [];
    export let selectedIds: number[] = [];
    export let mode: AllianceFilterMode = "direct";
    export let coalitionIndex: 0 | 1 = 0;
    export let validationMode: AllianceFilterValidationMode | null = null;
    export let searchPlaceholder = "Search alliances...";
    export let applyLabel = "Apply filter";
    export let selectedCountLabel = "Alliances selected";
    export let buttonLabel = "Filter alliances";
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
    export let size: "sm" | "md" | "lg" | "xl" = "sm";
    export let disabled = false;

    const dispatch = createEventDispatcher<{
        commit: { ids: number[] };
    }>();

    function normalizeAllianceSelection(ids: Iterable<number>): number[] {
        return Array.from(
            new Set(
                Array.from(ids)
                    .map((id) => Math.trunc(Number(id)))
                    .filter((id) => Number.isFinite(id) && id > 0),
            ),
        ).sort((left, right) => left - right);
    }

    function effectiveValidationMode(): AllianceFilterValidationMode {
        if (validationMode) return validationMode;
        return mode === "all-coalitions"
            ? "at-least-one-per-coalition"
            : "at-least-one";
    }

    function validateSelection(ids: SelectionId[]): string | null {
        switch (effectiveValidationMode()) {
            case "none":
                return null;
            case "at-least-one-per-coalition":
                return validateAtLeastOnePerCoalition(ids, coalitions);
            case "at-least-one":
            default:
                return validateAtLeastOneSelection(ids);
        }
    }

    function handleApply(event: CustomEvent<{ ids: SelectionId[] }>): void {
        const nextIds = normalizeAllianceSelection(toNumberSelection(event.detail.ids));
        if (mode === "coalition-merged") {
            dispatch("commit", {
                ids: normalizeAllianceSelection(
                    mergeCoalitionAllianceSelection(
                        coalitions,
                        coalitionIndex,
                        new Set(normalizedSelectedIds),
                        nextIds,
                    ),
                ),
            });
            return;
        }

        dispatch("commit", { ids: nextIds });
    }

    $: normalizedSelectedIds = normalizeAllianceSelection(selectedIds);
    $: selectionSet = new Set(normalizedSelectedIds);
    $: modalItems =
        mode === "direct"
            ? items
            : mode === "all-coalitions"
              ? buildCoalitionAllianceItems(coalitions, formatAllianceName)
              : buildCoalitionAllianceItems(
                    coalitions[coalitionIndex] ? [coalitions[coalitionIndex]] : [],
                    formatAllianceName,
                    {
                        startCoalitionIndex: coalitionIndex,
                    },
                );
    $: modalSelectedIds =
        mode === "coalition-scoped" || mode === "coalition-merged"
            ? getSelectedAllianceIdsForCoalition(
                    coalitions,
                    coalitionIndex,
                    selectionSet,
                )
            : normalizedSelectedIds;
</script>

<SelectionModal
    {title}
    {description}
    items={modalItems}
    selectedIds={modalSelectedIds}
    {searchPlaceholder}
    {applyLabel}
    {selectedCountLabel}
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
    {size}
    {disabled}
    validateSelection={validateSelection}
    on:apply={handleApply}
/>
