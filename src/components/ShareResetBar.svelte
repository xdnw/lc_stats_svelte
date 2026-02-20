<script lang="ts">
    import { copyShareLink } from "$lib";

    export let onReset: (() => void) | null = null;
    export let onSharePrepare: (() => void | Promise<void>) | null = null;
    export let resetDirty = false;

    async function handleShare() {
        await copyShareLink({
            prepare: onSharePrepare ?? undefined,
        });
    }
</script>

<div class="d-flex flex-wrap gap-1 align-items-center justify-content-end">
    <slot />
    <button class="btn ux-btn btn-sm fw-bold" on:click={handleShare}>
        Copy share link
    </button>
    <button
        class="btn ux-btn btn-sm fw-bold"
        class:ux-btn-danger={resetDirty}
        on:click={() => onReset?.()}
    >
        Reset
    </button>
</div>
