<script lang="ts">
    type BreadcrumbItem = {
        label: string;
        href?: string;
    };

    export let items: BreadcrumbItem[] = [];
</script>

<nav aria-label="Breadcrumb" class="ux-breadcrumbs">
    <ol class="breadcrumb m-0">
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

<style>
    .ux-breadcrumbs {
        display: block;
        margin: 0;
    }

    .ux-breadcrumbs .breadcrumb {
        margin: 0;
        font-size: 0.7rem;
        font-weight: 500;
        line-height: 1;
    }

    .ux-breadcrumbs .breadcrumb-item + .breadcrumb-item::before {
        padding-right: 0.35rem;
        padding-left: 0.35rem;
    }
</style>
