<script lang="ts">
    import { copyShareLink } from "$lib/dataExport";

    export let onReset: (() => void) | null = null;
    export let onSharePrepare: (() => void | Promise<void>) | null = null;
    export let resetDirty = false;

    async function handleShare() {
        await copyShareLink({
            prepare: onSharePrepare ?? undefined,
        });
    }
</script>

<div class="ux-share-reset-bar">
    <slot />
    <button class="btn ux-btn btn-sm" type="button" on:click={handleShare}>
        Copy Link
    </button>
    <button
        class="btn ux-btn btn-sm"
        type="button"
        class:ux-btn-danger={resetDirty}
        on:click={() => onReset?.()}
    >
        Reset
    </button>
</div>

<style>
    .ux-share-reset-bar {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
        min-width: 0;
    }
</style>
