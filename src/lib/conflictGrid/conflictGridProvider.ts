import type {
    GridBootstrapResult,
    GridDataProvider,
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSort,
} from "../grid/types";
import { incrementPerfCounter, startPerfSpan } from "../perf";
import type { ConflictGridProviderClient } from "./providerClient";
import {
    getConflictGridViewHash,
    normalizeConflictGridViewConfig,
    type ConflictGridViewConfig,
} from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";

function normalizeViewportValue(value: number): number {
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function normalizeViewport(
    viewport: GridQueryState["viewport"],
): NonNullable<GridQueryState["viewport"]> | null {
    if (!viewport) return null;
    const start = normalizeViewportValue(viewport.start);
    const end = Math.max(start, normalizeViewportValue(viewport.end));
    if (end <= start) return null;
    return { start, end };
}

function cloneQueryState(
    state: GridQueryState,
    viewport?: GridQueryState["viewport"],
): GridQueryState {
    return {
        ...state,
        filters: { ...state.filters },
        visibleColumnKeys: [...state.visibleColumnKeys],
        columnOrderKeys: [...state.columnOrderKeys],
        expandedRowIds: [...state.expandedRowIds],
        selectedRowIds: [...state.selectedRowIds],
        viewport: viewport ? { ...viewport } : undefined,
    };
}

function buildQueryPerfTags(
    layout: ConflictGridLayoutValue,
    state: GridQueryState,
    viewport: NonNullable<GridQueryState["viewport"]> | null,
): Record<string, string | number | boolean | null> {
    return {
        layout,
        pageSize: state.pageSize,
        sortKey: state.sort?.key ?? null,
        sortDir: state.sort?.dir ?? null,
        filterCount: Object.values(state.filters).filter((value) => value.trim().length > 0)
            .length,
        visibleColumnCount: state.visibleColumnKeys.length,
        selectedRowCount: state.selectedRowIds.length,
        viewportStart: viewport?.start ?? null,
        viewportEnd: viewport?.end ?? null,
    };
}

export function createConflictGridProvider(options: {
    client: ConflictGridProviderClient;
    layout: ConflictGridLayoutValue;
    defaultSort?: GridSort | null;
    defaultVisibleColumnKeys?: string[];
    getViewConfig?: (() => ConflictGridViewConfig | null | undefined) | undefined;
}): GridDataProvider {
    const bootstrapByView = new Map<string, Promise<GridBootstrapResult>>();

    function getViewConfig(): ConflictGridViewConfig {
        return normalizeConflictGridViewConfig(options.getViewConfig?.());
    }

    function bootstrap(): Promise<GridBootstrapResult> {
        const viewConfig = getViewConfig();
        const viewHash = getConflictGridViewHash(viewConfig);
        const cached = bootstrapByView.get(viewHash);
        if (cached) {
            return cached;
        }

        const nextBootstrap = options.client.bootstrap(options.layout, viewConfig).then((payload) => ({
                columns: payload.grid.columns,
                defaultSort: options.defaultSort ?? null,
                defaultVisibleColumnKeys:
                    options.defaultVisibleColumnKeys?.length
                        ? [...options.defaultVisibleColumnKeys]
                        : payload.grid.columns.map((column) => column.key),
                rowCount: payload.grid.rowCount,
            }));
        bootstrapByView.set(viewHash, nextBootstrap);
        return nextBootstrap;
    }

    return {
        bootstrap,
        async query(state: GridQueryState): Promise<GridPageResult> {
            await bootstrap();
            const viewConfig = getViewConfig();
            const viewport =
                state.pageSize === "all"
                    ? normalizeViewport(state.viewport)
                    : null;
            const queryState = viewport
                ? cloneQueryState(state, viewport)
                : cloneQueryState(state);
            const perfTags = buildQueryPerfTags(options.layout, state, viewport);
            const finishPerfSpan = startPerfSpan(
                "conflict.grid.query.roundtrip",
                perfTags,
            );

            try {
                const result = await options.client.query(
                    options.layout,
                    queryState,
                    viewConfig,
                );
                incrementPerfCounter("conflict.grid.query.success", 1, {
                    ...perfTags,
                    filteredRowCount: result.filteredRowCount,
                    returnedRowCount: result.rows.length,
                });
                return result;
            } catch (error) {
                incrementPerfCounter("conflict.grid.query.failed", 1, perfTags);
                throw error;
            } finally {
                finishPerfSpan();
            }
        },
        async querySummary(state) {
            await bootstrap();
            return options.client.querySummary(
                options.layout,
                state,
                getViewConfig(),
            );
        },
        async getRowDetails(
            rowId: GridRowId,
            state: GridQueryState,
        ): Promise<GridPageRow | null> {
            await bootstrap();
            return options.client.getRowDetails(
                options.layout,
                rowId,
                state,
                getViewConfig(),
            );
        },
        async getFilteredRowIds(state: GridQueryState): Promise<GridRowId[]> {
            await bootstrap();
            return options.client.getFilteredRowIds(
                options.layout,
                state,
                getViewConfig(),
            );
        },
        async exportRows(state: GridQueryState): Promise<GridExportResult> {
            await bootstrap();
            return options.client.exportRows(
                options.layout,
                state,
                getViewConfig(),
            );
        },
    };
}
