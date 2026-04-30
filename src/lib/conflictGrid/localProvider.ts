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
import { createConflictGridDataset } from "./dataset";
import {
    getConflictGridViewHash,
    normalizeConflictGridViewConfig,
    type ConflictGridViewConfig,
} from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";

type ConflictGridDataset = ReturnType<typeof createConflictGridDataset>;

export function createConflictGridLocalProvider(options: {
    dataset: ConflictGridDataset;
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

        const nextBootstrap = Promise.resolve(
            options.dataset.bootstrap(options.layout, viewConfig),
        ).then((payload) => ({
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
            return options.dataset.query(options.layout, state, getViewConfig());
        },
        async querySummary(state) {
            await bootstrap();
            return options.dataset.querySummary(
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
            return options.dataset.getRowDetails(
                options.layout,
                rowId,
                state,
                getViewConfig(),
            );
        },
        async getFilteredRowIds(state: GridQueryState): Promise<GridRowId[]> {
            await bootstrap();
            return options.dataset.getFilteredRowIds(
                options.layout,
                state,
                getViewConfig(),
            );
        },
        async exportRows(state: GridQueryState): Promise<GridExportResult> {
            await bootstrap();
            return options.dataset.exportRows(
                options.layout,
                state,
                getViewConfig(),
            );
        },
    };
}
