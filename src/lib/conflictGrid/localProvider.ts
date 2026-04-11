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
import type { ConflictGridLayoutValue } from "./rowIds";

type ConflictGridDataset = ReturnType<typeof createConflictGridDataset>;

export function createConflictGridLocalProvider(options: {
    dataset: ConflictGridDataset;
    layout: ConflictGridLayoutValue;
    defaultSort?: GridSort | null;
    defaultVisibleColumnKeys?: string[];
}): GridDataProvider {
    let bootstrapPromise: Promise<GridBootstrapResult> | null = null;

    function bootstrap(): Promise<GridBootstrapResult> {
        if (!bootstrapPromise) {
            bootstrapPromise = Promise.resolve(options.dataset.bootstrap(options.layout)).then(
                (payload) => ({
                    columns: payload.grid.columns,
                    defaultSort: options.defaultSort ?? null,
                    defaultVisibleColumnKeys:
                        options.defaultVisibleColumnKeys?.length
                            ? [...options.defaultVisibleColumnKeys]
                            : payload.grid.columns.map((column) => column.key),
                    rowCount: payload.grid.rowCount,
                }),
            );
        }
        return bootstrapPromise;
    }

    return {
        bootstrap,
        async query(state: GridQueryState): Promise<GridPageResult> {
            await bootstrap();
            return options.dataset.query(options.layout, state);
        },
        async querySummary(state) {
            await bootstrap();
            return options.dataset.querySummary(options.layout, state);
        },
        async getRowDetails(
            rowId: GridRowId,
            state: GridQueryState,
        ): Promise<GridPageRow | null> {
            await bootstrap();
            return options.dataset.getRowDetails(options.layout, rowId, state);
        },
        async getFilteredRowIds(state: GridQueryState): Promise<GridRowId[]> {
            await bootstrap();
            return options.dataset.getFilteredRowIds(options.layout, state);
        },
        async exportRows(state: GridQueryState): Promise<GridExportResult> {
            await bootstrap();
            return options.dataset.exportRows(options.layout, state);
        },
    };
}
