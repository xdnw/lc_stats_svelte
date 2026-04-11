<script lang="ts">
    import ExportDataMenu from "../../components/ExportDataMenu.svelte";
    import type { ExportMenuAction, ExportMenuDataset } from "../../components/exportMenuTypes";
    import GridColumnManager from "./GridColumnManager.svelte";
    import type { GridColumnDefinition } from "./types";
    import { createEventDispatcher } from "svelte";

    export let columns: GridColumnDefinition[] = [];
    export let visibleColumnKeys: string[] = [];
    export let columnOrderKeys: string[] = [];
    export let exportDatasets: ExportMenuDataset[] = [];
    export let exportButtonLabel = "Export data";
    export let columnButtonLabel = "Customize Columns";

    const dispatch = createEventDispatcher<{
        export: ExportMenuAction;
        toggleColumn: { key: string };
        showAllColumns: undefined;
        hideAllColumns: undefined;
        reorderColumn: { key: string; targetIndex: number };
    }>();

    let selectedDatasetKey = "";
</script>

<div class="d-flex flex-wrap justify-content-start align-items-center gap-2 mb-2 ux-grid-toolbar">
    <ExportDataMenu
        datasets={exportDatasets}
        bind:selectedDatasetKey
        buttonLabel={exportButtonLabel}
        onExport={(action) => dispatch("export", action)}
    />

    <GridColumnManager
        {columns}
        {visibleColumnKeys}
        {columnOrderKeys}
        buttonLabel={columnButtonLabel}
        on:toggleColumn={(event) => dispatch("toggleColumn", event.detail)}
        on:showAllColumns={() => dispatch("showAllColumns", undefined)}
        on:hideAllColumns={() => dispatch("hideAllColumns", undefined)}
        on:reorderColumn={(event) => dispatch("reorderColumn", event.detail)}
    />
</div>
