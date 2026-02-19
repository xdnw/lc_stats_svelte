import { Unpackr } from 'msgpackr';
import { setQueryParam } from './queryState';
import { setupContainer as setupContainerWithAdapter } from './tableAdapter';

export {
    setQueryParam,
    getPageStorageKey,
    saveCurrentQueryParams,
    readSavedQueryParams,
    applySavedQueryParamsIfMissing,
    resetQueryParams,
} from './queryState';
export type { ColumnPreset } from './columnPresets';
export {
    readColumnPresets,
    saveColumnPreset,
    deleteColumnPreset,
} from './columnPresets';

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

// delimiter, file extension and Internet media type for csv and tsv
export interface ExportType {
    delimiter: string,
    ext: string,
    mime: string
}

export const ExportTypes = {
    CSV: {
        delimiter: ',',
        ext: 'csv',
        mime: 'text/csv'
    },
    TSV: {
        delimiter: '\t',
        ext: 'tsv',
        mime: 'text/tab-separated-values'
    }
}

export function downloadTableData(_currentRowData: TableData, useClipboard: boolean, type: ExportType) {
    if (!_currentRowData) {
        modalStrWithCloseButton("Error", "No data to download");
        return;
    }
    let visibleColumns = _currentRowData.visible.map(index => _currentRowData.columns[index]);
    let data: any[][] = _currentRowData.data.map(row => _currentRowData.visible.map(index => row[index]));
    data.unshift(visibleColumns);
    downloadCells(data, useClipboard, type);
}

export function downloadTableElem(elem: HTMLTableElement, useClipboard: boolean, type: ExportType) {
    var table = $(elem).DataTable();
    // get visible columns
    const visibleColumnNames: string[] = [];
    const visibleColumnIds: Set<number> = new Set();
    table.columns().every(function (index: number) {
        if (table.column(index).visible()) {
            if (index == 0) return;
            visibleColumnNames.push(table.column(index).header().textContent || "name");
            visibleColumnIds.add(index);
        }
    });
    // Add header names to the data array
    const data2dInclHeaderNames: any[][] = [visibleColumnNames];

    // Add row data to the data array
    table.rows({ search: 'applied' }).every(function (this: any, _: number) {
        const rowData: any[] = [];
        this.data().forEach((cellData: any, cellIdx: number) => {
            if (visibleColumnIds.has(cellIdx + 1)) {
                rowData.push(cellData);
            }
        });
        data2dInclHeaderNames.push(rowData);
    });

    downloadCells(
        data2dInclHeaderNames,
        useClipboard,
        type
    );
}

export function downloadCells(data: any[][], useClipboard: boolean, type: ExportType) {
    let csvContent = (useClipboard ? '' : 'sep=' + type.delimiter + '\n') + data.map(e => e.join(type.delimiter)).join("\n");

    if (useClipboard) {
        navigator.clipboard.writeText(csvContent).catch((err) => {
            console.error("Failed to copy to clipboard", err);
        });
        modalStrWithCloseButton("Copied to clipboard", "The data for the currently selected columns has been copied to your clipboard.");
    } else {
        // Create a blob from the CSV content
        let blob = new Blob([csvContent], { type: type.mime + ';charset=utf-8;' });

        // Create a link element
        let link = document.createElement("a");

        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            let url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "data." + type.ext);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        modalStrWithCloseButton("Download starting", "The data for the currently selected columns should begin downloading. If the download does not start, please check your browser settings, or try the clipboard button instead");
    }
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

export enum Palette {
    REDS = 0,
    BLUES = 1,
    GREENS = 2,
    NEUTRALS = 3
}

export type ColorPalette = {
    [key in Palette]: string[];
}

export const colorPalettes: ColorPalette = {
    [Palette.REDS]: ['128,0,0', '128,128,0', '139,0,0', '139,69,19', '160,82,45', '165,42,42', '178,34,34', '184,134,11', '188,143,143', '189,183,107', '199,21,133', '205,133,63', '205,92,92', '210,105,30', '210,180,140', '218,112,214', '218,165,32', '219,112,147', '220,20,60', '222,184,135', '233,150,122', '238,232,170', '240,128,128', '240,230,140', '244,164,96', '245,222,179', '245,245,220', '250,128,114', '250,235,215', '250,240,230', '250,250,210', '253,245,230', '255,0,0', '255,105,180', '255,127,80', '255,140,0', '255,160,122', '255,165,0', '255,182,193', '255,192,203', '255,20,147', '255,215,0', '255,218,185', '255,222,173', '255,228,181', '255,228,196', '255,228,225', '255,235,205', '255,239,213', '255,250,205', '255,255,0', '255,69,0', '255,99,71'],
    [Palette.BLUES]: ['0,0,128', '0,0,139', '0,0,205', '0,0,255', '0,128,128', '0,139,139', '0,191,255', '0,206,209', '0,255,255', '0,255,255', '100,149,237', '106,90,205', '112,128,144', '119,136,153', '123,104,238', '135,206,235', '135,206,250', '138,43,226', '147,112,219', '148,0,211', '153,50,204', '173,216,230', '175,238,238', '176,196,222', '176,224,230', '186,85,211', '230,230,250', '25,25,112', '30,144,255', '47,79,79', '65,105,225', '70,130,180', '72,61,139', '75,0,130', '95,158,160'],
    [Palette.GREENS]: ['0,100,0', '0,128,0', '0,250,154', '0,255,0', '0,255,127', '102,205,170', '107,142,35', '124,252,0', '127,255,0', '127,255,212', '143,188,143', '144,238,144', '152,251,152', '154,205,50', '173,255,47', '32,178,170', '34,139,34', '46,139,87', '50,205,50', '60,179,113', '64,224,208', '72,209,204', '85,107,47'],
    [Palette.NEUTRALS]: ['0,0,0', '105,105,105', '128,0,128', '128,128,128', '139,0,139', '169,169,169', '192,192,192', '211,211,211', '216,191,216', '220,220,220', '221,160,221', '238,130,238', '245,245,245', '255,0,255', '255,0,255', '255,255,255']
}
export const palettePrimary: string[] = [
    '255,0,0',
    '0,0,255',
    '0,255,0',
    '128,128,128'
];

export function darkenColor(color: string, percentage: number): string {
    let rgbValues = color.match(/\d+/g);
    if (!rgbValues) {
        throw new Error('Invalid color format');
    }

    let [r, g, b] = rgbValues.map(Number);

    r = Math.floor(r * (1 - percentage / 100));
    g = Math.floor(g * (1 - percentage / 100));
    b = Math.floor(b * (1 - percentage / 100));

    return `rgb(${r}, ${g}, ${b})`;
}

export function convertToRGB(colors: string[]): string[] {
    return colors.map(color => {
        let [r, g, b] = color.split(',');
        return `rgb(${r}, ${g}, ${b})`;
    });
}
export function generateColors(d3: any, n: number, palette: Palette) {
    let colors = [];
    let colorScale = d3.scaleSequential().domain([0, n]).interpolator(d3.interpolateRgbBasisClosed(convertToRGB(colorPalettes[palette])));
    for (let i = 0; i < n; i++) {
        colors.push(colorScale(i));
    }
    return colors;
}

export function generateColorsFromPalettes(d3: any, palettes: Palette[]) {
    let countByPalette: number[] = new Array(Object.keys(Palette).length).fill(0);
    for (const element of palettes) {
        countByPalette[element]++;
    }
    let colorsByPalette: string[][] = new Array(countByPalette.length).fill([]);
    for (const element of palettes) {
        let palette = element;
        let count = countByPalette[palette];
        if (count > 0) {
            let paletteColors = generateColors(d3, count, palette);
            colorsByPalette[palette] = paletteColors;
        }
    }
    countByPalette.fill(0);
    let colors = [];
    for (const element of palettes) {
        let palette = element;
        let j = countByPalette[palette]++;
        let paletteColors = colorsByPalette[palette];
        colors.push(paletteColors[j]);
    }
    return colors;
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

/**
 * Format a timestamp (milliseconds) to a YYYY-MM-DD string
 * @param data epoch time millis
 * @returns date string
 */
export function formatDate(data: number | null): string {
    if (data == null || data == -1) return "N/A";
    let date = new Date(data as number);
    let formattedDate = date.toISOString().slice(0, 16).replace("T", " ");
    return formattedDate.endsWith("00:00") ? formattedDate.slice(0, 10) : formattedDate;
}

export function formatDaysToDate(value: number) {
    return formatTurnsToDate(value * 12);
}

export function formatDuration(x: number) {
    let y = ~~(x / 31536000), // seconds in a year
        w = ~~((x - y * 31536000) / 604800), // seconds in a week
        d = ~~((x - y * 31536000 - w * 604800) / 86400), // seconds in a day
        h = ~~((x - y * 31536000 - w * 604800 - d * 86400) / 3600), // seconds in an hour
        m = ~~((x - y * 31536000 - w * 604800 - d * 86400 - h * 3600) / 60), // seconds in a minute
        s = x - y * 31536000 - w * 604800 - d * 86400 - h * 3600 - m * 60; // remaining seconds

    let words = ['year', 'week', 'day', 'hour', 'minute', 'second'];
    return [y, w, d, h, m, s].map((x, i) => !x ? '' :
        `${x} ${words[i]}${x !== 1 ? 's' : ''}`)
        .filter(x => x).join(', ').replace(/,([^,]*)$/, ' and$1')
}

// Convert the slider (turns) to a time string
export function formatTurnsToDate(value: number) {
    let timeMillis = (value / 12) * 60 * 60 * 24 * 1000;
    let date = new Date();
    date.setTime(timeMillis);
    let formattedDate = date.toISOString().slice(0, 16).replace("T", " ");
    return formattedDate.endsWith("00:00") ? formattedDate.slice(0, 10) : formattedDate;
}

/**
 * Format a number to have commas
 * For large tables this is much faster than js locale formatting
 * @param num The
 * @returns string with commas
 */
export function commafy(num: number): string {
    var parts = ('' + (num < 0 ? -num : num)).split("."), s = parts[0], L, i = L = s.length, o = '';
    while (i--) {
        o = (i === 0 ? '' : ((L - i) % 3 ? '' : ','))
            + s.charAt(i) + o
    }
    return (num < 0 ? '-' : '') + o + (parts[1] ? '.' + parts[1] : '');
}

export function formatAllianceName(name: string | null | undefined, id: number): string {
    const trimmed = (name ?? '').trim();
    return trimmed.length > 0 ? trimmed : `AA:${id}`;
}

export function normalizeAllianceIds(
    ids: Array<number | string | null | undefined>,
): number[] {
    return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
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
    (window as any).formatNumber = (data: number, _type: any, _row: any, _meta: any): string => {
        if (data == 0) return '0';
        if (data < 1000 && data > -1000) return data.toString();
        return commafy(data);
    }

    (window as any).formatMoney = (data: number, _type: any, _row: any, _meta: any): string => {
        if (data == 0) return '$0';
        if (data < 1000 && data > -1000) return '$' + data.toString();
        return '$' + commafy(data);
    }

    (window as any).formatDate = (data: number, _type: any, _row: any, _meta: any): string => {
        return formatDate(data);
    }

    // Add the showNames function to the window object (which shows a popup of the alliances in a coalition)
    (window as any).showNames = (coalitionName: string, index: number) => {
        let col: { alliance_ids: number[], alliance_names: string[] } = (window as any).getIds(coalitionName, index);
        let alliance_ids: number[] = col.alliance_ids;
        var modalTitle = "Coalition " + (index + 1) + ": " + coalitionName;
        let ul = document.createElement("ul");
        for (let i = 0; i < alliance_ids.length; i++) {
            let alliance_id = alliance_ids[i];
            let alliance_name = formatAllianceName(col.alliance_names[i], alliance_id);
            let a = document.createElement("a");
            a.setAttribute("href", "https://politicsandwar.com/alliance/id=" + alliance_id);
            a.textContent = alliance_name;
            let li = document.createElement("li");
            li.appendChild(a);
            ul.appendChild(li);
        }
        let modalBody = document.createElement("div");
        let areaElem = document.createElement("kbd");
        let idsStr = alliance_ids.join(",");
        areaElem.textContent = idsStr;
        areaElem.setAttribute("readonly", "true");
        areaElem.setAttribute("class", "form-control m-0");
        modalBody.appendChild(areaElem);
        let copyToClipboard = "<button class='btn btn-outline-info btn-sm position-absolute top-0 end-0 m-3' onclick='copyToClipboard(\"" + idsStr + "\")'><i class='bi bi-clipboard'></i></button>";
        modalBody.innerHTML += copyToClipboard;
        modalBody.appendChild(ul);
        modalWithCloseButton(modalTitle, modalBody);
    }

    (window as any).copyToClipboard = (data: string) => {
        navigator.clipboard.writeText(data).then(() => {
            alert("Copied to clipboard");
        }).catch((err) => {
            alert("Failed to copy to clipboard" + err);
        });
    }
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

/**
 * Create a closeable modal with a title and body (html string)
 * Modals are from bootstrap: <https://www.gethalfmoon.com/docs/modal/>
 * This is used for the coalition buttons that display the alliances in a coalition
 * @param title The title of the modal
 * @param bodyStr The body html, must be escaped beforehand if it contains user input
 */
export function modalStrWithCloseButton(title: string, bodyStr: string) {
    let bodyElem = document.createElement("div");
    bodyElem.innerHTML = bodyStr;
    modalWithCloseButton(title, bodyElem);
}

/**
 * Create closeable modal with a title and body (HTMLElement)
 * Modals are from bootstrap: <https://www.gethalfmoon.com/docs/modal/>
 * This is used for the coalition buttons that display the alliances in a coalition
 * @param title The title of the modal
 * @param body the body element
 */
export function modalWithCloseButton(title: string, body: HTMLElement) {
    modal(title, body, `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`);
}

export function arrayEquals(a: any[], b: any[]) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

/**
 * Create a modal with a footer
 * Modals are from bootstrap: <https://www.gethalfmoon.com/docs/modal/>
 * @param title the text in modal title bar
 * @param body the element for modal body
 * @param footer the element for modal footer (e.g. a close button)
 */
export function modal(title: string, body: HTMLElement, footer: string) {
    let myModal = document.getElementById("exampleModal");

    var html = `<div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
          <div class="modal-dialog">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="exampleModalLabel"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body text-break"></div>
                  <div class="modal-footer"></div>
              </div>
          </div>
      </div>`

    if (myModal == null) {
        let myModal = htmlToElement(html);
        document.body.appendChild(myModal as Node);
    }
    let createdModal = document.getElementById("exampleModal") as HTMLElement;
    createdModal.getElementsByClassName("modal-title")[0].innerHTML = title;
    let myBody = createdModal.getElementsByClassName("modal-body")[0];
    myBody.innerHTML = "";
    myBody.appendChild(body);
    createdModal.getElementsByClassName("modal-footer")[0].innerHTML = footer;
    (window as any).bootstrap.Modal.getOrCreateInstance(createdModal).show();
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

export async function copyShareLink(): Promise<boolean> {
    const href = window.location.href;
    try {
        await navigator.clipboard.writeText(href);
        modalStrWithCloseButton('Share link copied', 'The current page link has been copied to your clipboard.');
        return true;
    } catch (error) {
        console.error('Failed to copy share link', error);
        modalStrWithCloseButton('Copy failed', 'Could not copy the share link. Please copy the URL from your browser address bar.');
        return false;
    }
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