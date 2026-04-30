<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import ConflictCustomExprEditor from "./ConflictCustomExprEditor.svelte";
    import ModalShell from "./ModalShell.svelte";
    import {
        buildConflictCustomColumnSentencePreview,
        sanitizeConflictCustomColumn,
        type ConflictCustomBooleanExpr,
        type ConflictCustomColumnConfig,
        type ConflictCustomColumnSemanticConfig,
        type ConflictCustomCompareOp,
        type ConflictCustomMetricOption,
        type ConflictCustomNumericDisplayKind,
        type ConflictCustomNumericExpr,
    } from "$lib/conflictCustomColumns";

    type ConflictLayoutValue = 0 | 1 | 2;
    type TemplateKey =
        | "ratio"
        | "difference"
        | "flag"
        | "member-sum"
        | "member-average"
        | "count-matching"
        | "share-matching"
        | "advanced";

    type DraftColumnInput =
        | {
              kind: "row-formula";
              label: string;
              formula:
                  | {
                        kind: "numeric";
                        display: ConflictCustomNumericDisplayKind;
                        expr: ConflictCustomNumericExpr;
                    }
                  | {
                        kind: "flag";
                        display: "flag";
                        expr: ConflictCustomBooleanExpr;
                    };
          }
        | {
              kind: "member-rollup";
              label: string;
              reducer: "sum" | "avg" | "min" | "max";
              display: ConflictCustomNumericDisplayKind;
              expr: ConflictCustomNumericExpr;
          }
        | {
              kind: "member-rollup";
              label: string;
              reducer: "count";
              display: "number";
              expr: ConflictCustomBooleanExpr;
          }
        | {
              kind: "member-rollup";
              label: string;
              reducer: "share";
              display: "percent";
              expr: ConflictCustomBooleanExpr;
          };

    type QuickState = {
        ratioNumeratorMetric: string;
        ratioDenominatorMetric: string;
        ratioDisplay: "number" | "percent";
        differenceLeftMetric: string;
        differenceRightMetric: string;
        differenceDisplay: "number" | "money";
        flagLeftMetric: string;
        flagOperator: ConflictCustomCompareOp;
        flagRightKind: "value" | "metric";
        flagRightMetric: string;
        flagRightValue: string;
        memberMetric: string;
        memberDisplay: ConflictCustomNumericDisplayKind;
        memberMatchMetric: string;
        memberMatchOperator: ConflictCustomCompareOp;
        memberMatchRightKind: "value" | "metric";
        memberMatchRightMetric: string;
        memberMatchRightValue: string;
    };

    const TEMPLATE_DEFS: Array<{
        key: TemplateKey;
        label: string;
        description: string;
        memberOnly?: boolean;
    }> = [
        {
            key: "ratio",
            label: "Ratio",
            description: "Compare one metric to another.",
        },
        {
            key: "difference",
            label: "Difference",
            description: "Subtract one metric from another.",
        },
        {
            key: "flag",
            label: "Flag",
            description: "Yes or No from a comparison.",
        },
        {
            key: "member-sum",
            label: "Member sum",
            description: "Sum one member metric on coalition or alliance rows.",
            memberOnly: true,
        },
        {
            key: "member-average",
            label: "Member average",
            description: "Average one member metric on coalition or alliance rows.",
            memberOnly: true,
        },
        {
            key: "count-matching",
            label: "Count matching members",
            description: "Count members where a comparison matches.",
            memberOnly: true,
        },
        {
            key: "share-matching",
            label: "Share matching members",
            description: "Share of members where a comparison matches.",
            memberOnly: true,
        },
        {
            key: "advanced",
            label: "Advanced",
            description: "Build the full expression directly.",
        },
    ];

    export let open = false;
    export let title = "Custom columns";
    export let layout: ConflictLayoutValue = 0;
    export let existingColumns: ConflictCustomColumnConfig[] = [];
    export let metricOptions: ConflictCustomMetricOption[] = [];
    export let validMetricKeys: string[] = [];

    const dispatch = createEventDispatcher<{
        close: undefined;
        save: { previousId: string | null; config: ConflictCustomColumnConfig };
        delete: { id: string };
    }>();

    let editingId: string | null = null;
    let draft = createRatioDraft(createQuickState(), "");
    let quickState = createQuickState();
    let selectedTemplate: TemplateKey = "ratio";
    let advancedMode = false;
    let labelTouched = false;
    let errorMessage = "";
    let lastOpen = false;

    function firstMetricKey(): string {
        return metricOptions[0]?.value ?? "";
    }

    function metricKeyAt(index: number): string {
        return metricOptions[index]?.value ?? firstMetricKey();
    }

    function metricUnit(metric: string): "number" | "money" {
        return metricOptions.find((option) => option.value === metric)?.unit === "money"
            ? "money"
            : "number";
    }

    function numberValue(input: string, fallback = 0): number {
        const parsed = Number(input);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function createQuickState(): QuickState {
        const metric = firstMetricKey();
        const alternateMetric = metricKeyAt(1);
        const display = metricUnit(metric) === "money" ? "money" : "number";
        return {
            ratioNumeratorMetric: metric,
            ratioDenominatorMetric: alternateMetric,
            ratioDisplay: "percent",
            differenceLeftMetric: metric,
            differenceRightMetric: alternateMetric,
            differenceDisplay: display,
            flagLeftMetric: metric,
            flagOperator: "gt",
            flagRightKind: "value",
            flagRightMetric: metric,
            flagRightValue: "0",
            memberMetric: metric,
            memberDisplay: display,
            memberMatchMetric: metric,
            memberMatchOperator: "gt",
            memberMatchRightKind: "value",
            memberMatchRightMetric: metric,
            memberMatchRightValue: "0",
        };
    }

    function createMetricExpr(metric: string): ConflictCustomNumericExpr {
        return {
            kind: "metric",
            metric: metric || firstMetricKey(),
        };
    }

    function createDefaultCompareExpr(): ConflictCustomBooleanExpr {
        return {
            kind: "compare",
            op: "gt",
            left: createMetricExpr(firstMetricKey()),
            right: { kind: "value", value: 0 },
        };
    }

    function createRatioDraft(state: QuickState, label: string): DraftColumnInput {
        const safeRatio: ConflictCustomNumericExpr = {
            kind: "binary",
            op: "div",
            left: createMetricExpr(state.ratioNumeratorMetric),
            right: {
                kind: "func",
                name: "max",
                args: [createMetricExpr(state.ratioDenominatorMetric), { kind: "value", value: 1 }],
            },
        };
        const expr = state.ratioDisplay === "percent"
            ? {
                kind: "binary",
                op: "mul",
                left: safeRatio,
                right: { kind: "value", value: 100 },
            } satisfies ConflictCustomNumericExpr
            : safeRatio;
        return {
            kind: "row-formula",
            label,
            formula: {
                kind: "numeric",
                display: state.ratioDisplay,
                expr,
            },
        };
    }

    function createDifferenceDraft(state: QuickState, label: string): DraftColumnInput {
        return {
            kind: "row-formula",
            label,
            formula: {
                kind: "numeric",
                display: state.differenceDisplay,
                expr: {
                    kind: "binary",
                    op: "sub",
                    left: createMetricExpr(state.differenceLeftMetric),
                    right: createMetricExpr(state.differenceRightMetric),
                },
            },
        };
    }

    function createFlagDraft(state: QuickState, label: string): DraftColumnInput {
        return {
            kind: "row-formula",
            label,
            formula: {
                kind: "flag",
                display: "flag",
                expr: {
                    kind: "compare",
                    op: state.flagOperator,
                    left: createMetricExpr(state.flagLeftMetric),
                    right: state.flagRightKind === "metric"
                        ? createMetricExpr(state.flagRightMetric)
                        : {
                            kind: "value",
                            value: numberValue(state.flagRightValue),
                        },
                },
            },
        };
    }

    function createMemberMetricDraft(
        state: QuickState,
        reducer: "sum" | "avg",
        label: string,
    ): DraftColumnInput {
        return {
            kind: "member-rollup",
            label,
            reducer,
            display: state.memberDisplay,
            expr: createMetricExpr(state.memberMetric),
        };
    }

    function createMemberMatchDraft(
        state: QuickState,
        reducer: "count" | "share",
        label: string,
    ): DraftColumnInput {
        const expr: ConflictCustomBooleanExpr = {
            kind: "compare",
            op: state.memberMatchOperator,
            left: createMetricExpr(state.memberMatchMetric),
            right: state.memberMatchRightKind === "metric"
                ? createMetricExpr(state.memberMatchRightMetric)
                : {
                    kind: "value",
                    value: numberValue(state.memberMatchRightValue),
                },
        };
        if (reducer === "count") {
            return {
                kind: "member-rollup",
                label,
                reducer: "count",
                display: "number",
                expr,
            };
        }
        return {
            kind: "member-rollup",
            label,
            reducer: "share",
            display: "percent",
            expr,
        };
    }

    function buildDraftForTemplate(
        template: TemplateKey,
        state: QuickState,
        label: string,
    ): DraftColumnInput {
        switch (template) {
            case "ratio":
                return createRatioDraft(state, label);
            case "difference":
                return createDifferenceDraft(state, label);
            case "flag":
                return createFlagDraft(state, label);
            case "member-sum":
                return createMemberMetricDraft(state, "sum", label);
            case "member-average":
                return createMemberMetricDraft(state, "avg", label);
            case "count-matching":
                return createMemberMatchDraft(state, "count", label);
            case "share-matching":
                return createMemberMatchDraft(state, "share", label);
            case "advanced":
                return draft;
        }
    }

    function isRatioExpr(
        expr: ConflictCustomNumericExpr,
    ): { numeratorMetric: string; denominatorMetric: string; display: "number" | "percent" } | null {
        if (
            expr.kind === "binary" &&
            expr.op === "mul" &&
            expr.right.kind === "value" &&
            expr.right.value === 100
        ) {
            const matched = isRatioExpr(expr.left);
            return matched ? { ...matched, display: "percent" } : null;
        }
        if (
            expr.kind === "binary" &&
            expr.op === "div" &&
            expr.left.kind === "metric" &&
            expr.right.kind === "func" &&
            expr.right.name === "max" &&
            expr.right.args.length === 2 &&
            expr.right.args[0]?.kind === "metric" &&
            expr.right.args[1]?.kind === "value" &&
            expr.right.args[1].value === 1
        ) {
            return {
                numeratorMetric: expr.left.metric,
                denominatorMetric: expr.right.args[0].metric,
                display: "number",
            };
        }
        return null;
    }

    function inferTemplateKey(config: DraftColumnInput): TemplateKey {
        if (config.kind === "row-formula") {
            if (config.formula.kind === "flag") {
                const expr = config.formula.expr;
                return expr.kind === "compare" && expr.left.kind === "metric"
                    ? "flag"
                    : "advanced";
            }

            const ratio = isRatioExpr(config.formula.expr);
            if (ratio) {
                return "ratio";
            }

            if (
                config.formula.expr.kind === "binary" &&
                config.formula.expr.op === "sub" &&
                config.formula.expr.left.kind === "metric" &&
                config.formula.expr.right.kind === "metric"
            ) {
                return "difference";
            }

            return "advanced";
        }

        if (
            (config.reducer === "sum" || config.reducer === "avg") &&
            config.expr.kind === "metric"
        ) {
            return config.reducer === "sum" ? "member-sum" : "member-average";
        }

        if (
            (config.reducer === "count" || config.reducer === "share") &&
            config.expr.kind === "compare" &&
            config.expr.left.kind === "metric"
        ) {
            return config.reducer === "count" ? "count-matching" : "share-matching";
        }

        return "advanced";
    }

    function seedQuickState(config: DraftColumnInput | null): QuickState {
        const next = createQuickState();
        if (!config) {
            return next;
        }

        if (config.kind === "row-formula") {
            if (config.formula.kind === "numeric") {
                const ratio = isRatioExpr(config.formula.expr);
                if (ratio) {
                    next.ratioNumeratorMetric = ratio.numeratorMetric;
                    next.ratioDenominatorMetric = ratio.denominatorMetric;
                    next.ratioDisplay = config.formula.display === "percent" ? "percent" : "number";
                }

                if (
                    config.formula.expr.kind === "binary" &&
                    config.formula.expr.op === "sub" &&
                    config.formula.expr.left.kind === "metric" &&
                    config.formula.expr.right.kind === "metric"
                ) {
                    next.differenceLeftMetric = config.formula.expr.left.metric;
                    next.differenceRightMetric = config.formula.expr.right.metric;
                    next.differenceDisplay = config.formula.display === "money" ? "money" : "number";
                }
            }

            if (config.formula.kind === "flag" && config.formula.expr.kind === "compare") {
                next.flagLeftMetric =
                    config.formula.expr.left.kind === "metric"
                        ? config.formula.expr.left.metric
                        : firstMetricKey();
                next.flagOperator = config.formula.expr.op;
                if (config.formula.expr.right.kind === "metric") {
                    next.flagRightKind = "metric";
                    next.flagRightMetric = config.formula.expr.right.metric;
                } else if (config.formula.expr.right.kind === "value") {
                    next.flagRightKind = "value";
                    next.flagRightValue = String(config.formula.expr.right.value);
                }
            }
        }

        if (config.kind === "member-rollup") {
            if (
                (config.reducer === "sum" || config.reducer === "avg") &&
                config.expr.kind === "metric"
            ) {
                next.memberMetric = config.expr.metric;
                next.memberDisplay = config.display;
            }

            if (
                (config.reducer === "count" || config.reducer === "share") &&
                config.expr.kind === "compare"
            ) {
                next.memberMatchMetric =
                    config.expr.left.kind === "metric" ? config.expr.left.metric : firstMetricKey();
                next.memberMatchOperator = config.expr.op;
                if (config.expr.right.kind === "metric") {
                    next.memberMatchRightKind = "metric";
                    next.memberMatchRightMetric = config.expr.right.metric;
                } else if (config.expr.right.kind === "value") {
                    next.memberMatchRightKind = "value";
                    next.memberMatchRightValue = String(config.expr.right.value);
                }
            }
        }

        return next;
    }

    function toDraft(config: ConflictCustomColumnConfig): DraftColumnInput {
        if (config.kind === "row-formula") {
            return {
                kind: "row-formula",
                label: config.label,
                formula: config.formula,
            };
        }
        return {
            kind: "member-rollup",
            label: config.label,
            reducer: config.reducer,
            display: config.display,
            expr: config.expr,
        } as DraftColumnInput;
    }

    function toSemanticConfig(config: ConflictCustomColumnConfig): ConflictCustomColumnSemanticConfig {
        if (config.kind === "row-formula") {
            if (config.formula.kind === "numeric") {
                return {
                    kind: "row-formula",
                    formula: config.formula,
                };
            }
            return {
                kind: "row-formula",
                formula: config.formula,
            };
        }
        return {
            kind: "member-rollup",
            reducer: config.reducer,
            display: config.display,
            expr: config.expr,
        } as ConflictCustomColumnSemanticConfig;
    }

    function setDraft(next: DraftColumnInput): void {
        draft = next;
        errorMessage = "";
    }

    function resetDraft(): void {
        editingId = null;
        selectedTemplate = "ratio";
        advancedMode = false;
        quickState = createQuickState();
        labelTouched = false;
        errorMessage = "";
        setDraft(createRatioDraft(quickState, ""));
    }

    function selectTemplate(template: TemplateKey): void {
        selectedTemplate = template;
        advancedMode = template === "advanced";
        if (template === "advanced") {
            return;
        }
        quickState = seedQuickState(draft);
        setDraft(buildDraftForTemplate(template, quickState, labelTouched ? draft.label : ""));
    }

    function syncEditState(config: DraftColumnInput): void {
        selectedTemplate = inferTemplateKey(config);
        advancedMode = selectedTemplate === "advanced";
        quickState = seedQuickState(config);
        setDraft(config);
        const sanitized = sanitizeConflictCustomColumn(config, validMetricKeys);
        const preview = sanitized
            ? buildConflictCustomColumnSentencePreview(toSemanticConfig(sanitized))
            : "";
        labelTouched = config.label.trim().length > 0 && config.label.trim() !== preview.trim();
    }

    function startEdit(config: ConflictCustomColumnConfig): void {
        editingId = config.id;
        syncEditState(toDraft(config));
    }

    function closeModal(): void {
        dispatch("close", undefined);
    }

    function handleLabelInput(event: Event): void {
        const label = (event.currentTarget as HTMLInputElement).value;
        labelTouched = true;
        setDraft({ ...draft, label });
    }

    function updateRowFormulaDisplay(display: ConflictCustomNumericDisplayKind): void {
        if (draft.kind !== "row-formula" || draft.formula.kind !== "numeric") {
            return;
        }
        setDraft({
            ...draft,
            formula: {
                ...draft.formula,
                display,
            },
        });
    }

    function updateRowFormulaNumericExpr(expr: ConflictCustomNumericExpr): void {
        if (draft.kind !== "row-formula" || draft.formula.kind !== "numeric") {
            return;
        }
        setDraft({
            ...draft,
            formula: {
                ...draft.formula,
                expr,
            },
        });
    }

    function updateRowFormulaFlagExpr(expr: ConflictCustomBooleanExpr): void {
        if (draft.kind !== "row-formula" || draft.formula.kind !== "flag") {
            return;
        }
        setDraft({
            ...draft,
            formula: {
                ...draft.formula,
                expr,
            },
        });
    }

    function updateMemberDisplay(display: ConflictCustomNumericDisplayKind): void {
        if (
            draft.kind !== "member-rollup" ||
            (draft.reducer !== "sum" &&
                draft.reducer !== "avg" &&
                draft.reducer !== "min" &&
                draft.reducer !== "max")
        ) {
            return;
        }
        setDraft({
            ...draft,
            display,
        });
    }

    function updateMemberNumericExpr(expr: ConflictCustomNumericExpr): void {
        if (
            draft.kind !== "member-rollup" ||
            (draft.reducer !== "sum" &&
                draft.reducer !== "avg" &&
                draft.reducer !== "min" &&
                draft.reducer !== "max")
        ) {
            return;
        }
        setDraft({
            ...draft,
            expr,
        });
    }

    function updateMemberBooleanExpr(expr: ConflictCustomBooleanExpr): void {
        if (
            draft.kind !== "member-rollup" ||
            (draft.reducer !== "count" && draft.reducer !== "share")
        ) {
            return;
        }
        setDraft({
            ...draft,
            expr,
        });
    }

    function updateQuickState(patch: Partial<QuickState>): void {
        quickState = { ...quickState, ...patch };
        setDraft(buildDraftForTemplate(selectedTemplate, quickState, labelTouched ? draft.label : ""));
    }

    function setAdvancedKind(nextKind: DraftColumnInput["kind"]): void {
        if (nextKind === draft.kind) return;
        setDraft(
            nextKind === "row-formula"
                ? {
                    kind: "row-formula",
                    label: draft.label,
                    formula: {
                        kind: "numeric",
                        display: metricUnit(firstMetricKey()) === "money" ? "money" : "number",
                        expr: createMetricExpr(firstMetricKey()),
                    },
                }
                : {
                    kind: "member-rollup",
                    label: draft.label,
                    reducer: "sum",
                    display: metricUnit(firstMetricKey()) === "money" ? "money" : "number",
                    expr: createMetricExpr(firstMetricKey()),
                },
        );
    }

    function setAdvancedFormulaKind(nextKind: "numeric" | "flag"): void {
        if (draft.kind !== "row-formula") return;
        setDraft(
            nextKind === "numeric"
                ? {
                    kind: "row-formula",
                    label: draft.label,
                    formula: {
                        kind: "numeric",
                        display: metricUnit(firstMetricKey()) === "money" ? "money" : "number",
                        expr: createMetricExpr(firstMetricKey()),
                    },
                }
                : {
                    kind: "row-formula",
                    label: draft.label,
                    formula: {
                        kind: "flag",
                        display: "flag",
                        expr: {
                            kind: "compare",
                            op: "gt",
                            left: createMetricExpr(firstMetricKey()),
                            right: { kind: "value", value: 0 },
                        },
                    },
                },
        );
    }

    function setAdvancedReducer(reducer: "sum" | "avg" | "min" | "max" | "count" | "share"): void {
        if (draft.kind !== "member-rollup") return;
        if (reducer === "count") {
            setDraft({
                kind: "member-rollup",
                label: draft.label,
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: createMetricExpr(firstMetricKey()),
                    right: { kind: "value", value: 0 },
                },
            });
            return;
        }
        if (reducer === "share") {
            setDraft({
                kind: "member-rollup",
                label: draft.label,
                reducer: "share",
                display: "percent",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: createMetricExpr(firstMetricKey()),
                    right: { kind: "value", value: 0 },
                },
            });
            return;
        }
        setDraft({
            kind: "member-rollup",
            label: draft.label,
            reducer,
            display: metricUnit(firstMetricKey()) === "money" ? "money" : "number",
            expr: createMetricExpr(firstMetricKey()),
        });
    }

    function handleSave(): void {
        errorMessage = "";
        if (!sanitizedDraft) {
            errorMessage = validationMessage || "Enter a valid custom column.";
            return;
        }
        dispatch("save", {
            previousId: editingId,
            config: sanitizedDraft,
        });
        if (editingId) {
            startEdit(sanitizedDraft);
        } else {
            resetDraft();
        }
    }

    function handleDelete(id: string): void {
        errorMessage = "";
        if (editingId === id) {
            resetDraft();
        }
        dispatch("delete", { id });
    }

    function detailPreview(config: ConflictCustomColumnConfig): string {
        return buildConflictCustomColumnSentencePreview(toSemanticConfig(config));
    }

    $: availableTemplates =
        layout === 2
            ? TEMPLATE_DEFS.filter((template) => !template.memberOnly)
            : TEMPLATE_DEFS;
    $: if (open && !lastOpen) {
        lastOpen = true;
        if (!editingId) {
            resetDraft();
        }
    } else if (!open && lastOpen) {
        lastOpen = false;
        resetDraft();
    }
    $: sanitizedDraft = sanitizeConflictCustomColumn(draft, validMetricKeys);
    $: sentencePreview = sanitizedDraft
        ? buildConflictCustomColumnSentencePreview(toSemanticConfig(sanitizedDraft))
        : "";
    $: validationMessage =
        metricOptions.length === 0
            ? "No native conflict metrics are available for this editor."
            : layout === 2 && draft.kind === "member-rollup"
              ? "Nation layout supports row formulas only."
              : sanitizedDraft == null
                ? "This column is invalid. Check the selected metrics, display kind, and expression setup."
                : "";
    $: rowFormulaDisplayValue =
        draft.kind === "row-formula" && draft.formula.kind === "numeric"
            ? draft.formula.display
            : "number";
    $: memberDisplayValue =
        draft.kind === "member-rollup" &&
        (draft.reducer === "sum" ||
            draft.reducer === "avg" ||
            draft.reducer === "min" ||
            draft.reducer === "max")
            ? draft.display
            : "number";
    $: rowFormulaNumericExpr =
        draft.kind === "row-formula" && draft.formula.kind === "numeric"
            ? draft.formula.expr
            : createMetricExpr(firstMetricKey());
    $: rowFormulaFlagExpr =
        draft.kind === "row-formula" && draft.formula.kind === "flag"
            ? draft.formula.expr
            : createDefaultCompareExpr();
    $: memberNumericExpr =
        draft.kind === "member-rollup" &&
        (draft.reducer === "sum" ||
            draft.reducer === "avg" ||
            draft.reducer === "min" ||
            draft.reducer === "max")
            ? draft.expr
            : createMetricExpr(firstMetricKey());
    $: memberBooleanExpr =
        draft.kind === "member-rollup" &&
        (draft.reducer === "count" || draft.reducer === "share")
            ? draft.expr
            : createDefaultCompareExpr();
</script>

<ModalShell {open} {title} size="xl" bodyClass="ux-custom-modal-body" on:close={closeModal}>
    <div class="ux-custom-modal-grid">
        <section class="ux-custom-modal-pane ux-custom-modal-pane-editor">
            <div class="ux-custom-pane-heading">
                <div class="ux-modal-section-title">{editingId ? "Edit column" : "New column"}</div>
                <div class="ux-custom-pane-meta">
                    {editingId
                        ? "Update the selected column in place."
                        : "Pick a shape, confirm the preview, then save."}
                </div>
            </div>

            <div class="ux-custom-block">
                <div class="ux-custom-block__title">Templates</div>

                <div class="ux-custom-template-grid" role="list" aria-label="Column templates">
                    {#each availableTemplates as template}
                        <button
                            type="button"
                            class="ux-custom-template-card"
                            class:is-active={selectedTemplate === template.key}
                            on:click={() => selectTemplate(template.key)}
                        >
                            <span class="ux-custom-template-card__title">{template.label}</span>
                            <span class="ux-custom-template-card__body">{template.description}</span>
                        </button>
                    {/each}
                </div>
            </div>

            <div class="ux-custom-meta-grid">
                <label class="ux-custom-field ux-custom-field--grow">
                    <span class="small fw-semibold">Label</span>
                    <input
                        class="form-control form-control-sm"
                        type="text"
                        value={draft.label}
                        placeholder={sentencePreview}
                        on:input={handleLabelInput}
                    />
                </label>

                <div class="ux-custom-field ux-custom-preview-field">
                    <div class="small fw-semibold">Formula preview</div>
                    <div class="ux-custom-preview">
                        <div class="ux-custom-preview__text">{sentencePreview || "Complete the editor to preview this column."}</div>
                    </div>
                </div>
            </div>

            {#if !advancedMode && selectedTemplate !== "advanced"}
                <div class="ux-custom-block">
                    <div class="ux-custom-block__header">
                        <div class="ux-custom-block__title">Setup</div>
                        <button class="btn ux-btn btn-sm" type="button" on:click={() => (advancedMode = true)}>
                            Advanced
                        </button>
                    </div>

                    <div class="ux-custom-quick-grid">
                        {#if selectedTemplate === "ratio"}
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Numerator</span>
                                <select class="form-select form-select-sm" value={quickState.ratioNumeratorMetric} on:change={(event) => updateQuickState({ ratioNumeratorMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Denominator</span>
                                <select class="form-select form-select-sm" value={quickState.ratioDenominatorMetric} on:change={(event) => updateQuickState({ ratioDenominatorMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--medium">
                                <span class="small fw-semibold">Display</span>
                                <select class="form-select form-select-sm" value={quickState.ratioDisplay} on:change={(event) => updateQuickState({ ratioDisplay: (event.currentTarget as HTMLSelectElement).value as "number" | "percent" })}>
                                    <option value="number">Number</option>
                                    <option value="percent">Percent</option>
                                </select>
                            </label>
                        {:else if selectedTemplate === "difference"}
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Left metric</span>
                                <select class="form-select form-select-sm" value={quickState.differenceLeftMetric} on:change={(event) => updateQuickState({ differenceLeftMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Right metric</span>
                                <select class="form-select form-select-sm" value={quickState.differenceRightMetric} on:change={(event) => updateQuickState({ differenceRightMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--medium">
                                <span class="small fw-semibold">Display</span>
                                <select class="form-select form-select-sm" value={quickState.differenceDisplay} on:change={(event) => updateQuickState({ differenceDisplay: (event.currentTarget as HTMLSelectElement).value as "number" | "money" })}>
                                    <option value="number">Number</option>
                                    {#if metricUnit(quickState.differenceLeftMetric) === "money" && metricUnit(quickState.differenceRightMetric) === "money"}
                                        <option value="money">Money</option>
                                    {/if}
                                </select>
                            </label>
                        {:else if selectedTemplate === "flag"}
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Left metric</span>
                                <select class="form-select form-select-sm" value={quickState.flagLeftMetric} on:change={(event) => updateQuickState({ flagLeftMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--operator">
                                <span class="small fw-semibold">Comparison</span>
                                <select class="form-select form-select-sm" value={quickState.flagOperator} on:change={(event) => updateQuickState({ flagOperator: (event.currentTarget as HTMLSelectElement).value as ConflictCustomCompareOp })}>
                                    <option value="gt">&gt;</option>
                                    <option value="gte">&gt;=</option>
                                    <option value="eq">=</option>
                                    <option value="neq">!=</option>
                                    <option value="lte">&lt;=</option>
                                    <option value="lt">&lt;</option>
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--toggle">
                                <span class="small fw-semibold">Right side</span>
                                <select class="form-select form-select-sm" value={quickState.flagRightKind} on:change={(event) => updateQuickState({ flagRightKind: (event.currentTarget as HTMLSelectElement).value as "value" | "metric" })}>
                                    <option value="value">Value</option>
                                    <option value="metric">Metric</option>
                                </select>
                            </label>
                            {#if quickState.flagRightKind === "metric"}
                                <label class="ux-custom-field ux-custom-field--grow">
                                    <span class="small fw-semibold">Right metric</span>
                                    <select class="form-select form-select-sm" value={quickState.flagRightMetric} on:change={(event) => updateQuickState({ flagRightMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                        {#each metricOptions as option}
                                            <option value={option.value}>{option.label}</option>
                                        {/each}
                                    </select>
                                </label>
                            {:else}
                                <label class="ux-custom-field ux-custom-field--value">
                                    <span class="small fw-semibold">Right value</span>
                                    <input class="form-control form-control-sm" type="number" step="any" value={quickState.flagRightValue} on:input={(event) => updateQuickState({ flagRightValue: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                            {/if}
                        {:else if selectedTemplate === "member-sum" || selectedTemplate === "member-average"}
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Member metric</span>
                                <select class="form-select form-select-sm" value={quickState.memberMetric} on:change={(event) => updateQuickState({ memberMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--medium">
                                <span class="small fw-semibold">Display</span>
                                <select class="form-select form-select-sm" value={quickState.memberDisplay} on:change={(event) => updateQuickState({ memberDisplay: (event.currentTarget as HTMLSelectElement).value as ConflictCustomNumericDisplayKind })}>
                                    <option value="number">Number</option>
                                    <option value="percent">Percent</option>
                                    {#if metricUnit(quickState.memberMetric) === "money"}
                                        <option value="money">Money</option>
                                    {/if}
                                </select>
                            </label>
                        {:else if selectedTemplate === "count-matching" || selectedTemplate === "share-matching"}
                            <label class="ux-custom-field ux-custom-field--grow">
                                <span class="small fw-semibold">Member metric</span>
                                <select class="form-select form-select-sm" value={quickState.memberMatchMetric} on:change={(event) => updateQuickState({ memberMatchMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                    {#each metricOptions as option}
                                        <option value={option.value}>{option.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--operator">
                                <span class="small fw-semibold">Comparison</span>
                                <select class="form-select form-select-sm" value={quickState.memberMatchOperator} on:change={(event) => updateQuickState({ memberMatchOperator: (event.currentTarget as HTMLSelectElement).value as ConflictCustomCompareOp })}>
                                    <option value="gt">&gt;</option>
                                    <option value="gte">&gt;=</option>
                                    <option value="eq">=</option>
                                    <option value="neq">!=</option>
                                    <option value="lte">&lt;=</option>
                                    <option value="lt">&lt;</option>
                                </select>
                            </label>
                            <label class="ux-custom-field ux-custom-field--toggle">
                                <span class="small fw-semibold">Right side</span>
                                <select class="form-select form-select-sm" value={quickState.memberMatchRightKind} on:change={(event) => updateQuickState({ memberMatchRightKind: (event.currentTarget as HTMLSelectElement).value as "value" | "metric" })}>
                                    <option value="value">Value</option>
                                    <option value="metric">Metric</option>
                                </select>
                            </label>
                            {#if quickState.memberMatchRightKind === "metric"}
                                <label class="ux-custom-field ux-custom-field--grow">
                                    <span class="small fw-semibold">Right metric</span>
                                    <select class="form-select form-select-sm" value={quickState.memberMatchRightMetric} on:change={(event) => updateQuickState({ memberMatchRightMetric: (event.currentTarget as HTMLSelectElement).value })}>
                                        {#each metricOptions as option}
                                            <option value={option.value}>{option.label}</option>
                                        {/each}
                                    </select>
                                </label>
                            {:else}
                                <label class="ux-custom-field ux-custom-field--value">
                                    <span class="small fw-semibold">Right value</span>
                                    <input class="form-control form-control-sm" type="number" step="any" value={quickState.memberMatchRightValue} on:input={(event) => updateQuickState({ memberMatchRightValue: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                            {/if}
                        {/if}
                    </div>
                </div>
            {/if}

            {#if advancedMode}
                <div class="ux-custom-block ux-custom-block-builder">
                    <div class="ux-custom-block__header">
                        <div class="ux-custom-block__title">Builder</div>
                        {#if selectedTemplate !== "advanced"}
                            <button class="btn ux-btn btn-sm" type="button" on:click={() => (advancedMode = false)}>
                                Template fields
                            </button>
                        {/if}
                    </div>

                    <div class="ux-custom-advanced">
                        <div class="ux-custom-advanced__controls">
                            {#if layout !== 2}
                                <label class="ux-custom-field">
                                    <span class="small fw-semibold">Column family</span>
                                    <select class="form-select form-select-sm" value={draft.kind} on:change={(event) => setAdvancedKind((event.currentTarget as HTMLSelectElement).value as DraftColumnInput["kind"])}>
                                        <option value="row-formula">Row formula</option>
                                        <option value="member-rollup">Member aggregate</option>
                                    </select>
                                </label>
                            {/if}

                            {#if draft.kind === "row-formula"}
                                <label class="ux-custom-field">
                                    <span class="small fw-semibold">Result type</span>
                                    <select class="form-select form-select-sm" value={draft.formula.kind} on:change={(event) => setAdvancedFormulaKind((event.currentTarget as HTMLSelectElement).value as "numeric" | "flag") }>
                                        <option value="numeric">Numeric</option>
                                        <option value="flag">Flag</option>
                                    </select>
                                </label>
                                {#if draft.formula.kind === "numeric"}
                                    <label class="ux-custom-field">
                                        <span class="small fw-semibold">Display</span>
                                        <select class="form-select form-select-sm" value={rowFormulaDisplayValue} on:change={(event) => updateRowFormulaDisplay((event.currentTarget as HTMLSelectElement).value as ConflictCustomNumericDisplayKind)}>
                                            <option value="number">Number</option>
                                            <option value="percent">Percent</option>
                                            <option value="money">Money</option>
                                        </select>
                                    </label>
                                {/if}
                            {:else}
                                <label class="ux-custom-field">
                                    <span class="small fw-semibold">Reducer</span>
                                    <select class="form-select form-select-sm" value={draft.reducer} on:change={(event) => setAdvancedReducer((event.currentTarget as HTMLSelectElement).value as "sum" | "avg" | "min" | "max" | "count" | "share") }>
                                        <option value="sum">sum</option>
                                        <option value="avg">avg</option>
                                        <option value="min">min</option>
                                        <option value="max">max</option>
                                        <option value="count">count</option>
                                        <option value="share">share</option>
                                    </select>
                                </label>
                                {#if draft.reducer === "sum" || draft.reducer === "avg" || draft.reducer === "min" || draft.reducer === "max"}
                                    <label class="ux-custom-field">
                                        <span class="small fw-semibold">Display</span>
                                        <select class="form-select form-select-sm" value={memberDisplayValue} on:change={(event) => updateMemberDisplay((event.currentTarget as HTMLSelectElement).value as ConflictCustomNumericDisplayKind)}>
                                            <option value="number">Number</option>
                                            <option value="percent">Percent</option>
                                            <option value="money">Money</option>
                                        </select>
                                    </label>
                                {/if}
                            {/if}
                        </div>

                        {#if draft.kind === "row-formula"}
                            {#if draft.formula.kind === "numeric"}
                                <ConflictCustomExprEditor
                                    mode="numeric"
                                    expr={rowFormulaNumericExpr}
                                    {metricOptions}
                                    label="Formula expression"
                                    on:change={(event) =>
                                        updateRowFormulaNumericExpr(event.detail.expr as ConflictCustomNumericExpr)}
                                />
                            {:else}
                                <ConflictCustomExprEditor
                                    mode="boolean"
                                    expr={rowFormulaFlagExpr}
                                    {metricOptions}
                                    label="Flag expression"
                                    on:change={(event) =>
                                        updateRowFormulaFlagExpr(event.detail.expr as ConflictCustomBooleanExpr)}
                                />
                            {/if}
                        {:else if draft.reducer === "sum" || draft.reducer === "avg" || draft.reducer === "min" || draft.reducer === "max"}
                            <ConflictCustomExprEditor
                                mode="numeric"
                                expr={memberNumericExpr}
                                {metricOptions}
                                label="Member expression"
                                on:change={(event) =>
                                    updateMemberNumericExpr(event.detail.expr as ConflictCustomNumericExpr)}
                            />
                        {:else}
                            <ConflictCustomExprEditor
                                mode="boolean"
                                expr={memberBooleanExpr}
                                {metricOptions}
                                label="Member match"
                                on:change={(event) =>
                                    updateMemberBooleanExpr(event.detail.expr as ConflictCustomBooleanExpr)}
                            />
                        {/if}
                    </div>
                </div>
            {/if}

            {#if errorMessage || validationMessage}
                <div class="alert alert-danger py-2 px-3 mb-0">{errorMessage || validationMessage}</div>
            {/if}

            <div class="ux-custom-modal-actions">
                <button class="btn ux-btn btn-sm" type="button" on:click={closeModal}>Close</button>
                <button class="btn ux-btn ux-btn-danger btn-sm fw-bold" type="button" disabled={!sanitizedDraft} on:click={handleSave}>
                    Save column
                </button>
            </div>
        </section>

        <aside class="ux-custom-modal-pane ux-custom-modal-pane-list">
            <div class="ux-modal-section-title">Saved columns</div>
            {#if existingColumns.length === 0}
                <div class="ux-custom-empty small text-muted">No columns yet. Save one to reuse it in this view.</div>
            {:else}
                <div class="ux-custom-list">
                    {#each existingColumns as column (column.id)}
                        <article class="ux-custom-list__item" class:is-active={editingId === column.id}>
                            <div class="ux-custom-list__content">
                                <div class="ux-custom-list__title">{column.label}</div>
                                <div class="ux-custom-list__preview">{detailPreview(column)}</div>
                            </div>
                            <div class="ux-custom-list__actions">
                                <button class="btn ux-btn btn-sm" type="button" on:click={() => startEdit(column)}>Edit</button>
                                <button class="btn ux-btn-danger btn-sm" type="button" on:click={() => handleDelete(column.id)}>Delete</button>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </aside>
    </div>
</ModalShell>

<style>
    .ux-custom-modal-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.95fr);
        gap: 0.75rem;
        min-height: min(42rem, calc(100vh - 10rem));
    }

    .ux-custom-modal-pane {
        display: grid;
        align-content: start;
        gap: 0.65rem;
        min-height: 0;
    }

    .ux-custom-modal-pane-editor {
        overflow: auto;
    }

    .ux-custom-modal-pane-list {
        border-left: 1px solid color-mix(in srgb, var(--ux-border) 92%, transparent);
        padding-left: 0.75rem;
        overflow: auto;
    }

    .ux-custom-pane-heading {
        display: grid;
        gap: 0.15rem;
    }

    .ux-custom-pane-meta {
        font-size: 0.75rem;
        color: var(--ux-text-muted);
        line-height: 1.3;
    }

    .ux-custom-block {
        display: grid;
        gap: 0.55rem;
        padding: 0.6rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 82%, transparent);
    }

    .ux-custom-block__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.45rem;
        flex-wrap: wrap;
    }

    .ux-custom-block__title {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ux-text-muted);
    }

    .ux-custom-meta-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.2fr);
        gap: 0.55rem;
        align-items: start;
    }

    .ux-custom-field {
        display: grid;
        gap: 0.2rem;
        min-width: 0;
    }

    .ux-custom-field--grow {
        flex: 1 1 12rem;
    }

    .ux-custom-field--medium {
        flex: 0 0 8rem;
    }

    .ux-custom-field--operator {
        flex: 0 0 5.25rem;
    }

    .ux-custom-field--toggle {
        flex: 0 0 7rem;
    }

    .ux-custom-field--value {
        flex: 0 0 7.5rem;
    }

    .ux-custom-preview-field {
        gap: 0.25rem;
    }

    .ux-custom-template-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(8.75rem, 1fr));
        gap: 0.4rem;
    }

    .ux-custom-template-card {
        display: grid;
        gap: 0.18rem;
        padding: 0.52rem 0.58rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface) 88%, var(--ux-surface-alt));
        color: var(--ux-text);
        text-align: left;
    }

    .ux-custom-template-card.is-active {
        border-color: color-mix(in srgb, var(--ux-danger) 72%, white);
        background: color-mix(in srgb, var(--ux-danger) 8%, var(--ux-surface-alt));
    }

    .ux-custom-template-card__title {
        font-weight: 700;
        font-size: 0.8rem;
    }

    .ux-custom-template-card__body {
        font-size: 0.7rem;
        color: var(--ux-text-muted);
        line-height: 1.2;
    }

    .ux-custom-preview {
        display: grid;
        gap: 0.18rem;
        padding: 0.55rem 0.6rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 72%, transparent);
    }

    .ux-custom-preview__text {
        font-size: 0.8rem;
        line-height: 1.3;
    }

    .ux-custom-quick-grid,
    .ux-custom-advanced,
    .ux-custom-advanced__controls {
        display: grid;
        gap: 0.55rem;
    }

    .ux-custom-quick-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem 0.5rem;
        align-items: end;
    }

    .ux-custom-advanced__controls {
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    }

    .ux-custom-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.45rem;
        padding-top: 0.2rem;
    }

    .ux-custom-list {
        display: grid;
        gap: 0.45rem;
    }

    .ux-custom-list__item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.35rem 0.55rem;
        align-items: center;
        padding: 0.48rem 0.54rem;
        border: 1px solid color-mix(in srgb, var(--ux-border) 90%, transparent);
        border-radius: var(--ux-radius-sm);
        background: color-mix(in srgb, var(--ux-surface-alt) 82%, transparent);
    }

    .ux-custom-list__item.is-active {
        border-color: color-mix(in srgb, var(--ux-danger) 68%, white);
        background: color-mix(in srgb, var(--ux-danger) 6%, var(--ux-surface-alt));
    }

    .ux-custom-list__content {
        display: grid;
        gap: 0.2rem;
        min-width: 0;
    }

    .ux-custom-list__title {
        font-weight: 700;
        font-size: 0.82rem;
    }

    .ux-custom-list__preview {
        font-size: 0.74rem;
        color: var(--ux-text-muted);
        line-height: 1.25;
    }

    .ux-custom-list__actions {
        display: flex;
        gap: 0.35rem;
        justify-content: flex-end;
    }

    .ux-custom-empty {
        padding: 0.65rem;
        border: 1px dashed color-mix(in srgb, var(--ux-border) 88%, transparent);
        border-radius: var(--ux-radius-sm);
    }

    @media (max-width: 960px) {
        .ux-custom-modal-grid {
            grid-template-columns: 1fr;
        }

        .ux-custom-modal-pane-list {
            border-left: 0;
            border-top: 1px solid color-mix(in srgb, var(--ux-border) 92%, transparent);
            padding-left: 0;
            padding-top: 0.35rem;
        }

        .ux-custom-meta-grid {
            grid-template-columns: 1fr;
        }

        .ux-custom-quick-grid {
            display: grid;
            grid-template-columns: 1fr;
        }

        .ux-custom-list__item {
            grid-template-columns: 1fr;
        }

        .ux-custom-list__actions {
            justify-content: flex-start;
        }
    }
</style>