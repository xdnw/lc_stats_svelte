<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { trimHeader } from "$lib";

    export let metrics: string[] = [];
    export let selected: string = "";
    export let label: string = "Metric";

    const dispatch = createEventDispatcher();
    const selectId = "metric-select-" + Math.random().toString(36).slice(2, 9);

    function onChange(e: Event) {
        const v = (e.target as HTMLSelectElement).value;
        dispatch("change", { value: v });
    }
</script>

<div class="d-flex align-items-center gap-2">
    <label for={selectId} class="small text-muted m-0">{label}</label>
    <select
        id={selectId}
        class="form-select form-select-sm"
        on:change={onChange}
        bind:value={selected}
    >
        {#each metrics as m}
            <option value={m}>{trimHeader(m)}</option>
        {/each}
    </select>
</div>
