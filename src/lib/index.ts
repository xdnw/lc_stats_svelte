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
export * from './types';

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


