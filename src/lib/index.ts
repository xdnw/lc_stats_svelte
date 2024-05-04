/*
Shared typescript for all pages
*/
export interface TierMetric {
    name: string,
    cumulative: boolean,
    normalize: boolean,
}
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
    posts: {[key: string]: [number, string, number]},
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
    cell_format: {[key: string]: number[];}, 
    row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null, 
    sort: [number, string]
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
        ext: 'csv',
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

export function downloadCells(data: any[][], useClipboard: boolean, type: ExportType) {
    let csvContent = (useClipboard ? '' : 'sep=' + type.delimiter + '\n') + data.map(e => e.join(type.delimiter)).join("\n");

    if (useClipboard) {
        navigator.clipboard.writeText(csvContent).then(() => {
            console.log("Copied to clipboard");
        }).catch((err) => {
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
        modalStrWithCloseButton("Download starting", "The data for the currently selected columns should begind downloading. If the download does not start, please check your browser settings, or try the clipboard button instead");
    }
}

export const UNITS_PER_CITY: {[key: string]: number} = {
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
    cities: number[], // The city ids of the cities in the coalition
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
    coalitions: [GraphCoalitionData,GraphCoalitionData]
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
function commafy(num: number): string {
    var parts = (''+(num<0?-num:num)).split("."), s=parts[0], L, i=L= s.length, o='';
    while(i--){ o = (i===0?'':((L-i)%3?'':',')) 
                    +s.charAt(i) +o }
    return (num<0?'-':'') + o + (parts[1] ? '.' + parts[1] : ''); 
}

/**
 * Add the formatting functions to the window object
 * - These are used by the setupTable function to format columns
 * - formatNumber
 * - formatMoney
 * - formatDate
 */
export function addFormatters() {
    (window as any).formatNumber = (data: number, type: any, row: any, meta: any): string => {
        if (data == 0) return '0';
        if (data < 1000 && data > -1000) return data.toString();
        return commafy(data);
    }

    (window as any).formatMoney = (data: number, type: any, row: any, meta: any): string => {
        if (data == 0) return '$0';
        if (data < 1000 && data > -1000) return '$' + data.toString();
        return '$' + commafy(data);
    }

    (window as any).formatDate = (data: number, type: any, row: any, meta: any): string => {
        return formatDate(data);
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
    for(let chunk of chunks) {
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
    let start = Date.now();
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    console.log("Fetch time: " + (Date.now() - start) + "ms"); start = Date.now();
    const blob_in = await response.blob();
    console.log("Blob time: " + (Date.now() - start) + "ms"); start = Date.now();
    const stream_in = blob_in.stream().pipeThrough(ds);
    const blob_out = await new Response(stream_in).blob();
    console.log("Decompress blob time: " + (Date.now() - start) + "ms");
    return blob_out;
};
  
/**
 * Read gzip json from a url and return a javascript object
 * @param url The s3 bucket url
 * @returns json object
 */
export const decompressBson = async (url: string) => {
    let start = Date.now();
    let result = await decompress(url);
    console.log("Decompression time: " + (Date.now() - start) + "ms"); start = Date.now();
    let stream: ReadableStream<Uint8Array> = result.stream();
    let uint8Array = await streamToUint8Array(stream);
    console.log("Stream to uint8Array time: " + (Date.now() - start) + "ms"); start = Date.now();
    var PSON = dcodeIO.PSON;
    var pson = new PSON.StaticPair([]);
    let decoded = pson.decode(uint8Array);
    console.log("PSON decode time: " + (Date.now() - start) + "ms");
    return decoded;
};

/**
 * Generate UUID v4
 * Used for creating unique ids for html elements
 * https://en.wikipedia.org/wiki/Universally_unique_identifier
 * @returns uuid string
 */
export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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
                  <div class="modal-body"></div>
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
    container.innerHTML = "";
    addTable(container, uuidv4());
    let table = container.getElementsByTagName("table")[0];
    setupTable(container, table, data);
}

/**
 * Add the default table layout to a container
 * This includes a button for 'customize' and class=collapse for it (though no buttons are added into it yet)
 * Currently the container is cleared and a new table is created when layouts are changed
 * 
 * @param container The element to add the table to
 * @param id the id to give the table (i.e. the uuid v4 string)
 */
function addTable(container: HTMLElement, id: string) {
    container.appendChild(htmlToElement(`<button class="btn btn-sm ms-1 mt-1 btn-secondary btn-outline-info opacity-75 fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#tblCol" aria-expanded="false" aria-controls="tblCol">
    <i class="bi bi-table"></i>&nbsp;Customize&nbsp;<i class="bi bi-chevron-down"></i></button>`));
    container.appendChild(htmlToElement(`<div class="dropdown d-inline">
    <button class="btn btn-sm ms-1 mt-1 btn-secondary btn-outline-info fw-bold opacity-75" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
    Export&nbsp;<i class="bi bi-chevron-down"></i>
    </button>
    <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton">
    <li><button class="dropdown-item btn btn-sm m-0 btn-secondary btn-outline-secondary fw-bold" type="button" onclick="download(false, 'CSV')"><kbd><i class="bi bi-download"></i> ,</kbd> Download CSV</button></li>
    <li><button class="dropdown-item btn btn-sm m-0 btn-secondary btn-outline-secondary fw-bold" type="button" onclick="download(true, 'CSV')"><kbd><i class="bi bi-copy"></i> ,</kbd> Copy CSV</button></li>
    <li><button class="dropdown-item btn btn-sm m-0 btn-secondary btn-outline-secondary fw-bold" type="button" onclick="download(false, 'TSV')"><kbd><i class="bi bi-download"></i><i class="bi bi-indent"></i></kbd> Download TSV</button></li>
    <li><button class="dropdown-item btn btn-sm m-0 btn-secondary btn-outline-secondary fw-bold" type="button" onclick="download(true, 'TSV')"><kbd><i class="bi bi-copy"></i><i class="bi bi-indent"></i></kbd> Copy TSV</button></li>
    </ul>
    </div>`));
    container.appendChild(htmlToElement(`<div class="collapse table-toggles pt-1" id="tblCol">
    <input id="table-search" class="form-control-sm w-100 mb-1" type="search" placeholder="Search" aria-label="Search">
    </div>`));
    container.appendChild(document.createElement("hr"));
    container.appendChild(htmlToElement(`<table id="${id}" class="table compact table-bordered d-none" style="width:100%">
        <thead class="table-info"><tr></tr></thead>
        <tbody></tbody>
        <tfoot><tr></tr></tfoot>
    </table>`));

    let input = container.getElementsByTagName("input")[0];
    input.addEventListener('input', function() {
        let tableToggles = document.getElementsByClassName('table-toggles');
        for(let i = 0; i < tableToggles.length; i++) {
            let buttons = tableToggles[i].getElementsByTagName('button');
            for(let j = 0; j < buttons.length; j++) {
                if(buttons[j].textContent?.includes(this.value)) {
                    buttons[j].classList.remove('d-none');
                } else {
                    buttons[j].classList.add('d-none');
                }
            }
        }
    });
}

// Set the query param
// Called during a layout button click (handleClick)
export function setQueryParam(param: string, value: any) {
    let url = new URL(window.location.href);
    let oldUrl = url.toString();
    if (value == null) {
        url.searchParams.delete(param);
    } else {
        url.searchParams.set(param, value);
    }
    let newUrl = url.toString();
    if (oldUrl !== newUrl) {
        window.history.pushState({}, '', newUrl);
    }
}

/**
 * Setup a table element, as well as its container
 * - Adds the table toggles (customize) to the container's collapse
 * @param containerElem 
 * @param tableElem 
 * @param dataSetRoot 
 */
function setupTable(containerElem: HTMLElement, 
    tableElem: HTMLElement, 
    dataSetRoot: {
        columns: string[], // Name of the columns of the table (including all the custom ones not displayed)
        data: any[][], // 2d array of the table data in the order [row index][column index] - may be combination of numbers or string
        searchable: number[],  // the index of the columns that are searchable
        visible: number[], // the index of the columns that are visible
        cell_format: {[key: string]: number[];},  // a map of the cell format function name to a list of column indexes e.g. `cell_format.formatNumber = [2,3,4]`
        row_format: ((row: HTMLElement, data /* row data */: {[key: string]: any}, index /* row index */: number) => void) | null, // A function to format the row (or null)
        sort: [number, string] // the column index to sort by, and sort method (asc or desc)
        }
    ) {

    let jqTable = $(tableElem);
    let jqContainer = $(containerElem);

    let visibleColumns = dataSetRoot.visible;
    let dataColumns = dataSetRoot.columns;
    let dataList = dataSetRoot.data;
    let searchableColumns = dataSetRoot.searchable;
    let searchSet = new Set<number>(searchableColumns); // faster
    let cell_format = dataSetRoot.cell_format;
    let row_format = dataSetRoot.row_format;
    let sort = dataSetRoot.sort;
    if (sort == null) sort = [0, 'asc'];

    // Convert the 2d array of cell data to an object list which maps the header name => cell data
    let dataObj: {}[] = [];
    dataList.forEach(function (row, index) {
        let obj: {[key: string]: any} = {}; // Add index signature
        for (let i = 0; i < dataColumns.length; i++) {
            obj[dataColumns[i]] = row[i];
        }
        dataObj.push(obj);
    });

    // Convert the cell format function names to their respective js functions
    let cellFormatByCol: { [key: number]: (data: number, type: any, row: any, meta: any) => void } = {};
    if (cell_format != null) {
        for (let func in cell_format) {
            let cols: number[] = cell_format[func];
            for (let col of cols) {
                let funcObj = (window as any)[func] as Function;
                cellFormatByCol[col] = funcObj as any;
                if (funcObj == null) {
                    console.log("No function found for " + func);
                }
            }
        }
    }

    // Convert the column names and format to the column info object (used by DataTables.js)
    let columnsInfo: { data: string, className?: string, render?: any, visible?: boolean }[] = [];
    if (dataColumns.length > 0) {
        for (let i = 0; i < dataColumns.length; i++) {
            let columnInfo: { orderDataType?: string, data: string; className: string; render?: any } = {data: dataColumns[i], className: 'details-control'};
            let renderFunc = cellFormatByCol[i];
            if (renderFunc != null) {
                columnInfo.render = renderFunc;
                if (renderFunc == (window as any).formatNumber || renderFunc == (window as any).formatMoney) {
                    columnInfo.orderDataType = 'numeric-comma';
                }
            }
            columnsInfo.push(columnInfo);
        }
    }

    // Set column visibility and add the search input to the header
    for(let i = 0; i < columnsInfo.length; i++) {
        let columnInfo = columnsInfo[i];
        let title = columnInfo["data"];
        if (visibleColumns != null) {
            columnInfo["visible"] = visibleColumns.includes(i) as boolean;
        }
        let th,tf;
        if (title == null) {
            th = '';
            tf = '';
        } else {
            if (searchableColumns == null || searchableColumns.includes(i)) {
                th = '<input type="text" placeholder="'+ title +'" style="width: 100%;" />';
            } else {
                th = title;
            }
            if (i != 0) {
                let color = columnInfo.visible ? "btn-outline-danger" : "btn-outline-info";
                tf = "<button class='toggle-vis btn btn-sm opacity-75 fw-bold ms-1 mb-1 " + color + "' data-column='" + i + "'>" + title + "</button>";
            } else {
                tf = '';
            }
        }
        jqTable.find("thead tr").append("<th>" + th + "</th>");
        let rows = jqTable.find("tfoot tr").append("<th>" + tf + "</th>");
        if (i != 0 && typeof columnInfo["visible"] === 'boolean' && columnInfo["visible"] === false) {
            let row = rows.children().last();
            let toggle = row.children().first();
            (toggle[0] as any).oldParent = row[0];
            toggle = jqContainer.find(".table-toggles").append(toggle);
        }
    }
    
    let table = (jqTable as any).DataTable( {
        // the array of column info
        columns: columnsInfo,
        // Allow column reordering (colReorder extension)
        colReorder: true,
        // the array of row objects to display
        data: dataObj,
        // Pagination
        paging: true,
        // Pagination settings
        lengthMenu: [ [10, 25, 50, 100, -1], [10, 25, 50, 100, "All"] ],
        // Render after initialization (faster)
        deferRender: true,
        // Disable ordering (faster)
        orderClasses: false,
        // Set default column sort
        order: [sort],
        // Set row formatting (i.e. coalition colors)
        createdRow: row_format,
        // Setup searchable dropdown for columns with unique values
        // Not used currently
        initComplete: function () {
            let that = this.api();
            that.columns().every( function (index: number) {
                if (!searchSet.has(index)) return;
                let column = that.column( index );
                let title = columnsInfo[index].data;
                if (title != null) {
                    let data = column.data();
                    let unique = data.unique();
                    let uniqueCount = unique.count();
                    if (uniqueCount > 1 && uniqueCount < 24 && uniqueCount < data.count() / 2) {
                        let select = $('<select><option value=""></option></select>')
                            .appendTo($(column.header()).empty() )
                            .on( 'change', function () {
                                let val = ($.fn as any).dataTable.util.escapeRegex(
                                    $(this).val()
                                );

                                column
                                    .search( val ? '^'+val+'$' : '', true, false )
                                    .draw();
                            });

                        unique.sort().each( function ( d: any, j: any ) {
                            select.append('<option value="'+d+'">'+d+'</option>' );
                        });

                        select.before(title + ": ");
                    }

                }
            });
        }
    });
        
    // Apply the search for input fields
    table.columns().every( function (index: number) {
        var column = table.column( index );
        let myInput = $( 'input', column.header() );
        myInput.on( 'keyup change clear', function () {
            if ( column.search() !== (this as any).value ) {
                column
                    .search((this as any).value )
                    .draw();
            }
        } );
        myInput.click(function(e) {
            e.stopPropagation();
         });
    });

    // Prevent the search input from triggering the row details toggle
    $("button").click(function(e) {
        e.stopPropagation();
     });

    // Handle clicking the show/hide column buttons
	jqContainer.find('.toggle-vis').on('click', function (e) {
		e.preventDefault();
		// Get the column API object
		let column = table.column( $(this).attr('data-column') );

		// Toggle the visibility
		column.visible(!column.visible());
		// move elem
		if (e.target.parentElement && e.target.parentElement.tagName == "TH") {
			(e.target as any).oldParent = e.target.parentElement;
            let toggles = jqContainer.find(".table-toggles");
			toggles.append(e.target);
            // find the input elem of toggles
            let inputElem = toggles.find('input');
            if(inputElem.val() && !e.target.textContent.includes(inputElem.val())) {
                $(e.target).addClass('d-none');
            }
		} else {
			(e.target as any).oldParent.append(e.target);
		}
        // get names of column names visible
        let visibleColumns = table.columns().indexes()
            .filter((idx: number) => table.column(idx).visible())
            .map((idx: number) => dataColumns[idx])
            .toArray();
        setQueryParam("columns", visibleColumns.join("."));
    });

    // Formatting function for row details
    // This displays the hidden columns as a table when a row is clicked
	function format (d: any) {
        let rows = "";
        table.columns().every( function (index: any) {
            let numFormat = [];
            if (cell_format.formatNumber != null) {
                numFormat.push(cell_format.formatNumber);
            }
            if (cell_format.formatMoney != null) {
                numFormat.push(cell_format.formatMoney);
            }
            let columnInfo = columnsInfo[index];
            let title = columnInfo["data"];
            if (title != null) {
                if (!table.column(index).visible()) {
                    let data = d[title];
                    if (numFormat.includes(index)) {
                        data = data.toLocaleString("en-US");
                    }
                    rows += '<tr>'+
                        '<td>' + title + '</td>'+
                        '<td>'+data+'</td>'+
                        '</tr>';
                }
            }
        });
        if (rows == "") rows = "No extra info";
        return '<table class="table table-striped table-bordered compact" cellspacing="0" border="0">'+rows+'</table>';
    }

    // Add event listener for opening and closing details (of the hidden columns table)
    jqTable.find('tbody').on('click', 'td.details-control', function () {
        let tr = $(this).closest('tr');
        let row = table.row( tr );

        if ( row.child.isShown() ) {
            // This row is already open - close it
            row.child.hide();
            tr.removeClass('shown');
        }
        else {
            // Open this row
            row.child( format(row.data()) ).show();
            tr.addClass('shown');
        }
    });
    // Show the table (faster to only display after setup)
    tableElem.classList.remove("d-none");
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