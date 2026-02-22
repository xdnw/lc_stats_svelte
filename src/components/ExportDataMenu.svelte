<script lang="ts">
    import type { ExportFormat, ExportTarget } from "$lib";
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

    const actions: {
        label: string;
        format: ExportFormat;
        target: ExportTarget;
        icon: string;
    }[] = [
        {
            label: "Download CSV",
            format: "CSV",
            target: "download",
            icon: "bi-download",
        },
        {
            label: "Copy CSV",
            format: "CSV",
            target: "clipboard",
            icon: "bi-clipboard",
        },
        {
            label: "Download TSV",
            format: "TSV",
            target: "download",
            icon: "bi-download",
        },
        {
            label: "Copy TSV",
            format: "TSV",
            target: "clipboard",
            icon: "bi-clipboard",
        },
        {
            label: "Download JSON",
            format: "JSON",
            target: "download",
            icon: "bi-filetype-json",
        },
        {
            label: "Copy JSON",
            format: "JSON",
            target: "clipboard",
            icon: "bi-clipboard",
        },
    ];

    $: if (!selectedDatasetKey && datasets.length > 0) {
        selectedDatasetKey = datasets[0].key;
    }
    $: hasDatasets = datasets.length > 0;
</script>

<div class="d-flex flex-wrap gap-1 align-items-center">
    <label class="small ux-muted m-0" for={selectId}>Export</label>
    <select
        id={selectId}
        class="form-select form-select-sm"
        bind:value={selectedDatasetKey}
        style="min-width: 15rem;"
        disabled={!hasDatasets}
    >
        {#each datasets as dataset}
            <option value={dataset.key}>{dataset.label}</option>
        {/each}
    </select>
    <div class="dropdown">
        <button
            class="btn ux-btn btn-sm fw-bold dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            disabled={!hasDatasets}
        >
            {buttonLabel}
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
            {#each actions as action}
                <li>
                    <button
                        class="dropdown-item fw-bold"
                        type="button"
                        disabled={!hasDatasets}
                        on:click={() =>
                            onExport?.({
                                datasetKey: selectedDatasetKey,
                                format: action.format,
                                target: action.target,
                            })}
                    >
                        <i class={`bi ${action.icon} me-1`}></i>{action.label}
                    </button>
                </li>
            {/each}
        </ul>
    </div>
</div>
