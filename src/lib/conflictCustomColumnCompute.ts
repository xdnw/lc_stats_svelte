import type {
    ConflictCustomBooleanExpr,
    ConflictCustomColumnConfig,
    ConflictCustomCompareOp,
    ConflictCustomNumericExpr,
} from "./conflictCustomColumns";
import type { ConflictGridLayoutValue } from "./conflictGrid/rowIds";
import { ConflictGridLayout } from "./conflictGrid/rowIds";

export type ConflictCustomColumnMembership = {
    nationRowIndexesByParent: number[][];
    totalNationCountByParent: Float64Array;
};

function normalizeNumericValue(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Object.is(value, -0) ? 0 : value;
}

function createFilledVector(length: number, value: number): Float64Array {
    const vector = new Float64Array(length);
    vector.fill(normalizeNumericValue(value));
    return vector;
}

function keyFor(layout: ConflictGridLayoutValue, value: unknown): string {
    return `${layout}::${JSON.stringify(value)}`;
}

function compareValues(
    left: number,
    right: number,
    op: ConflictCustomCompareOp,
): boolean {
    switch (op) {
        case "gt":
            return left > right;
        case "gte":
            return left >= right;
        case "eq":
            return left === right;
        case "neq":
            return left !== right;
        case "lte":
            return left <= right;
        case "lt":
            return left < right;
    }
    return false;
}

export function createConflictCustomColumnComputer(options: {
    layout: ConflictGridLayoutValue;
    membership?: ConflictCustomColumnMembership | null;
    getMetricVector: (
        layout: ConflictGridLayoutValue,
        metricKey: string,
    ) => Float64Array;
    getRowCount: (layout: ConflictGridLayoutValue) => number;
}) {
    const numericExprVectorCache = new Map<string, Float64Array>();
    const booleanExprVectorCache = new Map<string, Uint8Array>();
    const customColumnVectorCache = new Map<string, Float64Array>();

    function getNumericExprVector(
        layout: ConflictGridLayoutValue,
        expr: ConflictCustomNumericExpr,
    ): Float64Array {
        const cacheKey = keyFor(layout, expr);
        const cached = numericExprVectorCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const rowCount = options.getRowCount(layout);
        let next: Float64Array;

        if (expr.kind === "metric") {
            next = options.getMetricVector(layout, expr.metric);
        } else if (expr.kind === "value") {
            next = createFilledVector(rowCount, expr.value);
        } else if (expr.kind === "binary") {
            const left = getNumericExprVector(layout, expr.left);
            const right = getNumericExprVector(layout, expr.right);
            next = new Float64Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                const leftValue = left[index] ?? 0;
                const rightValue = right[index] ?? 0;
                let value = 0;
                switch (expr.op) {
                    case "add":
                        value = leftValue + rightValue;
                        break;
                    case "sub":
                        value = leftValue - rightValue;
                        break;
                    case "mul":
                        value = leftValue * rightValue;
                        break;
                    case "div":
                        value = leftValue / rightValue;
                        break;
                }
                next[index] = normalizeNumericValue(value);
            }
        } else if (expr.kind === "func") {
            const args = expr.args.map((arg) => getNumericExprVector(layout, arg));
            next = new Float64Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                const values = args.map((vector) => vector[index] ?? 0);
                let value = 0;
                switch (expr.name) {
                    case "abs":
                        value = Math.abs(values[0] ?? 0);
                        break;
                    case "min":
                        value = Math.min(values[0] ?? 0, values[1] ?? 0);
                        break;
                    case "max":
                        value = Math.max(values[0] ?? 0, values[1] ?? 0);
                        break;
                }
                next[index] = normalizeNumericValue(value);
            }
        } else {
            const when = getBooleanExprVector(layout, expr.when);
            const thenVector = getNumericExprVector(layout, expr.then);
            const elseVector = getNumericExprVector(layout, expr.else);
            next = new Float64Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                next[index] = normalizeNumericValue(
                    when[index] ? thenVector[index] ?? 0 : elseVector[index] ?? 0,
                );
            }
        }

        numericExprVectorCache.set(cacheKey, next);
        return next;
    }

    function getBooleanExprVector(
        layout: ConflictGridLayoutValue,
        expr: ConflictCustomBooleanExpr,
    ): Uint8Array {
        const cacheKey = keyFor(layout, expr);
        const cached = booleanExprVectorCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const rowCount = options.getRowCount(layout);
        let next: Uint8Array;

        if (expr.kind === "compare") {
            const left = getNumericExprVector(layout, expr.left);
            const right = getNumericExprVector(layout, expr.right);
            next = new Uint8Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                next[index] = compareValues(left[index] ?? 0, right[index] ?? 0, expr.op)
                    ? 1
                    : 0;
            }
        } else if (expr.kind === "logic") {
            const left = getBooleanExprVector(layout, expr.left);
            const right = getBooleanExprVector(layout, expr.right);
            next = new Uint8Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                next[index] = expr.op === "and"
                    ? left[index] && right[index]
                        ? 1
                        : 0
                    : left[index] || right[index]
                      ? 1
                      : 0;
            }
        } else {
            const value = getBooleanExprVector(layout, expr.value);
            next = new Uint8Array(rowCount);
            for (let index = 0; index < rowCount; index += 1) {
                next[index] = value[index] ? 0 : 1;
            }
        }

        booleanExprVectorCache.set(cacheKey, next);
        return next;
    }

    function buildBooleanAsNumericVector(
        layout: ConflictGridLayoutValue,
        expr: ConflictCustomBooleanExpr,
    ): Float64Array {
        const values = getBooleanExprVector(layout, expr);
        const vector = new Float64Array(values.length);
        for (let index = 0; index < values.length; index += 1) {
            vector[index] = values[index] ? 1 : 0;
        }
        return vector;
    }

    function reduceNationNumericVector(
        nationVector: Float64Array,
        reducer: "sum" | "avg" | "min" | "max",
    ): Float64Array {
        const rowCount = options.getRowCount(options.layout);
        const vector = new Float64Array(rowCount);
        const membership = options.membership;
        if (!membership) {
            return vector;
        }

        membership.nationRowIndexesByParent.forEach((nationRowIndexes, parentIndex) => {
            if (nationRowIndexes.length === 0) {
                vector[parentIndex] = 0;
                return;
            }
            let total = 0;
            let min = Number.POSITIVE_INFINITY;
            let max = Number.NEGATIVE_INFINITY;
            nationRowIndexes.forEach((nationRowIndex) => {
                const value = normalizeNumericValue(nationVector[nationRowIndex] ?? 0);
                total += value;
                min = Math.min(min, value);
                max = Math.max(max, value);
            });
            switch (reducer) {
                case "sum":
                    vector[parentIndex] = total;
                    break;
                case "avg":
                    vector[parentIndex] = total / nationRowIndexes.length;
                    break;
                case "min":
                    vector[parentIndex] = Number.isFinite(min) ? min : 0;
                    break;
                case "max":
                    vector[parentIndex] = Number.isFinite(max) ? max : 0;
                    break;
            }
        });

        return vector;
    }

    function reduceNationBooleanVector(
        nationVector: Uint8Array,
        reducer: "count" | "share",
    ): Float64Array {
        const rowCount = options.getRowCount(options.layout);
        const vector = new Float64Array(rowCount);
        const membership = options.membership;
        if (!membership) {
            return vector;
        }

        membership.nationRowIndexesByParent.forEach((nationRowIndexes, parentIndex) => {
            let matched = 0;
            nationRowIndexes.forEach((nationRowIndex) => {
                matched += nationVector[nationRowIndex] ? 1 : 0;
            });
            if (reducer === "count") {
                vector[parentIndex] = matched;
                return;
            }
            const total = membership.totalNationCountByParent[parentIndex] ?? 0;
            vector[parentIndex] = total > 0 ? (matched / total) * 100 : 0;
        });

        return vector;
    }

    function getColumnVector(config: ConflictCustomColumnConfig): Float64Array {
        const cached = customColumnVectorCache.get(config.id);
        if (cached) {
            return cached;
        }

        let next: Float64Array;

        if (config.kind === "row-formula") {
            next = config.formula.kind === "numeric"
                ? getNumericExprVector(options.layout, config.formula.expr)
                : buildBooleanAsNumericVector(options.layout, config.formula.expr);
        } else if (
            config.reducer === "sum" ||
            config.reducer === "avg" ||
            config.reducer === "min" ||
            config.reducer === "max"
        ) {
            next = reduceNationNumericVector(
                getNumericExprVector(ConflictGridLayout.NATION, config.expr),
                config.reducer,
            );
        } else {
            next = reduceNationBooleanVector(
                getBooleanExprVector(
                    ConflictGridLayout.NATION,
                    config.expr as ConflictCustomBooleanExpr,
                ),
                config.reducer,
            );
        }

        customColumnVectorCache.set(config.id, next);
        return next;
    }

    return {
        getColumnVector,
        getNumericExprVector,
        getBooleanExprVector,
    };
}