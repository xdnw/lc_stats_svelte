<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type {
        ConflictCustomBinaryOp,
        ConflictCustomBooleanExpr,
        ConflictCustomCompareOp,
        ConflictCustomFunctionName,
        ConflictCustomLogicOp,
        ConflictCustomMetricOption,
        ConflictCustomNumericExpr,
    } from "$lib/conflictCustomColumns";

    type ExprMode = "numeric" | "boolean";

    const NUMERIC_KIND_OPTIONS = [
        { value: "metric", label: "Metric" },
        { value: "value", label: "Value" },
        { value: "binary", label: "Math" },
        { value: "func", label: "Function" },
        { value: "if", label: "If" },
    ] as const;
    const BOOLEAN_KIND_OPTIONS = [
        { value: "compare", label: "Compare" },
        { value: "logic", label: "Logic" },
        { value: "not", label: "Not" },
    ] as const;
    const BINARY_OP_OPTIONS: Array<{ value: ConflictCustomBinaryOp; label: string }> = [
        { value: "add", label: "+" },
        { value: "sub", label: "-" },
        { value: "mul", label: "*" },
        { value: "div", label: "/" },
    ];
    const FUNCTION_OPTIONS: Array<{ value: ConflictCustomFunctionName; label: string }> = [
        { value: "abs", label: "abs" },
        { value: "min", label: "min" },
        { value: "max", label: "max" },
    ];
    const COMPARE_OPTIONS: Array<{ value: ConflictCustomCompareOp; label: string }> = [
        { value: "gt", label: ">" },
        { value: "gte", label: ">=" },
        { value: "eq", label: "=" },
        { value: "neq", label: "!=" },
        { value: "lte", label: "<=" },
        { value: "lt", label: "<" },
    ];
    const LOGIC_OPTIONS: Array<{ value: ConflictCustomLogicOp; label: string }> = [
        { value: "and", label: "and" },
        { value: "or", label: "or" },
    ];

    export let mode: ExprMode = "numeric";
    export let expr: ConflictCustomNumericExpr | ConflictCustomBooleanExpr;
    export let metricOptions: ConflictCustomMetricOption[] = [];
    export let label = "Expression";
    export let depth = 0;

    const dispatch = createEventDispatcher<{
        change: { expr: ConflictCustomNumericExpr | ConflictCustomBooleanExpr };
    }>();

    function firstMetricKey(): string {
        return metricOptions[0]?.value ?? "";
    }

    function normalizeMetric(metric: string): string {
        return metricOptions.some((option) => option.value === metric)
            ? metric
            : firstMetricKey();
    }

    function createDefaultNumericExpr(
        kind: ConflictCustomNumericExpr["kind"] = "metric",
    ): ConflictCustomNumericExpr {
        if (kind === "value") {
            return { kind: "value", value: 0 };
        }
        if (kind === "binary") {
            return {
                kind: "binary",
                op: "add",
                left: createDefaultNumericExpr("metric"),
                right: createDefaultNumericExpr("value"),
            };
        }
        if (kind === "func") {
            return {
                kind: "func",
                name: "abs",
                args: [createDefaultNumericExpr("metric")],
            };
        }
        if (kind === "if") {
            return {
                kind: "if",
                when: createDefaultBooleanExpr("compare"),
                then: createDefaultNumericExpr("metric"),
                else: createDefaultNumericExpr("value"),
            };
        }
        return { kind: "metric", metric: firstMetricKey() };
    }

    function createDefaultBooleanExpr(
        kind: ConflictCustomBooleanExpr["kind"] = "compare",
    ): ConflictCustomBooleanExpr {
        if (kind === "logic") {
            return {
                kind: "logic",
                op: "and",
                left: createDefaultBooleanExpr("compare"),
                right: createDefaultBooleanExpr("compare"),
            };
        }
        if (kind === "not") {
            return {
                kind: "not",
                value: createDefaultBooleanExpr("compare"),
            };
        }
        return {
            kind: "compare",
            op: "gt",
            left: createDefaultNumericExpr("metric"),
            right: createDefaultNumericExpr("value"),
        };
    }

    function ensureFunctionArgs(
        name: ConflictCustomFunctionName,
        args: ConflictCustomNumericExpr[],
    ): ConflictCustomNumericExpr[] {
        const normalized = args.length > 0 ? [...args] : [createDefaultNumericExpr("metric")];
        if (name === "abs") {
            return [normalized[0]];
        }
        return [
            normalized[0],
            normalized[1] ?? createDefaultNumericExpr("value"),
        ];
    }

    function emit(next: ConflictCustomNumericExpr | ConflictCustomBooleanExpr): void {
        dispatch("change", { expr: next });
    }

    function updateNumeric(next: ConflictCustomNumericExpr): void {
        emit(next);
    }

    function updateBoolean(next: ConflictCustomBooleanExpr): void {
        emit(next);
    }

    function handleKindChange(event: Event): void {
        const nextKind = (event.currentTarget as HTMLSelectElement).value;
        emit(
            mode === "numeric"
                ? createDefaultNumericExpr(nextKind as ConflictCustomNumericExpr["kind"])
                : createDefaultBooleanExpr(nextKind as ConflictCustomBooleanExpr["kind"]),
        );
    }

    function handleMetricChange(event: Event): void {
        const metric = normalizeMetric((event.currentTarget as HTMLSelectElement).value);
        updateNumeric({ kind: "metric", metric });
    }

    function handleValueChange(event: Event): void {
        const parsed = Number((event.currentTarget as HTMLInputElement).value);
        updateNumeric({
            kind: "value",
            value: Number.isFinite(parsed) ? parsed : 0,
        });
    }

    $: numericExpr = mode === "numeric" ? (expr as ConflictCustomNumericExpr) : null;
    $: booleanExpr = mode === "boolean" ? (expr as ConflictCustomBooleanExpr) : null;
    $: selectorValue = mode === "numeric" ? numericExpr?.kind : booleanExpr?.kind;
</script>

<div class="ux-cc-expr" data-depth={depth}>
    <div class="ux-cc-expr__header">
        <span class="ux-cc-expr__label">{label}</span>
        <select class="form-select form-select-sm ux-cc-expr__kind" value={selectorValue} on:change={handleKindChange}>
            {#if mode === "numeric"}
                {#each NUMERIC_KIND_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            {:else}
                {#each BOOLEAN_KIND_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            {/if}
        </select>
    </div>

    {#if mode === "numeric" && numericExpr}
        {#if numericExpr.kind === "metric"}
            <select class="form-select form-select-sm" value={numericExpr.metric} on:change={handleMetricChange}>
                {#each metricOptions as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </select>
        {:else if numericExpr.kind === "value"}
            <input
                class="form-control form-control-sm"
                type="number"
                step="any"
                value={numericExpr.value}
                on:input={handleValueChange}
            />
        {:else if numericExpr.kind === "binary"}
            <div class="ux-cc-expr__stack">
                <select
                    class="form-select form-select-sm"
                    value={numericExpr.op}
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            op: (event.currentTarget as HTMLSelectElement)
                                .value as ConflictCustomBinaryOp,
                        })}
                >
                    {#each BINARY_OP_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
                <svelte:self
                    mode="numeric"
                    expr={numericExpr.left}
                    {metricOptions}
                    depth={depth + 1}
                    label="Left"
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            left: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
                <svelte:self
                    mode="numeric"
                    expr={numericExpr.right}
                    {metricOptions}
                    depth={depth + 1}
                    label="Right"
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            right: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
            </div>
        {:else if numericExpr.kind === "func"}
            <div class="ux-cc-expr__stack">
                <select
                    class="form-select form-select-sm"
                    value={numericExpr.name}
                    on:change={(event) => {
                        const name = (event.currentTarget as HTMLSelectElement)
                            .value as ConflictCustomFunctionName;
                        updateNumeric({
                            ...numericExpr,
                            name,
                            args: ensureFunctionArgs(name, numericExpr.args),
                        });
                    }}
                >
                    {#each FUNCTION_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
                {#each ensureFunctionArgs(numericExpr.name, numericExpr.args) as arg, index}
                    <svelte:self
                        mode="numeric"
                        expr={arg}
                        {metricOptions}
                        depth={depth + 1}
                        label={numericExpr.name === "abs" ? "Value" : index === 0 ? "First" : "Second"}
                        on:change={(event) => {
                            const args = ensureFunctionArgs(numericExpr.name, numericExpr.args);
                            args[index] = event.detail.expr as ConflictCustomNumericExpr;
                            updateNumeric({
                                ...numericExpr,
                                args,
                            });
                        }}
                    />
                {/each}
            </div>
        {:else if numericExpr.kind === "if"}
            <div class="ux-cc-expr__stack">
                <svelte:self
                    mode="boolean"
                    expr={numericExpr.when}
                    {metricOptions}
                    depth={depth + 1}
                    label="When"
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            when: event.detail.expr as ConflictCustomBooleanExpr,
                        })}
                />
                <svelte:self
                    mode="numeric"
                    expr={numericExpr.then}
                    {metricOptions}
                    depth={depth + 1}
                    label="Then"
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            then: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
                <svelte:self
                    mode="numeric"
                    expr={numericExpr.else}
                    {metricOptions}
                    depth={depth + 1}
                    label="Else"
                    on:change={(event) =>
                        updateNumeric({
                            ...numericExpr,
                            else: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
            </div>
        {/if}
    {:else if mode === "boolean" && booleanExpr}
        {#if booleanExpr.kind === "compare"}
            <div class="ux-cc-expr__stack">
                <select
                    class="form-select form-select-sm"
                    value={booleanExpr.op}
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            op: (event.currentTarget as HTMLSelectElement)
                                .value as ConflictCustomCompareOp,
                        })}
                >
                    {#each COMPARE_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
                <svelte:self
                    mode="numeric"
                    expr={booleanExpr.left}
                    {metricOptions}
                    depth={depth + 1}
                    label="Left"
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            left: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
                <svelte:self
                    mode="numeric"
                    expr={booleanExpr.right}
                    {metricOptions}
                    depth={depth + 1}
                    label="Right"
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            right: event.detail.expr as ConflictCustomNumericExpr,
                        })}
                />
            </div>
        {:else if booleanExpr.kind === "logic"}
            <div class="ux-cc-expr__stack">
                <select
                    class="form-select form-select-sm"
                    value={booleanExpr.op}
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            op: (event.currentTarget as HTMLSelectElement)
                                .value as ConflictCustomLogicOp,
                        })}
                >
                    {#each LOGIC_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
                <svelte:self
                    mode="boolean"
                    expr={booleanExpr.left}
                    {metricOptions}
                    depth={depth + 1}
                    label="Left"
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            left: event.detail.expr as ConflictCustomBooleanExpr,
                        })}
                />
                <svelte:self
                    mode="boolean"
                    expr={booleanExpr.right}
                    {metricOptions}
                    depth={depth + 1}
                    label="Right"
                    on:change={(event) =>
                        updateBoolean({
                            ...booleanExpr,
                            right: event.detail.expr as ConflictCustomBooleanExpr,
                        })}
                />
            </div>
        {:else if booleanExpr.kind === "not"}
            <svelte:self
                mode="boolean"
                expr={booleanExpr.value}
                {metricOptions}
                depth={depth + 1}
                label="Value"
                on:change={(event) =>
                    updateBoolean({
                        ...booleanExpr,
                        value: event.detail.expr as ConflictCustomBooleanExpr,
                    })}
            />
        {/if}
    {/if}
</div>

<style>
    .ux-cc-expr {
        display: grid;
        gap: 0.35rem;
        padding: 0.45rem 0.5rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-left: 0.2rem solid color-mix(in srgb, var(--ux-border) 92%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 82%, transparent);
    }

    .ux-cc-expr[data-depth="0"] {
        padding: 0.55rem 0.6rem;
        border-left-color: color-mix(in srgb, var(--ux-danger) 58%, white);
        background: color-mix(in srgb, var(--ux-surface-alt) 90%, transparent);
    }

    .ux-cc-expr__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.35rem;
        align-items: center;
    }

    .ux-cc-expr__label {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ux-text-muted);
    }

    .ux-cc-expr__kind {
        min-width: 5.1rem;
    }

    .ux-cc-expr__stack {
        display: grid;
        gap: 0.35rem;
    }
</style>