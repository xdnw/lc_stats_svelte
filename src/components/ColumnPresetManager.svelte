<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import {
        readColumnPresets,
        saveColumnPreset,
        deleteColumnPreset,
        type ColumnPreset,
    } from "$lib";
    import type { SharedKpiConfig } from "$lib/kpi";

    export let currentColumns: string[] = [];
    export let currentSort: string = "";
    export let currentOrder: string = "desc";
    export let currentKpis: string[] = [];
    export let currentKpiConfig:
        | SharedKpiConfig
        | Record<string, unknown>
        | null = null;

    const dispatch = createEventDispatcher();

    let presets: Record<string, ColumnPreset> = {};
    let name = "";

    function loadPresets() {
        presets = readColumnPresets();
    }

    onMount(loadPresets);

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
            sort: currentSort,
            order: currentOrder,
            kpis: currentKpis,
            kpiConfig: currentKpiConfig,
        });
        name = "";
        loadPresets();
        dispatch("saved", { name: nm });
    }

    function handleLoad(presetName: string) {
        const p = presets[presetName];
        if (!p) return;
        dispatch("load", { name: presetName, preset: p });
    }

    function handleDelete(presetName: string) {
        if (!confirm(`Delete layout "${presetName}"?`)) {
            return;
        }
        deleteColumnPreset(presetName);
        loadPresets();
        dispatch("deleted", { name: presetName });
    }
</script>

<div class="dropdown d-inline">
    <button
        class="btn ux-btn btn-sm"
        type="button"
        id="cpDropdown"
        data-bs-toggle="dropdown"
        aria-expanded="false"
    >
        My layouts&nbsp;<i class="bi bi-chevron-down"></i>
    </button>
    <div
        class="dropdown-menu p-2"
        aria-labelledby="cpDropdown"
        style="min-width:260px;"
    >
        <div class="input-group input-group-sm mb-2">
            <input
                class="form-control form-control-sm"
                placeholder="Save current as..."
                bind:value={name}
            />
            <button class="btn ux-btn btn-sm" on:click={requestSave}
                >Save</button
            >
        </div>
        <hr class="dropdown-divider" />
        <div class="preset-list">
            {#if Object.keys(presets).length === 0}
                <div class="small text-muted px-2">No saved layouts</div>
            {/if}
            {#each Object.keys(presets) as pn}
                <div class="preset-item px-2 py-1 small">
                    <div class="text-truncate" style="max-width:140px">
                        {pn}
                    </div>
                    <div>
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
</div>

<style>
    .preset-list {
        max-height: 220px;
        overflow: auto;
    }
    .preset-item {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: center;
    }
</style>
