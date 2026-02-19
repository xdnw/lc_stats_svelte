export {
    setQueryParam,
    getPageStorageKey,
    saveCurrentQueryParams,
    readSavedQueryParams,
    applySavedQueryParamsIfMissing,
    resetQueryParams,
} from './queryState';
export {
    formatDate,
    formatDaysToDate,
    formatDuration,
    formatTurnsToDate,
    commafy,
    formatAllianceName,
    normalizeAllianceIds,
} from './formatting';
export {
    Palette,
    type ColorPalette,
    colorPalettes,
    palettePrimary,
    darkenColor,
    convertToRGB,
    generateColors,
    generateColorsFromPalettes,
} from './colors';
export {
    getConflictDataUrl,
    getConflictGraphDataUrl,
    formatDatasetProvenance,
    ensureScriptsLoaded,
    rafDelay,
} from './runtime';
export {
    UNITS_PER_CITY,
    toggleCoalitionAllianceSelection,
    resolveMetricAccessors,
} from './graphMetrics';
export type { MetricAccessors } from './graphMetrics';
export { decompressBson } from './binary';
export { uuidv4, htmlToElement, arrayEquals } from './misc';
export { addFormatters } from './formatterInit';
export { computeLayoutTableData } from './layoutTable';
export { setupContainer } from './containerSetup';
export {
    trimHeader,
    getDefaultWarWebHeader,
    resolveWarWebMetricMeta,
} from './warWeb';
export type { WarWebMetricMeta } from './warWeb';
export type { ExportType } from './dataExport';
export {
    ExportTypes,
    downloadTableData,
    downloadTableElem,
    downloadCells,
    copyShareLink,
} from './dataExport';
export type { ColumnPreset } from './columnPresets';
export {
    readColumnPresets,
    saveColumnPreset,
    deleteColumnPreset,
} from './columnPresets';
export { modal, modalStrWithCloseButton, modalWithCloseButton } from './modals';

/*
Shared typescript for all pages
*/
export interface TierMetric {
    name: string,
    cumulative: boolean,
    normalize: boolean,
}

export type RawData = {
    alliance_ids: number[];
    alliance_names: string[];
    headers: string[];
    conflicts: JSONValue[][];
    source_sets?: { [key: string]: number[] };
    source_names?: { [key: string]: string };
};
export enum ConflictIndex {
    ID = 0,
    NAME = 1,
    C1_NAME = 2,
    C2_NAME = 3,
    START = 4,
    END = 5,
    C1_ID = 6,
    C2_ID = 7,
    WIKI = 8,
    STATUS = 9,
    CB = 10,
    POSTS = 11,
    SOURCE = 12,
    CATEGORY = 13,
    WARS = 14,
    ACTIVE_WARS = 15,
    C1_DEALT = 16,
    C2_DEALT = 17,
    TOTAL = 18
}

export type JSONValue =
    | string
    | number
    | boolean
    | null
    | JSONObject
    | JSONArray;

export interface JSONObject {
    [key: string]: JSONValue;
}

export interface JSONArray extends Array<JSONValue> { }

export interface Conflict {
    // name of conflict
    name: string,
    // wiki url stub (or null)
    wiki: string,
    // start date of conflict
    start: number,
    // end date of conflict (or -1 if ongoing)
    end: number,
    // casus belli (or null)
    cb: string,
    // conflict status (or null)
    status: string,
    // post name -> [post id, post url text, timestamp]
    posts: { [key: string]: [number, string, number] },
    coalitions: {
        name: string, // Name of the coalition
        alliance_ids: number[], // Alliance ids in the coalition
        alliance_names: string[], // Alliance names in the coalition (same order as ids)
        nation_ids: number[], // The nation id of each nation
        nation_aa: number[], // The alliance id of each nation (same order as nation_ids)
        nation_names: string[], // The nation name of each nation (same order as nation_ids)
        // Two 2d Arrays of count data (i.e. # wars, # attacks)
        // First array is self-counts, 2nd is enemy counts
        // The indexes are coalition index + alliance index + nation index (flat)
        // i.e. self counts for a nation at nation_ids[i] -> counts[0][j] - where j = i + alliance_ids.length + coalition_ids.length
        counts: [number[], number[]],
        // Two 2d Arrays of damage data (i.e. infra damage, money lost, units killed etc.)
        // First array is self-damage, 2nd is enemy damage
        // The indexes are coalition index + alliance index + nation index (flat)
        // i.e. self damage for a nation at nation_ids[i] -> damage[0][j] - where j = i + alliance_ids.length + coalition_ids.length
        damage: [number[], number[]]
    }[], // The array of coalitions (typically 2)
    damage_header: string[], // The column names for the damage data
    header_type: number[], // The column names for the counts data
    war_web: {
        headers: string[],
        // 3d array of the war web data [header index][alliance id index][alliance id index]
        // Get the alliance ids by combining the coalition alliance ids
        data: [][][]
    }
}

export interface TableData {
    columns: string[],
    data: any[][],
    searchable: number[],
    visible: number[],
    cell_format: { [key: string]: number[]; },
    row_format: ((row: HTMLElement, data: { [key: string]: any }, index: number) => void) | null,
    sort: [number, string],
    onSelectionChange?: (selection: {
        selectedRowIndexes: number[];
        selectedRows: any[][];
    }) => void
}


export interface GraphCoalitionData {
    name: string, // The name of the coalition
    alliance_ids: number[], // The ids of the alliances in the coalition
    alliance_names: string[], // The names of the alliances in the coalition
    cities: number[], // The city count by index of the cities in the coalition
    turn: {
        range: [number, number],
        data: number[][][][] // 4d array of the metric -> alliance -> day -> value
    },
    day: {
        range: [number, number],
        data: number[][][][], // 4d array of the metric -> alliance -> day -> value
    }
}
export interface GraphData {
    name: string, // The name of the conflict
    start: number, // The start date of the conflict (milliseconds)
    end: number, // The end date of the conflict (milliseconds)
    turn_start: number, // start turn number (2h)
    turn_end: number, // end turn number (2h)
    metric_names: string[], // the metric names
    metrics_day: number[], // The metric indexes that are by day
    metrics_turn: number[], // The metric indexes that are by turn
    coalitions: [GraphCoalitionData, GraphCoalitionData]
}

// function sortColors(colors: string[]): [string[], string[], string[], string[]] {
//     let reds: string[] = [], greens: string[] = [], blues: string[] = [], neutrals: string[] = [];

//     for (let color of colors) {
//         let [r, g, b] = color.split(',').map(Number);

//         if (r >= g && r > b) {
//             reds.push(color);
//         } else if (g > r && g > b) {
//             greens.push(color);
//         } else if (b > r && b >= g) {
//             blues.push(color);
//         } else {
//             neutrals.push(color);
//         }
//     }

//     return [reds, greens, blues, neutrals]
// }


