<script lang="ts">
    import Icon from "../../components/Icon.svelte";
    import MenuDropdown from "../../components/MenuDropdown.svelte";
    import type { ExportMenuAction, ExportMenuDataset } from "../../components/exportMenuTypes";
    import { resolveExportActions } from "$lib/exportActions";
    import GridColumnManager from "./GridColumnManager.svelte";
    import type { GridColumnDefinition } from "./types";
    import { createEventDispatcher } from "svelte";

    export let columns: GridColumnDefinition[] = [];
    export let visibleColumnKeys: string[] = [];
    export let columnOrderKeys: string[] = [];
    export let exportDatasets: ExportMenuDataset[] = [];
    export let exportButtonLabel = "Export data";
    export let columnButtonLabel = "Customize Columns";
    export let columnFooterActionLabel = "";
    export let columnFooterActionButtonClass = "btn ux-btn btn-sm";

    const dispatch = createEventDispatcher<{
        export: ExportMenuAction;
        toggleColumn: { key: string };
        showAllColumns: undefined;
        hideAllColumns: undefined;
        reorderColumn: { key: string; targetIndex: number };
        columnAction: undefined;
    }>();

    let selectedDatasetKey = "";

    const exportActions = resolveExportActions();

    $: if (!selectedDatasetKey && exportDatasets.length > 0) {
        selectedDatasetKey = exportDatasets[0].key;
    }
    $: hasExportDatasets = exportDatasets.length > 0;
    $: showExportDatasetSelect = exportDatasets.length > 1;
</script>

<div class="d-flex flex-wrap justify-content-start align-items-center gap-2 mb-2 ux-grid-toolbar">
    <div class="d-flex flex-nowrap gap-1 align-items-center">
        {#if showExportDatasetSelect}
            <select
                class="form-select form-select-sm ux-grid-export-select"
                bind:value={selectedDatasetKey}
                aria-label="Choose export dataset"
                disabled={!hasExportDatasets}
            >
                {#each exportDatasets as dataset}
                    <option value={dataset.key}>{dataset.label}</option>
                {/each}
            </select>
        {/if}
        <MenuDropdown
            label={exportButtonLabel}
            buttonClass="btn ux-btn btn-sm"
            align="end"
            closeOnContentClick={true}
            disabled={!hasExportDatasets}
            panelClass="ux-grid-export-menu"
        >
            <ul class="ux-grid-export-menu-list">
                {#each exportActions as action}
                    <li>
                        <button
                            class="ux-grid-export-menu-item"
                            type="button"
                            disabled={!hasExportDatasets}
                            on:click={() =>
                                dispatch("export", {
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

    <GridColumnManager
        {columns}
        {visibleColumnKeys}
        {columnOrderKeys}
        buttonLabel={columnButtonLabel}
        footerActionLabel={columnFooterActionLabel}
        footerActionButtonClass={columnFooterActionButtonClass}
        on:toggleColumn={(event) => dispatch("toggleColumn", event.detail)}
        on:showAllColumns={() => dispatch("showAllColumns", undefined)}
        on:hideAllColumns={() => dispatch("hideAllColumns", undefined)}
        on:reorderColumn={(event) => dispatch("reorderColumn", event.detail)}
        on:footerAction={() => dispatch("columnAction", undefined)}
    />
</div>

<style>
    :global(.ux-grid-export-menu) {
        padding: 0.12rem;
        min-width: 8.8rem;
        max-width: min(10.5rem, calc(100vw - 0.75rem));
    }

    .ux-grid-export-menu-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .ux-grid-export-menu-item {
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

    .ux-grid-export-menu-item:hover:not(:disabled) {
        background: color-mix(in srgb, var(--ux-brand) 14%, transparent);
    }

    .ux-grid-export-menu-item:disabled {
        opacity: 0.6;
    }

    .ux-grid-export-select {
        width: auto;
        min-width: 0;
        max-width: 8.1rem;
        font-size: 0.72rem;
    }
</style>
