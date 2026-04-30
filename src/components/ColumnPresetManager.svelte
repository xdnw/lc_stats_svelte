<script lang="ts">
    import { browser } from "$app/environment";
    import { createEventDispatcher, onMount } from "svelte";
    import DeferredModalTrigger from "./DeferredModalTrigger.svelte";
    import {
        readColumnPresets,
        saveColumnPreset,
        deleteColumnPreset,
        type ColumnPreset,
    } from "$lib";
    import type { ConflictCustomColumnConfig } from "$lib/conflictCustomColumns";
    import type { SharedKpiConfig } from "$lib/kpi";

    export let currentColumns: string[] = [];
    export let currentCustomColumns: ConflictCustomColumnConfig[] = [];
    export let currentSort: string = "";
    export let currentOrder: string = "desc";
    export let currentKpis: string[] = [];
    export let currentKpiConfig:
        | SharedKpiConfig
        | Record<string, unknown>
        | null = null;
    export let storageKey: string | null = null;

    const dispatch = createEventDispatcher();

    let presets: Record<string, ColumnPreset> = {};
    let name = "";
    let open = false;
    let lastLoadedStorageKey: string | null = null;

    function loadPresets() {
        presets = readColumnPresets(storageKey ?? undefined);
    }

    onMount(() => {
        loadPresets();
        lastLoadedStorageKey = storageKey;
    });

    $: if (browser && lastLoadedStorageKey !== storageKey) {
        loadPresets();
        lastLoadedStorageKey = storageKey;
    }

    function requestSave() {
        const nm = (name || "").trim();
        if (!nm) {
            dispatch("error", { message: "Name required" });
            return;
        }
        if (presets[nm] && !confirm(`Overwrite layout "${nm}"?`)) {
            return;
        }
        saveColumnPreset(nm, {
            columns: currentColumns,
            customColumns: currentCustomColumns,
            sort: currentSort,
            order: currentOrder,
            kpis: currentKpis,
            kpiConfig: currentKpiConfig,
        }, storageKey ?? undefined);
        name = "";
        loadPresets();
        dispatch("saved", { name: nm });
    }

    function handleLoad(presetName: string) {
        const p = presets[presetName];
        if (!p) return;
        dispatch("load", { name: presetName, preset: p });
        open = false;
    }

    function handleDelete(presetName: string) {
        if (!confirm(`Delete layout "${presetName}"?`)) {
            return;
        }
        deleteColumnPreset(presetName, storageKey ?? undefined);
        loadPresets();
        dispatch("deleted", { name: presetName });
    }
</script>

<DeferredModalTrigger
    bind:open
    title="My layouts"
    size="md"
    scrollable={false}
    buttonLabel="My layouts"
    buttonClass="btn ux-btn btn-sm"
>
    <div class="ux-column-preset-modal">
        <div class="small ux-muted">
            Save the current layout or reuse a saved layout for this table.
        </div>
        <div class="input-group input-group-sm ux-column-preset-savebar">
            <input
                class="form-control form-control-sm"
                placeholder="Save current as..."
                bind:value={name}
            />
            <button class="btn ux-btn btn-sm" on:click={requestSave}
                >Save</button
            >
        </div>
        <div class="preset-list">
            {#if Object.keys(presets).length === 0}
                <div class="ux-column-preset-empty small text-muted">No saved layouts</div>
            {/if}
            {#each Object.keys(presets) as pn}
                <div class="preset-item">
                    <div class="preset-name" title={pn}>
                        {pn}
                    </div>
                    <div class="preset-actions">
                        <button
                            class="btn ux-btn btn-sm me-1"
                            on:click={() => handleLoad(pn)}>Load</button
                        >
                        <button
                            class="btn btn-sm btn-outline-danger"
                            on:click={() => handleDelete(pn)}>Delete</button
                        >
                    </div>
                </div>
            {/each}
        </div>
    </div>
</DeferredModalTrigger>

<style>
    .ux-column-preset-modal {
        display: grid;
        gap: 0.7rem;
        min-width: min(34rem, 100%);
        max-width: 100%;
    }

    .ux-column-preset-savebar {
        margin: 0;
    }

    .preset-list {
        display: grid;
        gap: 0.55rem;
        max-height: min(48vh, 20rem);
        overflow: auto;
        padding-right: 0.08rem;
    }

    .preset-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.75rem;
        align-items: center;
        padding: 0.5rem 0.56rem;
        border: 1px solid var(--ux-border);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 88%, transparent);
    }

    .preset-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--ux-text-sm);
        font-weight: 600;
    }

    .preset-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.38rem;
    }

    .ux-column-preset-empty {
        padding: 0.8rem 0.9rem;
        border: 1px dashed color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 72%, transparent);
    }
</style>
