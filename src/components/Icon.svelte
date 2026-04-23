<script lang="ts">
    import { renderAppIconSvg, type AppIconName } from "$lib/icons";

    export let name: AppIconName;
    export let className = "";
    export let label: string | null = null;
    export let size = "1em";

    $: markup = renderAppIconSvg(name, {
        className,
        label: label ?? undefined,
        size,
    });
</script>

{@html markup}
