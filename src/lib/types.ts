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
    name: string,
    wiki: string,
    start: number,
    end: number,
    cb: string,
    status: string,
    posts: { [key: string]: [number, string, number] },
    coalitions: {
        name: string,
        alliance_ids: number[],
        alliance_names: string[],
        nation_ids: number[],
        nation_aa: number[],
        nation_names: string[],
        counts: [number[], number[]],
        damage: [number[], number[]]
    }[],
    damage_header: string[],
    header_type: number[],
    war_web: {
        headers: string[],
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
    name: string,
    alliance_ids: number[],
    alliance_names: string[],
    cities: number[],
    turn: {
        range: [number, number],
        data: number[][][][]
    },
    day: {
        range: [number, number],
        data: number[][][][],
    }
}

export interface GraphData {
    name: string,
    start: number,
    end: number,
    turn_start: number,
    turn_end: number,
    metric_names: string[],
    metrics_day: number[],
    metrics_turn: number[],
    coalitions: [GraphCoalitionData, GraphCoalitionData]
}
