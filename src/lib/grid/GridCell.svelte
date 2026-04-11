<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { GridCellView } from "./types";

    export let cell: GridCellView = { kind: "empty" };

    const dispatch = createEventDispatcher<{
        action: {
            actionId: string;
            args?: Record<string, string | number | boolean | null>;
        };
    }>();

    function forwardAction(
        event: CustomEvent<{
            actionId: string;
            args?: Record<string, string | number | boolean | null>;
        }>,
    ): void {
        dispatch("action", event.detail);
    }

    function cellTitle(view: GridCellView): string {
        switch (view.kind) {
            case "text":
            case "number":
            case "money":
            case "date":
            case "link":
                return view.text;
            case "action":
                return view.title ?? view.text;
            case "stack":
                return view.items.map((item) => cellTitle(item)).join(" | ");
            case "empty":
                return "";
        }
    }

    function isPlainPrimaryClick(event: MouseEvent): boolean {
        return event.button === 0 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey;
    }

    function triggerAction(view: Extract<GridCellView, { kind: "action" }>): void {
        dispatch("action", {
            actionId: view.actionId,
            args: view.args,
        });
    }

    function handleActionLinkClick(
        event: MouseEvent,
        view: Extract<GridCellView, { kind: "action" }>,
    ): void {
        if (!isPlainPrimaryClick(event)) return;
        event.preventDefault();
        triggerAction(view);
    }
</script>

{#if cell.kind === "text"}
    <span class="ux-grid-cell-text" title={cellTitle(cell)}>{cell.text}</span>
{:else if cell.kind === "number"}
    <span class="ux-grid-cell-metric" title={cellTitle(cell)}>{cell.text}</span>
{:else if cell.kind === "money"}
    <span class="ux-grid-cell-metric" title={cellTitle(cell)}>{cell.text}</span>
{:else if cell.kind === "date"}
    <span class="ux-grid-cell-date" title={cellTitle(cell)}>{cell.text}</span>
{:else if cell.kind === "link"}
    <a
        class="ux-grid-cell-link"
        href={cell.href}
        target={cell.external ? "_blank" : undefined}
        rel={cell.external ? "noreferrer" : undefined}
        title={cellTitle(cell)}
    >
        {cell.text}
    </a>
{:else if cell.kind === "action"}
    {#if cell.href && !cell.disabled}
        <a
            class="btn ux-btn btn-sm fw-bold ux-grid-cell-action"
            href={cell.href}
            target={cell.external ? "_blank" : undefined}
            rel={cell.external ? "noreferrer" : undefined}
            title={cellTitle(cell)}
            data-grid-action-id={cell.actionId}
            data-grid-action-args={JSON.stringify(cell.args ?? {})}
            on:click|stopPropagation={(event) => handleActionLinkClick(event, cell)}
        >
            {cell.text}
        </a>
    {:else}
        <button
            class="btn ux-btn btn-sm fw-bold ux-grid-cell-action"
            type="button"
            disabled={cell.disabled}
            title={cellTitle(cell)}
            data-grid-action-id={cell.actionId}
            data-grid-action-args={JSON.stringify(cell.args ?? {})}
            on:click|stopPropagation={() => triggerAction(cell)}
        >
            {cell.text}
        </button>
    {/if}
{:else if cell.kind === "stack"}
    <span class="ux-grid-stack">
        {#each cell.items as item}
            <span class="ux-grid-stack-item"
                ><svelte:self cell={item} on:action={forwardAction} /></span
            >
        {/each}
    </span>
{:else}
    <span class="ux-grid-empty">-</span>
{/if}

<style>
    .ux-grid-cell-text,
    .ux-grid-cell-link {
        display: block;
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .ux-grid-cell-metric,
    .ux-grid-cell-date {
        display: block;
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
        font-variant-numeric: tabular-nums;
    }

    .ux-grid-stack {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 0.2rem;
        max-width: 100%;
        min-width: 0;
        white-space: normal;
    }

    .ux-grid-stack-item {
        display: inline-flex;
        min-width: 0;
    }

    .ux-grid-cell-action {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        max-width: 100%;
        padding: 0.14rem 0.45rem;
        font-size: 0.68rem;
        line-height: 1.2;
        white-space: normal;
        overflow-wrap: anywhere;
        text-align: left;
    }

    .ux-grid-empty {
        color: var(--ux-text-muted);
    }
</style>
