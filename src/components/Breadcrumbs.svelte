<script lang="ts">
    type BreadcrumbItem = {
        label: string;
        href?: string;
    };

    export let items: BreadcrumbItem[] = [];
</script>

<nav aria-label="Breadcrumb" class="ux-breadcrumbs">
    <ol class="breadcrumb m-0 fw-bold">
        {#each items as item, index}
            <li
                class="breadcrumb-item"
                class:active={index === items.length - 1}
                aria-current={index === items.length - 1 ? "page" : undefined}
            >
                {#if item.href && index !== items.length - 1}
                    <a href={item.href} class="text-decoration-none"
                        >{item.label}</a
                    >
                {:else}
                    {item.label}
                {/if}
            </li>
        {/each}
    </ol>
</nav>
