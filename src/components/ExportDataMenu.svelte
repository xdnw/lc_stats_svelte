<script lang="ts">
    import { resolveExportActions } from "$lib/exportActions";
    import Icon from "./Icon.svelte";
    import MenuDropdown from "./MenuDropdown.svelte";
    import type {
        ExportMenuDataset,
        ExportMenuHandler,
    } from "./exportMenuTypes";

    export let datasets: ExportMenuDataset[] = [];
    export let selectedDatasetKey = "";
    export let onExport: ExportMenuHandler | null = null;
    export let buttonLabel = "Export data";
    const selectId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `export-dataset-select-${crypto.randomUUID()}`
            : `export-dataset-select-${Math.random().toString(36).slice(2, 10)}`;

    const actions = resolveExportActions();

    $: if (!selectedDatasetKey && datasets.length > 0) {
        selectedDatasetKey = datasets[0].key;
    }
    $: hasDatasets = datasets.length > 0;
    $: showDatasetSelect = datasets.length > 1;
</script>

<div class="d-flex flex-nowrap gap-1 align-items-center">
    {#if showDatasetSelect}
        <select
            id={selectId}
            class="form-select form-select-sm ux-export-select"
            bind:value={selectedDatasetKey}
            aria-label="Choose export dataset"
            disabled={!hasDatasets}
        >
            {#each datasets as dataset}
                <option value={dataset.key}>{dataset.label}</option>
            {/each}
        </select>
    {/if}
    <MenuDropdown
        label={buttonLabel}
        buttonClass="btn ux-btn btn-sm"
        align="end"
        closeOnContentClick={true}
        disabled={!hasDatasets}
        panelClass="ux-export-menu"
    >
        <ul class="ux-export-menu-list">
            {#each actions as action}
                <li>
                    <button
                        class="ux-export-menu-item"
                        type="button"
                        disabled={!hasDatasets}
                        on:click={() =>
                            onExport?.({
                                datasetKey: selectedDatasetKey,
                                format: action.format,
                                target: action.target,
                            })}
                    >
                        <Icon name={action.icon} className="ux-icon-leading" />
                        {action.label}
                    </button>
                </li>
            {/each}
        </ul>
    </MenuDropdown>
</div>

<style>
    :global(.ux-export-menu) {
        padding: 0.12rem;
        min-width: 8.8rem;
        max-width: min(10.5rem, calc(100vw - 0.75rem));
    }

    .ux-export-menu-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .ux-export-menu-item {
        display: flex;
        align-items: center;
        width: 100%;
        gap: 0.28rem;
        padding: 0.22rem 0.34rem;
        border: 0;
        border-radius: var(--ux-radius-sm);
        background: transparent;
        color: var(--ux-text);
        text-align: left;
        font-size: 0.72rem;
        font-weight: 500;
        line-height: 1.15;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    .ux-export-menu-item:hover:not(:disabled) {
        background: color-mix(in srgb, var(--ux-brand) 14%, transparent);
    }

    .ux-export-menu-item:disabled {
        opacity: 0.6;
    }

    .ux-export-select {
        width: auto;
        min-width: 0;
        max-width: 8.1rem;
        font-size: 0.72rem;
    }
</style>
