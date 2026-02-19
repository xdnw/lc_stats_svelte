import { Unpackr } from 'msgpackr';
import { setQueryParam } from './queryState';
import { setupContainer as setupContainerWithAdapter } from './tableAdapter';
import { registerFormatters } from './formatters';
import { modalWithCloseButton } from './modals';
import {
    commafy,
    formatAllianceName,
    formatDate,
    formatDuration,
} from './formatting';

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

const extUnpackr = new Unpackr({ largeBigIntToFloat: true, mapsAsObjects: true, bundleStrings: true, int64AsType: "number" });
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


export const UNITS_PER_CITY: { [key: string]: number } = {
    "soldier": 15_000,
    "tank": 1250,
    "aircraft": 75,
    "ship": 15,
    "infra": 1 // 1 means it'll just divide by # of cities
}

// Rename function so the table columns are more compact
export function trimHeader(header: string) {
    if (header.includes("_value")) {
        header = "~$" + header.replace("_value", "");
    }
    if (header.includes("_loss")) {
        header = header.replace("_loss", "");
    }
    if (header.includes("loss_")) {
        header = header.replace("loss_", "");
    }
    if (header === "~$loss") {
        header = "damage";
    }
    return header.replaceAll("_", " ");
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

export function getConflictDataUrl(conflictId: string, version: number | string): string {
    return `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${version}`;
}

export function getConflictGraphDataUrl(conflictId: string, version: number | string): string {
    return `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip?${version}`;
}

export function toggleCoalitionAllianceSelection(
    allowedAllianceIds: Set<number>,
    coalitions: { alliance_ids: number[] }[],
    coalitionIndex: number,
    allianceId: number,
): Set<number> {
    const coalition = coalitions[coalitionIndex];
    const hasAll = coalition?.alliance_ids.every((id) => allowedAllianceIds.has(id));
    const countCoalition = coalition?.alliance_ids.filter((id) => allowedAllianceIds.has(id)).length ?? 0;
    const hasAA = allowedAllianceIds.has(allianceId);
    const otherCoalitionId = coalitionIndex === 0 ? 1 : 0;
    const otherCoalition = coalitions[otherCoalitionId];
    const otherHasAll = otherCoalition?.alliance_ids.every((id) => allowedAllianceIds.has(id));

    if (hasAA) {
        if (hasAll && otherHasAll) {
            return new Set([
                ...(otherCoalition?.alliance_ids ?? []),
                allianceId,
            ]);
        }
        if (countCoalition === 1) {
            return new Set([
                ...allowedAllianceIds,
                ...(coalition?.alliance_ids ?? []),
            ]);
        }
        return new Set([...allowedAllianceIds].filter((id) => id !== allianceId));
    }

    return new Set([...allowedAllianceIds, allianceId]);
}

export type MetricAccessors = {
    metric_ids: number[];
    metric_indexes: number[];
    metric_is_turn: boolean[];
    metric_normalize: number[];
    isAnyTurn: boolean;
};

export function resolveMetricAccessors(
    data: GraphData,
    metrics: TierMetric[],
): MetricAccessors | null {
    let metric_ids: number[] = [];
    let metric_indexes: number[] = [];
    let metric_is_turn: boolean[] = [];
    let metric_normalize: number[] = [];

    for (let i = 0; i < metrics.length; i++) {
        let metric = metrics[i];
        let metric_id = data.metric_names.indexOf(metric.name);
        if (metric_id == -1) {
            console.error(`Metric ${metric.name} not found`);
            return null;
        }
        metric_ids.push(metric_id);
        let is_turn = data.metrics_turn.includes(metric_id);
        metric_is_turn.push(is_turn);
        metric_indexes.push(
            is_turn
                ? data.metrics_turn.indexOf(metric_id)
                : data.metrics_day.indexOf(metric_id),
        );
        if (metric_indexes[i] == -1) {
            console.error(`Metric ${metric.name} not found ${metric_id}`);
            return null;
        }
        if (metric.normalize) {
            let perCity = UNITS_PER_CITY[metric.name];
            metric_normalize.push(perCity | 0);
        } else {
            metric_normalize.push(-1);
        }
    }

    let isAnyTurn = metric_is_turn.reduce((a, b) => a || b, false);
    return {
        metric_ids,
        metric_indexes,
        metric_is_turn,
        metric_normalize,
        isAnyTurn,
    };
}

export function getDefaultWarWebHeader(data: Conflict): string {
    if (data.war_web.headers.includes("wars")) return "wars";
    return data.war_web.headers[0] ?? "wars";
}

export type WarWebMetricMeta = {
    primaryToRowLabel: (h: string) => string;
    rowToPrimaryLabel: (h: string) => string;
    directionNote: (h: string) => string;
};

/**
 * Add the formatting functions to the window object
 * - These are used by the setupTable function to format columns
 * - formatNumber
 * - formatMoney
 * - formatDate
 */
export function addFormatters() {
    registerFormatters({
        commafy,
        formatDate,
        formatAllianceName,
        modalWithCloseButton,
    });
}

/**
 * Helper function for reading the AWS S3 bucket data (json)
 * Convert a compressed data stream to a byte array
 * @param readableStream the compressed data stream
 * @returns 
 */
async function streamToUint8Array(readableStream: ReadableStream): Promise<Uint8Array> {
    const reader = readableStream.getReader();
    const chunks: Uint8Array[] = [];
    let result;
    while (!result?.done) {
        result = await reader.read();
        if (!result.done) {
            chunks.push(new Uint8Array(result.value));
        }
    }
    let totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    let resultArray = new Uint8Array(totalLength);
    let offset = 0;
    for (let chunk of chunks) {
        resultArray.set(chunk, offset);
        offset += chunk.length;
    }
    return resultArray;
}

/**
 * Helper function for reading and decompressing gzip json from a url
 * Used by the decompressBson function
 * @param url The s3 bucket url
 * @returns decompressed binary stream
 */
const decompress = async (url: string) => {
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    if (!response.body) {
        throw new Error('Response body is null');
    }
    const stream_in = response.body.pipeThrough(ds);
    const blob_out = await new Response(stream_in).blob();
    return blob_out;
};

/**
 * Read gzip json from a url and return a javascript object
 * @param url The s3 bucket url
 * @returns json object
 */
export const decompressBson = async (url: string) => {
    let result = await decompress(url);
    let stream: ReadableStream<Uint8Array> = result.stream();
    let uint8Array = await streamToUint8Array(stream);
    return extUnpackr.unpack(uint8Array);
};

/**
 * Generate UUID v4
 * Used for creating unique ids for html elements
 * https://en.wikipedia.org/wiki/Universally_unique_identifier
 * @returns uuid string
 */
export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Convert a string to an html element
 * Less verbose than using document.createElement
 * @param html string (e.g. '<div>hello</div>')
 * @returns an HTMLElement
 */
export function htmlToElement(html: string): HTMLElement {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild as HTMLElement;
}

export function arrayEquals(a: any[], b: any[]) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

/**
 * Setup a container with a table and its data
 * - Clear the container
 * - Add a table to the container with a customize button and empty collapse div
 * - call setupTable with the table element and the data
 * @param container 
 * @param data 
 */
export function setupContainer(container: HTMLElement, data: TableData) {
    return setupContainerWithAdapter(container, data, {
        uuidv4,
        htmlToElement,
        commafy,
        setQueryParam,
        ensureScriptsLoaded,
    });
}

/**
 * Compute table data (columns, rows, formats) for a conflict for a given layout type
 * Used by the conflict page to render the table and to compute derived summaries (top movers, totals)
 */
export function computeLayoutTableData(
    _rawData: Conflict,
    type: number,
    layout: string[],
    sortBy: string,
    sortDir: string,
): TableData {
    let coalitions = _rawData.coalitions;
    let damage_header = _rawData.damage_header;
    let header_types = _rawData.header_type;

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: { [key: string]: number[] } = {};
    let row_format:
        | ((row: HTMLElement, data: { [key: string]: any }, index: number) => void)
        | null = null;

    // Set the row format based on the layout (caller will apply colouring where required)
    switch (type) {
        case 0: // coalition
            row_format = null; // consumer can set if needed
            break;
        case 1: // alliance
            row_format = null;
            break;
        case 2: // nation
            row_format = null;
            break;
    }

    // Build columns from damage header
    columns.push('name');
    for (let i = 0; i < damage_header.length; i++) {
        let header = trimHeader(damage_header[i]);
        let t = header_types[i];
        if (t == 0) {
            columns.push('loss:' + header);
            columns.push('dealt:' + header.replace('_loss', '').replace('loss_', ''));
            columns.push('net:' + header.replace('_loss', '').replace('loss_', ''));
        } else if (t == 1) {
            columns.push('def:' + header);
            columns.push('off:' + header);
            columns.push('both:' + header);
        }
    }

    searchable.push(0);
    if (type === 0) {
        cell_format['formatCol'] = [0];
    } else if (type === 1) {
        cell_format['formatAA'] = [0];
    } else if (type === 2) {
        cell_format['formatNation'] = [0];
    }

    const sortIndex = Math.max(0, columns.indexOf(sortBy));
    let sort: [number, string] = [sortIndex, sortDir];

    // Set cell formatting and visible columns
    cell_format['formatNumber'] = [];
    cell_format['formatMoney'] = [];
    for (let i = 0; i < columns.length; i++) {
        if (layout.includes(columns[i])) {
            visible.push(i);
        }
        if (i > 0) {
            if (
                columns[i].includes('~') ||
                columns[i].includes('damage') ||
                (columns[i].includes('infra') && !columns[i].includes('attacks'))
            ) {
                cell_format['formatMoney'].push(i);
            } else {
                cell_format['formatNumber'].push(i);
            }
        }
    }

    // Helper to add three stats for each damage column into the row
    let addStats2Row = (row: any[], damageTaken: any, damageDealt: any) => {
        for (let i = 0; i < damageTaken.length; i++) {
            let damageTakenStat = damageTaken[i];
            let damageDealtStat = damageDealt[i];

            let tt = header_types[i];
            let total;
            if (tt == 0) {
                total = damageDealtStat - damageTakenStat;
            } else {
                total = damageDealtStat + damageTakenStat;
            }
            row.push(damageTakenStat);
            row.push(damageDealtStat);
            row.push(total);
        }
    };

    // Helper for adding rows depending on layout
    let addRow = (colEntry: any, index: number) => {
        let alliance_ids = colEntry.alliance_ids;
        let alliance_names = colEntry.alliance_names;
        let nation_ids = colEntry.nation_ids;
        let nation_names = colEntry.nation_names;
        let nation_aas = colEntry.nation_aa;
        let damage = colEntry.damage;
        switch (type) {
            case 0: // coalition
                let row = [index];
                addStats2Row(row, damage[0], damage[1]);
                rows.push(row);
                break;
            case 1: // alliance
                let o = 2;
                for (let i = 0; i < alliance_ids.length; i++) {
                    let row = [];
                    let alliance_id = alliance_ids[i];
                    let alliance_name = formatAllianceName(alliance_names[i], alliance_id);
                    row.push([alliance_name, alliance_id]);
                    addStats2Row(row, damage[i * 2 + o], damage[i * 2 + o + 1]);
                    rows.push(row);
                }
                break;
            case 2: // nation
                let oo = 2 + alliance_ids.length * 2;
                for (let i = 0; i < nation_ids.length; i++) {
                    let row = [];
                    let nation_id = nation_ids[i];
                    let nation_name = nation_names[i];
                    let nation_aa = nation_aas[i];
                    row.push([nation_name, nation_id, nation_aa]);
                    addStats2Row(row, damage[i * 2 + oo], damage[i * 2 + oo + 1]);
                    rows.push(row);
                }
                break;
        }
    };

    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        addRow(colEntry, i);
    }

    return {
        columns,
        data: rows,
        visible,
        searchable,
        cell_format,
        row_format,
        sort,
    } as TableData;
}

export function formatDatasetProvenance(version: number | string, updateMs?: number): string {
    let text = `Version: ${version}`;
    if (updateMs != null && !isNaN(updateMs)) {
        const secondsAgo = Math.max(0, Math.round((Date.now() - updateMs) / 1000));
        text += ` • Last updated ${formatDuration(secondsAgo)} ago`;
    }
    return text;
}

export function ensureScriptsLoaded(scriptIds: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const checkScriptsLoaded = () => {
            for (const scriptId of scriptIds) {
                const script = document.getElementById(scriptId) as HTMLScriptElement;
                if (!script || !script.hasAttribute('data-loaded')) {
                    return false;
                }
            }
            return true;
        };

        const onLoad = (event: Event) => {
            const script = event.target as HTMLScriptElement;
            script.setAttribute('data-loaded', 'true');
            if (checkScriptsLoaded()) {
                resolve();
            }
        };

        for (const scriptId of scriptIds) {
            const script = document.getElementById(scriptId) as HTMLScriptElement;
            if (!script) {
                reject(new Error(`Script element with id ${scriptId} not found`));
                return;
            }
            if (script.hasAttribute('data-loaded')) {
                continue;
            }
            script.addEventListener('load', onLoad);
        }

        if (checkScriptsLoaded()) {
            resolve();
        }
    });
}

export function rafDelay(delay: number, func: () => void): (timestamp: number) => void {
    let start: number | undefined;
    return function raf(timestamp: number): void {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        if (elapsed < delay) {
            requestAnimationFrame(raf);
        } else {
            func();
        }
    }
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


export function resolveWarWebMetricMeta(header: string): WarWebMetricMeta {
    if (header.endsWith("_loss") || header.endsWith("_loss_value") || header === "loss_value") {
        return {
            primaryToRowLabel: (h) => `${h} inflicted by Compared`,
            rowToPrimaryLabel: (h) => `${h} inflicted by Selected`,
            directionNote: (h) =>
                `${h} counts losses inflicted by each side in battles against the other.`,
        };
    }
    if (header.startsWith("consume_")) {
        return {
            primaryToRowLabel: (h) => `${h} consumed by Selected`,
            rowToPrimaryLabel: (h) => `${h} consumed by Compared`,
            directionNote: (h) =>
                `${h} is the resources consumed by each side during battles against the other.`,
        };
    }
    if (header === "loot_value") {
        return {
            primaryToRowLabel: () => `Loot taken by Compared`,
            rowToPrimaryLabel: () => `Loot taken by Selected`,
            directionNote: () =>
                `loot_value is the loot taken by each side from the other.`,
        };
    }
    if (header.endsWith("_attacks") || header === "attacks") {
        return {
            primaryToRowLabel: (h) => `${h} by Selected`,
            rowToPrimaryLabel: (h) => `${h} by Compared`,
            directionNote: (h) =>
                `${h} counts attacks launched by each side against the other.`,
        };
    }
    if (header.startsWith("wars_") || header.endsWith("_wars") || header === "wars") {
        return {
            primaryToRowLabel: (h) => `${h} as attacker: Selected`,
            rowToPrimaryLabel: (h) => `${h} as attacker: Compared`,
            directionNote: (h) =>
                `${h} counts wars where each side was the attacker/initiator.`,
        };
    }
    return {
        primaryToRowLabel: (h) => `${h} (Compared → Selected)`,
        rowToPrimaryLabel: (h) => `${h} (Selected → Compared)`,
        directionNote: (h) =>
            `${h}: "Selected" is the value attributed to Compared coalition, "Compared" to the Selected coalition.`,
    };
}