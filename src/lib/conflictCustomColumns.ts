type ConflictLayoutValue = 0 | 1 | 2;

export type ConflictCustomDisplayKind = "number" | "percent" | "money" | "flag";
export type ConflictCustomValueUnit = "number" | "money";
export type ConflictCustomBinaryOp = "add" | "sub" | "mul" | "div";
export type ConflictCustomFunctionName = "abs" | "min" | "max";
export type ConflictCustomCompareOp = "gt" | "gte" | "eq" | "neq" | "lte" | "lt";
export type ConflictCustomLogicOp = "and" | "or";
export type ConflictCustomNumericDisplayKind = "number" | "percent" | "money";
export type ConflictCustomNumericReducer = "sum" | "avg" | "min" | "max";
export type ConflictCustomBooleanReducer = "count" | "share";

export type ConflictCustomNumericExpr =
    | { kind: "metric"; metric: string }
    | { kind: "value"; value: number }
    | {
          kind: "binary";
          op: ConflictCustomBinaryOp;
          left: ConflictCustomNumericExpr;
          right: ConflictCustomNumericExpr;
      }
    | {
          kind: "func";
          name: ConflictCustomFunctionName;
          args: ConflictCustomNumericExpr[];
      }
    | {
          kind: "if";
          when: ConflictCustomBooleanExpr;
          then: ConflictCustomNumericExpr;
          else: ConflictCustomNumericExpr;
      };

export type ConflictCustomBooleanExpr =
    | {
          kind: "compare";
          op: ConflictCustomCompareOp;
          left: ConflictCustomNumericExpr;
          right: ConflictCustomNumericExpr;
      }
    | {
          kind: "logic";
          op: ConflictCustomLogicOp;
          left: ConflictCustomBooleanExpr;
          right: ConflictCustomBooleanExpr;
      }
    | { kind: "not"; value: ConflictCustomBooleanExpr };

export type ConflictCustomColumnConfig =
    | {
          id: string;
          kind: "row-formula";
          label: string;
          formula: {
              kind: "numeric";
              display: "number" | "percent" | "money";
              expr: ConflictCustomNumericExpr;
          };
      }
    | {
          id: string;
          kind: "row-formula";
          label: string;
          formula: {
              kind: "flag";
              display: "flag";
              expr: ConflictCustomBooleanExpr;
          };
      }
    | {
          id: string;
          kind: "member-rollup";
          label: string;
          reducer: "sum" | "avg" | "min" | "max";
          display: "number" | "percent" | "money";
          expr: ConflictCustomNumericExpr;
      }
    | {
          id: string;
          kind: "member-rollup";
          label: string;
          reducer: "count";
          display: "number";
          expr: ConflictCustomBooleanExpr;
      }
    | {
          id: string;
          kind: "member-rollup";
          label: string;
          reducer: "share";
          display: "percent";
          expr: ConflictCustomBooleanExpr;
      };

export type ConflictCustomColumnSemanticConfig =
    | {
          kind: "row-formula";
          formula: {
              kind: "numeric";
              display: ConflictCustomNumericDisplayKind;
              expr: ConflictCustomNumericExpr;
          };
      }
    | {
          kind: "row-formula";
          formula: {
              kind: "flag";
              display: "flag";
              expr: ConflictCustomBooleanExpr;
          };
      }
    | {
          kind: "member-rollup";
          reducer: ConflictCustomNumericReducer;
          display: ConflictCustomNumericDisplayKind;
          expr: ConflictCustomNumericExpr;
      }
    | {
          kind: "member-rollup";
          reducer: "count";
          display: "number";
          expr: ConflictCustomBooleanExpr;
      }
    | {
          kind: "member-rollup";
          reducer: "share";
          display: "percent";
          expr: ConflictCustomBooleanExpr;
      };

export type ConflictCustomColumnDraft = ConflictCustomColumnConfig;

export type ConflictCustomMetricOption = {
    value: string;
    label: string;
    unit: ConflictCustomValueUnit;
};

type ConflictCustomNumericSanitizeResult = {
    expr: ConflictCustomNumericExpr;
    nodeCount: number;
    depth: number;
    unit: ConflictCustomValueUnit;
};

type ConflictCustomBooleanSanitizeResult = {
    expr: ConflictCustomBooleanExpr;
    nodeCount: number;
    depth: number;
};

type SerializedConflictCustomNumericExpr =
    | ["m", metric: string]
    | ["v", value: number]
    | [
          "b",
          op: "add" | "sub" | "mul" | "div",
          left: SerializedConflictCustomNumericExpr,
          right: SerializedConflictCustomNumericExpr,
      ]
    | [
          "f",
          name: "abs" | "min" | "max",
          args: SerializedConflictCustomNumericExpr[],
      ]
    | [
          "i",
          when: SerializedConflictCustomBooleanExpr,
          then: SerializedConflictCustomNumericExpr,
          elseBranch: SerializedConflictCustomNumericExpr,
      ];

type SerializedConflictCustomBooleanExpr =
    | [
          "c",
          op: "gt" | "gte" | "eq" | "neq" | "lte" | "lt",
          left: SerializedConflictCustomNumericExpr,
          right: SerializedConflictCustomNumericExpr,
      ]
    | [
          "l",
          op: "and" | "or",
          left: SerializedConflictCustomBooleanExpr,
          right: SerializedConflictCustomBooleanExpr,
      ]
    | ["n", value: SerializedConflictCustomBooleanExpr];

type SerializedConflictCustomColumn =
    | [
          label: string,
          kind: "rfn",
          display: "number" | "percent" | "money",
          expr: SerializedConflictCustomNumericExpr,
      ]
    | [
          label: string,
          kind: "rff",
          expr: SerializedConflictCustomBooleanExpr,
      ]
    | [
          label: string,
          kind: "mrn",
          reducer: "sum" | "avg" | "min" | "max",
          display: "number" | "percent" | "money",
          expr: SerializedConflictCustomNumericExpr,
      ]
    | [
          label: string,
          kind: "mrb",
          reducer: "count" | "share",
          expr: SerializedConflictCustomBooleanExpr,
      ];

type ConflictCustomRowFormulaConfig = Extract<
    ConflictCustomColumnSemanticConfig,
    { kind: "row-formula" }
>;
type ConflictCustomMemberRollupConfig = Extract<
    ConflictCustomColumnSemanticConfig,
    { kind: "member-rollup" }
>;
type ConflictCustomBooleanMemberRollupConfig = Extract<
    ConflictCustomMemberRollupConfig,
    { reducer: "count" | "share" }
>;
type ConflictCustomNumericMemberRollupConfig = Extract<
    ConflictCustomMemberRollupConfig,
    { reducer: ConflictCustomNumericReducer }
>;

const CUSTOM_COLUMN_ID_PREFIX = "cc-";
const CUSTOM_COLUMN_ID_RE = /^cc-[0-9a-z]+$/;
const CONFLICT_METRIC_KEY_RE = /^(loss|dealt|net|def|off|both):.+$/;
const MAX_CUSTOM_COLUMNS = 20;
const MAX_EXPR_NODE_COUNT = 15;
const MAX_EXPR_DEPTH = 5;
const VALID_BINARY_OPS = new Set<ConflictCustomBinaryOp>(["add", "sub", "mul", "div"]);
const VALID_FUNC_NAMES = new Set<ConflictCustomFunctionName>(["abs", "min", "max"]);
const VALID_COMPARE_OPS = new Set<ConflictCustomCompareOp>([
    "gt",
    "gte",
    "eq",
    "neq",
    "lte",
    "lt",
]);
const VALID_LOGIC_OPS = new Set<ConflictCustomLogicOp>(["and", "or"]);
const VALID_NUMERIC_DISPLAY_KINDS = new Set<ConflictCustomNumericDisplayKind>([
    "number",
    "percent",
    "money",
]);
const VALID_NUMERIC_REDUCERS = new Set<ConflictCustomNumericReducer>([
    "sum",
    "avg",
    "min",
    "max",
]);

function trimString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumericValue(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Object.is(value, -0) ? 0 : value;
}

function formatNumericValue(value: number): string {
    const normalized = normalizeNumericValue(value);
    return Number.isInteger(normalized) ? String(normalized) : String(normalized);
}

function normalizeMetricKeys(
    validMetricKeys?: Iterable<string> | null,
): Set<string> | null {
    if (!validMetricKeys) {
        return null;
    }

    const normalized = new Set<string>();
    for (const key of validMetricKeys) {
        const trimmed = trimString(key);
        if (trimmed) {
            normalized.add(trimmed);
        }
    }

    return normalized.size > 0 ? normalized : null;
}

function isValidMetricKey(
    metric: string,
    validMetricKeys?: Iterable<string> | null,
): boolean {
    const normalized = trimString(metric);
    if (!normalized) {
        return false;
    }

    const allowed = normalizeMetricKeys(validMetricKeys);
    if (allowed) {
        return allowed.has(normalized);
    }

    return CONFLICT_METRIC_KEY_RE.test(normalized);
}

function hashConflictCustomKey(input: string): string {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function compareLabel(op: ConflictCustomCompareOp): string {
    switch (op) {
        case "gt":
            return ">";
        case "gte":
            return ">=";
        case "eq":
            return "=";
        case "neq":
            return "!=";
        case "lte":
            return "<=";
        case "lt":
            return "<";
    }
    return op;
}

function binaryOpLabel(op: ConflictCustomBinaryOp): string {
    switch (op) {
        case "add":
            return "+";
        case "sub":
            return "-";
        case "mul":
            return "*";
        case "div":
            return "/";
    }
    return op;
}

export function isConflictCustomMetricKey(value: string): boolean {
    return CONFLICT_METRIC_KEY_RE.test(value.trim());
}

export function getConflictMetricValueUnit(metric: string): ConflictCustomValueUnit {
    return metric.includes("~$") || metric.includes("damage") ||
            (metric.includes("infra") && !metric.includes("attacks"))
        ? "money"
        : "number";
}

export function isConflictCustomColumnId(value: string): boolean {
    return CUSTOM_COLUMN_ID_RE.test(value.trim());
}

function sanitizeNumericExpr(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomNumericSanitizeResult | null {
    if (!isRecord(input)) {
        return null;
    }

    const kind = trimString(input.kind);
    if (kind === "metric") {
        const metric = trimString(input.metric);
        if (!isValidMetricKey(metric, validMetricKeys)) {
            return null;
        }
        return {
            expr: { kind: "metric", metric },
            nodeCount: 1,
            depth: 1,
            unit: getConflictMetricValueUnit(metric),
        };
    }

    if (kind === "value") {
        const rawValue = typeof input.value === "number" ? input.value : Number(input.value);
        if (!Number.isFinite(rawValue)) {
            return null;
        }
        return {
            expr: { kind: "value", value: normalizeNumericValue(rawValue) },
            nodeCount: 1,
            depth: 1,
            unit: "number",
        };
    }

    if (kind === "binary") {
        const op = trimString(input.op) as ConflictCustomBinaryOp;
        if (!VALID_BINARY_OPS.has(op)) {
            return null;
        }
        const left = sanitizeNumericExpr(input.left, validMetricKeys);
        const right = sanitizeNumericExpr(input.right, validMetricKeys);
        if (!left || !right) {
            return null;
        }
        const unit =
            op === "add" || op === "sub"
                ? left.unit === "money" && right.unit === "money"
                    ? "money"
                    : "number"
                : "number";
        return {
            expr: {
                kind: "binary",
                op,
                left: left.expr,
                right: right.expr,
            },
            nodeCount: 1 + left.nodeCount + right.nodeCount,
            depth: 1 + Math.max(left.depth, right.depth),
            unit,
        };
    }

    if (kind === "func") {
        const name = trimString(input.name) as ConflictCustomFunctionName;
        if (!VALID_FUNC_NAMES.has(name) || !Array.isArray(input.args)) {
            return null;
        }

        const args = input.args
            .map((value) => sanitizeNumericExpr(value, validMetricKeys));
        if (args.some((value) => value == null)) {
            return null;
        }

        const normalizedArgs = args as ConflictCustomNumericSanitizeResult[];
        if ((name === "abs" && normalizedArgs.length !== 1) ||
            ((name === "min" || name === "max") && normalizedArgs.length < 2)) {
            return null;
        }

        const unit =
            name === "abs"
                ? normalizedArgs[0].unit
                : normalizedArgs.every((arg) => arg.unit === "money")
                    ? "money"
                    : "number";
        return {
            expr: {
                kind: "func",
                name,
                args: normalizedArgs.map((arg) => arg.expr),
            },
            nodeCount: 1 + normalizedArgs.reduce((sum, arg) => sum + arg.nodeCount, 0),
            depth: 1 + Math.max(...normalizedArgs.map((arg) => arg.depth)),
            unit,
        };
    }

    if (kind === "if") {
        const when = sanitizeBooleanExpr(input.when, validMetricKeys);
        const thenBranch = sanitizeNumericExpr(input.then, validMetricKeys);
        const elseBranch = sanitizeNumericExpr(input.else, validMetricKeys);
        if (!when || !thenBranch || !elseBranch) {
            return null;
        }

        return {
            expr: {
                kind: "if",
                when: when.expr,
                then: thenBranch.expr,
                else: elseBranch.expr,
            },
            nodeCount:
                1 + when.nodeCount + thenBranch.nodeCount + elseBranch.nodeCount,
            depth: 1 + Math.max(when.depth, thenBranch.depth, elseBranch.depth),
            unit:
                thenBranch.unit === "money" && elseBranch.unit === "money"
                    ? "money"
                    : "number",
        };
    }

    return null;
}

function sanitizeBooleanExpr(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomBooleanSanitizeResult | null {
    if (!isRecord(input)) {
        return null;
    }

    const kind = trimString(input.kind);
    if (kind === "compare") {
        const op = trimString(input.op) as ConflictCustomCompareOp;
        if (!VALID_COMPARE_OPS.has(op)) {
            return null;
        }

        const left = sanitizeNumericExpr(input.left, validMetricKeys);
        const right = sanitizeNumericExpr(input.right, validMetricKeys);
        if (!left || !right) {
            return null;
        }

        return {
            expr: {
                kind: "compare",
                op,
                left: left.expr,
                right: right.expr,
            },
            nodeCount: 1 + left.nodeCount + right.nodeCount,
            depth: 1 + Math.max(left.depth, right.depth),
        };
    }

    if (kind === "logic") {
        const op = trimString(input.op) as ConflictCustomLogicOp;
        if (!VALID_LOGIC_OPS.has(op)) {
            return null;
        }
        const left = sanitizeBooleanExpr(input.left, validMetricKeys);
        const right = sanitizeBooleanExpr(input.right, validMetricKeys);
        if (!left || !right) {
            return null;
        }
        return {
            expr: {
                kind: "logic",
                op,
                left: left.expr,
                right: right.expr,
            },
            nodeCount: 1 + left.nodeCount + right.nodeCount,
            depth: 1 + Math.max(left.depth, right.depth),
        };
    }

    if (kind === "not") {
        const value = sanitizeBooleanExpr(input.value, validMetricKeys);
        if (!value) {
            return null;
        }
        return {
            expr: { kind: "not", value: value.expr },
            nodeCount: 1 + value.nodeCount,
            depth: 1 + value.depth,
        };
    }

    return null;
}

function withinExpressionLimits(nodeCount: number, depth: number): boolean {
    return nodeCount <= MAX_EXPR_NODE_COUNT && depth <= MAX_EXPR_DEPTH;
}

function isRowFormulaConfig(
    config: ConflictCustomColumnSemanticConfig | ConflictCustomColumnConfig,
): config is ConflictCustomRowFormulaConfig | Extract<ConflictCustomColumnConfig, { kind: "row-formula" }> {
    return config.kind === "row-formula";
}

function isNumericMemberRollupConfig(
    config: ConflictCustomColumnSemanticConfig | ConflictCustomColumnConfig,
): config is ConflictCustomNumericMemberRollupConfig | Extract<ConflictCustomColumnConfig, { reducer: ConflictCustomNumericReducer }> {
    return (
        config.kind === "member-rollup" &&
        (config.reducer === "sum" ||
            config.reducer === "avg" ||
            config.reducer === "min" ||
            config.reducer === "max")
    );
}

function isBooleanMemberRollupConfig(
    config: ConflictCustomColumnSemanticConfig | ConflictCustomColumnConfig,
): config is ConflictCustomBooleanMemberRollupConfig | Extract<ConflictCustomColumnConfig, { reducer: "count" | "share" }> {
    return (
        config.kind === "member-rollup" &&
        (config.reducer === "count" || config.reducer === "share")
    );
}

function sanitizeConflictCustomColumnInternal(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): (ConflictCustomColumnSemanticConfig & { label: string }) | null {
    if (!isRecord(input)) {
        return null;
    }

    const kind = trimString(input.kind);
    const rawLabel = trimString(input.label);

    if (kind === "row-formula") {
        const formula = isRecord(input.formula) ? input.formula : null;
        if (!formula) {
            return null;
        }

        const formulaKind = trimString(formula.kind);
        if (formulaKind === "numeric") {
            const display = trimString(formula.display) as "number" | "percent" | "money";
            if (!VALID_NUMERIC_DISPLAY_KINDS.has(display)) {
                return null;
            }
            const expr = sanitizeNumericExpr(formula.expr, validMetricKeys);
            if (!expr || !withinExpressionLimits(expr.nodeCount, expr.depth)) {
                return null;
            }
            if (display === "money" && expr.unit !== "money") {
                return null;
            }
            const semantic: ConflictCustomColumnSemanticConfig = {
                kind: "row-formula" as const,
                formula: {
                    kind: "numeric" as const,
                    display,
                    expr: expr.expr,
                },
            };
            return {
                ...semantic,
                label: rawLabel || buildConflictCustomColumnSentencePreview(semantic),
            };
        }

        if (formulaKind === "flag") {
            if (trimString(formula.display) !== "flag") {
                return null;
            }
            const expr = sanitizeBooleanExpr(formula.expr, validMetricKeys);
            if (!expr || !withinExpressionLimits(expr.nodeCount, expr.depth)) {
                return null;
            }
            const semantic: ConflictCustomColumnSemanticConfig = {
                kind: "row-formula" as const,
                formula: {
                    kind: "flag" as const,
                    display: "flag" as const,
                    expr: expr.expr,
                },
            };
            return {
                ...semantic,
                label: rawLabel || buildConflictCustomColumnSentencePreview(semantic),
            };
        }

        return null;
    }

    if (kind === "member-rollup") {
        const reducer = trimString(input.reducer);
        if (VALID_NUMERIC_REDUCERS.has(reducer as "sum" | "avg" | "min" | "max")) {
            const display = trimString(input.display) as "number" | "percent" | "money";
            if (!VALID_NUMERIC_DISPLAY_KINDS.has(display)) {
                return null;
            }
            const expr = sanitizeNumericExpr(input.expr, validMetricKeys);
            if (!expr || !withinExpressionLimits(expr.nodeCount, expr.depth)) {
                return null;
            }
            if (display === "money" && expr.unit !== "money") {
                return null;
            }
            const semantic: ConflictCustomColumnSemanticConfig = {
                kind: "member-rollup" as const,
                reducer: reducer as ConflictCustomNumericReducer,
                display,
                expr: expr.expr,
            };
            return {
                ...semantic,
                label: rawLabel || buildConflictCustomColumnSentencePreview(semantic),
            };
        }

        if (reducer === "count" || reducer === "share") {
            const expectedDisplay = reducer === "count" ? "number" : "percent";
            if (trimString(input.display) !== expectedDisplay) {
                return null;
            }
            const expr = sanitizeBooleanExpr(input.expr, validMetricKeys);
            if (!expr || !withinExpressionLimits(expr.nodeCount, expr.depth)) {
                return null;
            }
            const semantic: ConflictCustomColumnSemanticConfig = reducer === "count"
                ? {
                    kind: "member-rollup",
                    reducer: "count",
                    display: "number",
                    expr: expr.expr,
                }
                : {
                    kind: "member-rollup",
                    reducer: "share",
                    display: "percent",
                    expr: expr.expr,
                };
            return {
                ...semantic,
                label: rawLabel || buildConflictCustomColumnSentencePreview(semantic),
            };
        }
    }

    return null;
}

function serializeNumericExpr(
    expr: ConflictCustomNumericExpr,
): SerializedConflictCustomNumericExpr {
    if (expr.kind === "metric") {
        return ["m", expr.metric];
    }
    if (expr.kind === "value") {
        return ["v", normalizeNumericValue(expr.value)];
    }
    if (expr.kind === "binary") {
        return [
            "b",
            expr.op,
            serializeNumericExpr(expr.left),
            serializeNumericExpr(expr.right),
        ];
    }
    if (expr.kind === "func") {
        return ["f", expr.name, expr.args.map((arg) => serializeNumericExpr(arg))];
    }
    return [
        "i",
        serializeBooleanExpr(expr.when),
        serializeNumericExpr(expr.then),
        serializeNumericExpr(expr.else),
    ];
}

function serializeBooleanExpr(
    expr: ConflictCustomBooleanExpr,
): SerializedConflictCustomBooleanExpr {
    if (expr.kind === "compare") {
        return [
            "c",
            expr.op,
            serializeNumericExpr(expr.left),
            serializeNumericExpr(expr.right),
        ];
    }
    if (expr.kind === "logic") {
        return [
            "l",
            expr.op,
            serializeBooleanExpr(expr.left),
            serializeBooleanExpr(expr.right),
        ];
    }
    return ["n", serializeBooleanExpr(expr.value)];
}

function parseSerializedNumericExpr(input: unknown): unknown {
    if (!Array.isArray(input) || input.length < 2) {
        return isRecord(input) ? input : null;
    }

    const [kind, first, second, third] = input;
    if (kind === "m") {
        return { kind: "metric", metric: first };
    }
    if (kind === "v") {
        return { kind: "value", value: first };
    }
    if (kind === "b") {
        return {
            kind: "binary",
            op: first,
            left: parseSerializedNumericExpr(second),
            right: parseSerializedNumericExpr(third),
        };
    }
    if (kind === "f") {
        return {
            kind: "func",
            name: first,
            args: Array.isArray(second)
                ? second.map((value) => parseSerializedNumericExpr(value))
                : [],
        };
    }
    if (kind === "i") {
        return {
            kind: "if",
            when: parseSerializedBooleanExpr(first),
            then: parseSerializedNumericExpr(second),
            else: parseSerializedNumericExpr(third),
        };
    }

    return null;
}

function parseSerializedBooleanExpr(input: unknown): unknown {
    if (!Array.isArray(input) || input.length < 2) {
        return isRecord(input) ? input : null;
    }

    const [kind, first, second, third] = input;
    if (kind === "c") {
        return {
            kind: "compare",
            op: first,
            left: parseSerializedNumericExpr(second),
            right: parseSerializedNumericExpr(third),
        };
    }
    if (kind === "l") {
        return {
            kind: "logic",
            op: first,
            left: parseSerializedBooleanExpr(second),
            right: parseSerializedBooleanExpr(third),
        };
    }
    if (kind === "n") {
        return {
            kind: "not",
            value: parseSerializedBooleanExpr(first),
        };
    }

    return null;
}

function serializeConflictCustomColumnIdentity(
    config: ConflictCustomColumnSemanticConfig,
): string {
    if (isRowFormulaConfig(config)) {
        if (config.formula.kind === "numeric") {
            return JSON.stringify([
                "rfn",
                config.formula.display,
                serializeNumericExpr(config.formula.expr),
            ]);
        }
        return JSON.stringify(["rff", serializeBooleanExpr(config.formula.expr)]);
    }

    if (isNumericMemberRollupConfig(config)) {
        return JSON.stringify([
            "mrn",
            config.reducer,
            config.display,
            serializeNumericExpr(config.expr),
        ]);
    }

    return JSON.stringify([
        "mrb",
        config.reducer,
        serializeBooleanExpr(config.expr),
    ]);
}

export function createConflictCustomColumnId(
    config: ConflictCustomColumnSemanticConfig,
): string {
    return `${CUSTOM_COLUMN_ID_PREFIX}${hashConflictCustomKey(serializeConflictCustomColumnIdentity(config))}`;
}

function formatNumericExpr(expr: ConflictCustomNumericExpr): string {
    if (expr.kind === "metric") {
        return expr.metric;
    }
    if (expr.kind === "value") {
        return formatNumericValue(expr.value);
    }
    if (expr.kind === "binary") {
        return `(${formatNumericExpr(expr.left)} ${binaryOpLabel(expr.op)} ${formatNumericExpr(expr.right)})`;
    }
    if (expr.kind === "func") {
        return `${expr.name}(${expr.args.map((arg) => formatNumericExpr(arg)).join(", ")})`;
    }
    return `if(${formatBooleanExpr(expr.when)}, ${formatNumericExpr(expr.then)}, ${formatNumericExpr(expr.else)})`;
}

function formatBooleanExpr(expr: ConflictCustomBooleanExpr): string {
    if (expr.kind === "compare") {
        return `${formatNumericExpr(expr.left)} ${compareLabel(expr.op)} ${formatNumericExpr(expr.right)}`;
    }
    if (expr.kind === "logic") {
        return `(${formatBooleanExpr(expr.left)} ${expr.op} ${formatBooleanExpr(expr.right)})`;
    }
    return `not (${formatBooleanExpr(expr.value)})`;
}

export function buildConflictCustomColumnSentencePreview(
    config: ConflictCustomColumnSemanticConfig,
): string {
    if (isRowFormulaConfig(config)) {
        return config.formula.kind === "numeric"
            ? formatNumericExpr(config.formula.expr)
            : formatBooleanExpr(config.formula.expr);
    }

    if (isNumericMemberRollupConfig(config)) {
        return `${config.reducer} of member ${formatNumericExpr(config.expr)}`;
    }

    return `${config.reducer} of members where ${formatBooleanExpr(config.expr)}`;
}

export function sanitizeConflictCustomColumn(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomColumnConfig | null {
    const sanitized = sanitizeConflictCustomColumnInternal(input, validMetricKeys);
    if (!sanitized) {
        return null;
    }

    let semantic: ConflictCustomColumnSemanticConfig;
    if (isRowFormulaConfig(sanitized)) {
        semantic = sanitized.formula.kind === "numeric"
            ? {
                kind: "row-formula",
                formula: sanitized.formula,
            }
            : {
                kind: "row-formula",
                formula: sanitized.formula,
            };
    } else if (isNumericMemberRollupConfig(sanitized)) {
        semantic = {
            kind: "member-rollup",
            reducer: sanitized.reducer,
            display: sanitized.display,
            expr: sanitized.expr,
        };
    } else if (isBooleanMemberRollupConfig(sanitized)) {
        semantic = sanitized.reducer === "count"
            ? {
                kind: "member-rollup",
                reducer: "count",
                display: "number",
                expr: sanitized.expr,
            }
            : {
                kind: "member-rollup",
                reducer: "share",
                display: "percent",
                expr: sanitized.expr,
            };
    } else {
        return null;
    }
    return {
        id: createConflictCustomColumnId(semantic),
        label: sanitized.label,
        ...semantic,
    } as ConflictCustomColumnConfig;
}

export function normalizeConflictCustomColumnDraft(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomColumnDraft | null {
    return sanitizeConflictCustomColumn(input, validMetricKeys);
}

export function sanitizeConflictCustomColumns(
    input: unknown,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomColumnConfig[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const sanitized: ConflictCustomColumnConfig[] = [];
    const seenIds = new Set<string>();

    for (const item of input) {
        const next = sanitizeConflictCustomColumn(item, validMetricKeys);
        if (!next || seenIds.has(next.id)) {
            continue;
        }
        seenIds.add(next.id);
        sanitized.push(next);
        if (sanitized.length >= MAX_CUSTOM_COLUMNS) {
            break;
        }
    }

    return sanitized;
}

function toSerializedConflictCustomColumn(
    config: ConflictCustomColumnConfig,
): SerializedConflictCustomColumn {
    if (isRowFormulaConfig(config)) {
        if (config.formula.kind === "numeric") {
            return [
                config.label,
                "rfn",
                config.formula.display,
                serializeNumericExpr(config.formula.expr),
            ];
        }
        return [
            config.label,
            "rff",
            serializeBooleanExpr(config.formula.expr),
        ];
    }

    if (isNumericMemberRollupConfig(config)) {
        return [
            config.label,
            "mrn",
            config.reducer,
            config.display,
            serializeNumericExpr(config.expr),
        ];
    }

    if (config.reducer === "count") {
        return [
            config.label,
            "mrb",
            "count",
            serializeBooleanExpr(config.expr),
        ];
    }

    return [
        config.label,
        "mrb",
        "share",
        serializeBooleanExpr(config.expr),
    ];
}

function fromSerializedConflictCustomColumn(input: unknown): unknown {
    if (!Array.isArray(input) || input.length < 3) {
        return isRecord(input) ? input : null;
    }

    const [label, kind, first, second, third] = input;
    if (kind === "rfn") {
        return {
            kind: "row-formula",
            label,
            formula: {
                kind: "numeric",
                display: first,
                expr: parseSerializedNumericExpr(second),
            },
        };
    }
    if (kind === "rff") {
        return {
            kind: "row-formula",
            label,
            formula: {
                kind: "flag",
                display: "flag",
                expr: parseSerializedBooleanExpr(first),
            },
        };
    }
    if (kind === "mrn") {
        return {
            kind: "member-rollup",
            label,
            reducer: first,
            display: second,
            expr: parseSerializedNumericExpr(third),
        };
    }
    if (kind === "mrb") {
        return {
            kind: "member-rollup",
            label,
            reducer: first,
            display: first === "share" ? "percent" : "number",
            expr: parseSerializedBooleanExpr(second),
        };
    }

    return null;
}

export function serializeConflictCustomColumnsForQuery(input: unknown): string | null {
    const sanitized = sanitizeConflictCustomColumns(input);
    if (sanitized.length === 0) {
        return null;
    }
    return JSON.stringify(sanitized.map((config) => toSerializedConflictCustomColumn(config)));
}

export function parseConflictCustomColumnsFromQuery(
    value: string | null | undefined,
    validMetricKeys?: Iterable<string> | null,
): ConflictCustomColumnConfig[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return sanitizeConflictCustomColumns(
            parsed
                .map((item) => fromSerializedConflictCustomColumn(item))
                .filter((item): item is unknown => item != null),
            validMetricKeys,
        );
    } catch {
        return [];
    }
}

export function filterConflictCustomColumnsForLayout(
    layout: ConflictLayoutValue,
    customColumns: ConflictCustomColumnConfig[],
): ConflictCustomColumnConfig[] {
    if (layout !== 2) {
        return [...customColumns];
    }
    return customColumns.filter((column) => column.kind === "row-formula");
}

export function getConflictCustomColumnIdsForLayout(
    layout: ConflictLayoutValue,
    customColumns: ConflictCustomColumnConfig[],
): string[] {
    return filterConflictCustomColumnsForLayout(layout, customColumns).map(
        (column) => column.id,
    );
}

