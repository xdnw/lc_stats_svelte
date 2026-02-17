<script lang="ts">
    import { copyShareLink } from "$lib";

    export let onReset: (() => void) | null = null;
</script>

<div class="d-flex flex-wrap gap-1 align-items-center justify-content-end">
    <slot />
    <button class="btn ux-btn btn-sm fw-bold" on:click={() => copyShareLink()}>
        Copy share link
    </button>
    <button class="btn ux-btn btn-sm fw-bold" on:click={() => onReset?.()}>
        Reset
    </button>
</div>
