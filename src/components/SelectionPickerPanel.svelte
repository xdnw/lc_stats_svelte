<script lang="ts">
    import { onMount, tick } from "svelte";
    import { createEventDispatcher } from "svelte";
    import type {
        SelectionModalGroupTone,
        SelectionId,
        SelectionModalItem,
    } from "$lib/selection/types";

    export let items: SelectionModalItem[] = [];
    export let selectedIds: SelectionId[] = [];
    export let searchPlaceholder = "Search...";
    export let applyLabel = "Apply";
    export let selectedCountLabel = "Selected";
    export let singleSelect = false;
    export let maxSelectedCount: number | null = null;
    export let description = "";
    export let validateSelection:
        | ((ids: SelectionId[]) => string | null)
        | null = null;

    const dispatch = createEventDispatcher<{
        cancel: void;
        apply: { ids: SelectionId[] };
    }>();

    let search = "";
    let draftKeys = new Set<string>();
    let searchInputEl: HTMLInputElement | null = null;

    function toKey(id: SelectionId): string {
        return `${typeof id}:${id}`;
    }

    function itemLabel(item: SelectionModalItem): string {
        const raw = item?.label;
        if (typeof raw === "string") return raw;
        if (raw == null) return `${item.id}`;
        return `${raw}`;
    }

    function itemMatchesSearch(item: SelectionModalItem, normalizedSearch: string): boolean {
        if (!normalizedSearch) return true;

        return (
            itemLabel(item).toLowerCase().includes(normalizedSearch) ||
            (item.group ?? "").toLowerCase().includes(normalizedSearch)
        );
    }

    function groupBadgeClass(tone: SelectionModalGroupTone | undefined): string {
        switch (tone) {
            case "coalition1":
                return "selection-picker-group-badge selection-picker-group-badge--coalition1";
            case "coalition2":
                return "selection-picker-group-badge selection-picker-group-badge--coalition2";
            default:
                return "selection-picker-group-badge selection-picker-group-badge--default";
        }
    }

    function toggleDraft(id: SelectionId): void {
        const key = toKey(id);
        const next = singleSelect ? new Set<string>() : new Set(draftKeys);
        if (next.has(key)) {
            next.delete(key);
        } else if (
            !singleSelect &&
            normalizedMaxSelectedCount != null &&
            draftKeys.size >= normalizedMaxSelectedCount
        ) {
            return;
        } else {
            next.add(key);
            if (singleSelect) {
                for (const existing of Array.from(next)) {
                    if (existing !== key) next.delete(existing);
                }
            }
        }
        draftKeys = next;
    }

    function selectAll(): void {
        draftKeys = new Set(normalizedItems.map((item) => toKey(item.id)));
    }

    function clearAll(): void {
        draftKeys = new Set();
    }

    function cancel(): void {
        dispatch("cancel");
    }

    function apply(): void {
        if (validationError) return;
        dispatch("apply", { ids: draftIds });
    }

    onMount(() => {
        draftKeys = new Set(normalizedSelectedIds.map((id) => toKey(id)));
        void tick().then(() => {
            searchInputEl?.focus();
        });
    });

    $: normalizedItems = Array.isArray(items) ? items : [];
    $: normalizedSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];
    $: draftKeys = new Set(normalizedSelectedIds.map((id) => toKey(id)));
    $: normalizedMaxSelectedCount =
        typeof maxSelectedCount === "number" &&
        Number.isFinite(maxSelectedCount) &&
        maxSelectedCount > 0
            ? Math.floor(maxSelectedCount)
            : null;
    $: idByKey = new Map(normalizedItems.map((item) => [toKey(item.id), item.id]));
    $: normalizedSearch = search.trim().toLowerCase();
    $: filteredItems = normalizedItems.filter((item) => itemMatchesSearch(item, normalizedSearch));
    $: selectedCount = draftKeys.size;
    $: draftIds = Array.from(draftKeys)
        .map((key) => idByKey.get(key))
        .filter((id): id is SelectionId => id !== undefined);
    $: validationError = validateSelection ? validateSelection(draftIds) : null;
</script>

<div class="selection-picker-panel">
    {#if description}
        <div class="ux-callout selection-picker-description">{description}</div>
    {/if}

    <input
        type="text"
        class="form-control selection-picker-search"
        placeholder={searchPlaceholder}
        bind:value={search}
        bind:this={searchInputEl}
    />

    {#if !singleSelect}
        <div class="selection-picker-toolbar d-flex flex-wrap gap-2 align-items-center">
            {#if normalizedMaxSelectedCount == null}
                <button class="btn ux-btn btn-sm selection-picker-action" type="button" on:click={selectAll}>
                    Select All
                </button>
            {/if}
            <button class="btn ux-btn btn-sm selection-picker-action" type="button" on:click={clearAll}>
                Clear
            </button>
            <span class="small ux-muted">
                {selectedCountLabel}: {selectedCount}
                {#if normalizedMaxSelectedCount != null}
                    / {normalizedMaxSelectedCount}
                {/if}
            </span>
        </div>
    {:else}
        <div class="small ux-muted">{selectedCountLabel}: {selectedCount}</div>
    {/if}

    {#if validationError}
        <div class="alert alert-warning py-2 small mb-0">{validationError}</div>
    {/if}

    <div class="ux-surface selection-picker-list">
        {#if filteredItems.length === 0}
            <div class="ux-muted small selection-picker-empty">No items match your search.</div>
        {:else}
            {#each filteredItems as item}
                <label
                    class="form-check selection-picker-row d-flex align-items-center gap-2 mb-0"
                >
                    <input
                        class="form-check-input mt-0"
                        type={singleSelect ? "radio" : "checkbox"}
                        name={singleSelect ? "selection-picker-single" : undefined}
                        checked={draftKeys.has(toKey(item.id))}
                        on:change={() => toggleDraft(item.id)}
                    />
                    <span class="selection-picker-item-label">{itemLabel(item)}</span>
                    {#if item.group}
                        <span class={groupBadgeClass(item.groupTone)}>{item.group}</span>
                    {/if}
                </label>
            {/each}
        {/if}
    </div>

    <div class="selection-picker-footer">
        <button class="btn btn-outline-secondary btn-sm selection-picker-action" type="button" on:click={cancel}>
            Cancel
        </button>
        <button class="btn ux-btn btn-sm selection-picker-action" type="button" on:click={apply} disabled={!!validationError}>
            {applyLabel} ({selectedCount})
        </button>
    </div>
</div>

<style>
    .selection-picker-panel {
        display: grid;
        gap: 0.42rem;
        min-width: 0;
        min-height: 0;
        color: var(--ux-text);
        font-weight: 400;
        text-align: left;
    }

    .ux-callout.selection-picker-description {
        margin: 0;
        border-radius: var(--ux-radius-sm);
        padding: 0.42rem 0.56rem;
        background: color-mix(in srgb, var(--ux-brand) 7%, var(--ux-surface));
        color: color-mix(in srgb, var(--ux-text) 86%, var(--ux-brand));
        border: 1px solid color-mix(in srgb, var(--ux-brand) 18%, var(--ux-border));
        font-size: 0.78rem;
        font-weight: 400;
        line-height: 1.32;
    }

    .selection-picker-search {
        min-height: 1.9rem;
        padding: 0.34rem 0.56rem;
        font-size: 0.84rem;
        font-weight: 400;
        line-height: 1.2;
    }

    .selection-picker-toolbar {
        min-height: 1.55rem;
    }

    .selection-picker-list {
        max-height: min(52vh, 21rem);
        overflow: auto;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-sm);
        padding: 0.1rem 0;
        text-align: left;
    }

    .selection-picker-row {
        width: 100%;
        justify-content: flex-start;
        padding: 0.28rem 0.54rem;
        border-bottom: 1px solid color-mix(in srgb, var(--ux-border) 88%, transparent);
        font-weight: 400;
        text-align: left;
    }

    .selection-picker-row:hover {
        background: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
    }

    .selection-picker-row:last-child {
        border-bottom: 0;
    }

    .selection-picker-item-label {
        min-width: 0;
        flex: 1 1 auto;
        font-size: 0.79rem;
        font-weight: 400;
        line-height: 1.15;
        text-align: left;
    }

    .selection-picker-group-badge {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 0.08rem 0.42rem;
        border: 1px solid transparent;
        font-size: 0.67rem;
        line-height: 1.2;
    }

    .selection-picker-group-badge--default {
        background: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
        border-color: color-mix(in srgb, var(--ux-border) 82%, transparent);
        color: var(--ux-text-muted);
    }

    .selection-picker-group-badge--coalition1 {
        background: color-mix(in srgb, var(--ux-brand) 12%, var(--ux-surface));
        border-color: color-mix(in srgb, var(--ux-brand) 32%, var(--ux-border));
        color: color-mix(in srgb, var(--ux-brand) 74%, var(--ux-text));
    }

    .selection-picker-group-badge--coalition2 {
        background: color-mix(in srgb, var(--ux-danger) 12%, var(--ux-surface));
        border-color: color-mix(in srgb, var(--ux-danger) 30%, var(--ux-border));
        color: color-mix(in srgb, var(--ux-danger) 76%, var(--ux-text));
    }

    .selection-picker-empty {
        padding: 0.52rem 0.56rem;
        font-weight: 400;
    }

    .selection-picker-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.38rem;
    }

    .selection-picker-action {
        min-height: 1.42rem;
        padding: 0.03rem 0.34rem !important;
        font-size: 0.74rem !important;
        font-weight: 500 !important;
    }
</style>
