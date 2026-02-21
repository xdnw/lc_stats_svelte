<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { tick } from "svelte";
  import type { SelectionId, SelectionModalItem } from "./selectionModalTypes";

  export let open = false;
  export let title = "Select Items";
  export let description = "";
  export let items: SelectionModalItem[] = [];
  export let selectedIds: SelectionId[] = [];
  export let searchPlaceholder = "Search...";
  export let applyLabel = "Apply";
  export let selectedCountLabel = "Selected";
  export let singleSelect = false;
  export let validateSelection: ((ids: SelectionId[]) => string | null) | null =
    null;

  const dispatch = createEventDispatcher<{
    close: void;
    apply: { ids: SelectionId[] };
  }>();

  let search = "";
  let draftKeys = new Set<string>();
  let idByKey = new Map<string, SelectionId>();
  let prevOpen = false;
  let searchInputEl: HTMLInputElement | null = null;

  function itemLabel(item: SelectionModalItem): string {
    const raw = (item as any)?.label;
    if (typeof raw === "string") return raw;
    if (raw == null) return `${item.id}`;
    return `${raw}`;
  }

  $: idByKey = new Map(items.map((item) => [toKey(item.id), item.id]));

  $: {
    if (open && !prevOpen) {
      draftKeys = new Set(selectedIds.map((id) => toKey(id)));
      search = "";
      tick().then(() => {
        searchInputEl?.focus();
      });
    }
    prevOpen = open;
  }

  $: normalizedSearch = search.trim().toLowerCase();
  $: filteredItems = items.filter((item) =>
    itemLabel(item).toLowerCase().includes(normalizedSearch),
  );
  $: selectedCount = draftKeys.size;
  $: draftIds = Array.from(draftKeys)
    .map((key) => idByKey.get(key))
    .filter((id): id is SelectionId => id !== undefined);
  $: validationError = validateSelection ? validateSelection(draftIds) : null;

  function toKey(id: SelectionId): string {
    return `${typeof id}:${id}`;
  }

  function toggleDraft(id: SelectionId) {
    const key = toKey(id);
    const next = singleSelect ? new Set<string>() : new Set(draftKeys);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      if (singleSelect) {
        for (const existing of Array.from(next)) {
          if (existing !== key) next.delete(existing);
        }
      }
    }
    draftKeys = next;
  }

  function selectAll() {
    draftKeys = new Set(items.map((item) => toKey(item.id)));
  }

  function clearAll() {
    draftKeys = new Set();
  }

  function close() {
    dispatch("close");
  }

  function apply() {
    if (validationError) return;
    dispatch("apply", { ids: draftIds });
  }
</script>

{#if open}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    on:click|self={close}
    on:keydown={(event) => {
      if (event.key === "Escape") close();
    }}
  >
    <div class="modal-dialog modal-lg modal-dialog-scrollable" role="document">
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
          {#if description}
            <div class="ux-callout mb-2">{description}</div>
          {/if}
          <input
            type="text"
            class="form-control mb-2"
            placeholder={searchPlaceholder}
            bind:value={search}
            bind:this={searchInputEl}
          />
          {#if !singleSelect}
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <button class="btn ux-btn btn-sm" type="button" on:click={selectAll}>
                Select All
              </button>
              <button class="btn ux-btn btn-sm" type="button" on:click={clearAll}>
                Clear
              </button>
              <span class="small ux-muted">{selectedCountLabel}: {selectedCount}</span>
            </div>
          {:else}
            <div class="small ux-muted mb-2">{selectedCountLabel}: {selectedCount}</div>
          {/if}

          {#if validationError}
            <div class="alert alert-warning py-2 small mb-2">{validationError}</div>
          {/if}

          <div class="ux-surface p-2 selection-modal-list">
            {#if filteredItems.length === 0}
              <div class="ux-muted small">No items match your search.</div>
            {:else}
              {#each filteredItems as item}
                <label class="form-check d-flex align-items-center gap-2 mb-1">
                  <input
                    class="form-check-input mt-0"
                    type={singleSelect ? "radio" : "checkbox"}
                    name={singleSelect ? "selection-modal-single" : undefined}
                    checked={draftKeys.has(toKey(item.id))}
                    on:change={() => toggleDraft(item.id)}
                  />
                  <span>{itemLabel(item)}</span>
                  {#if item.group}
                    <span class="badge text-bg-light">{item.group}</span>
                  {/if}
                </label>
              {/each}
            {/if}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary" on:click={close}>Cancel</button>
          <button class="btn ux-btn" on:click={apply} disabled={!!validationError}>
            {applyLabel} ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

<style>
  .selection-modal-list {
    max-height: 50vh;
    overflow: auto;
  }
</style>
