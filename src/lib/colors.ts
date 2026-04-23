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

type RgbTuple = [number, number, number];
type ParsedColorPalette = {
    [key in Palette]: RgbTuple[];
};

const PALETTE_COUNT = Object.keys(colorPalettes).length;

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

function parseRgbTuple(color: string): RgbTuple {
    const [r = 0, g = 0, b = 0] = color.split(',').map(Number);
    return [r, g, b];
}

const parsedColorPalettes: ParsedColorPalette = {
    [Palette.REDS]: colorPalettes[Palette.REDS].map(parseRgbTuple),
    [Palette.BLUES]: colorPalettes[Palette.BLUES].map(parseRgbTuple),
    [Palette.GREENS]: colorPalettes[Palette.GREENS].map(parseRgbTuple),
    [Palette.NEUTRALS]: colorPalettes[Palette.NEUTRALS].map(parseRgbTuple),
};

function formatRgbColor([r, g, b]: RgbTuple): string {
    return `rgb(${r}, ${g}, ${b})`;
}

function interpolateChannel(start: number, end: number, t: number): number {
    return Math.round(start + (end - start) * t);
}

function interpolatePaletteColor(colors: RgbTuple[], t: number): string {
    if (colors.length === 0) {
        return 'rgb(0, 0, 0)';
    }
    if (colors.length === 1) {
        return formatRgbColor(colors[0]);
    }

    const wrappedT = ((t % 1) + 1) % 1;
    const segmentPosition = wrappedT * colors.length;
    const startIndex = Math.floor(segmentPosition) % colors.length;
    const endIndex = (startIndex + 1) % colors.length;
    const localT = segmentPosition - Math.floor(segmentPosition);
    const start = colors[startIndex];
    const end = colors[endIndex];

    return formatRgbColor([
        interpolateChannel(start[0], end[0], localT),
        interpolateChannel(start[1], end[1], localT),
        interpolateChannel(start[2], end[2], localT),
    ]);
}

export function generateColors(n: number, palette: Palette): string[] {
    if (n <= 0) {
        return [];
    }

    const paletteColors = parsedColorPalettes[palette];
    const colors = new Array<string>(n);
    for (let i = 0; i < n; i++) {
        colors[i] = interpolatePaletteColor(paletteColors, i / n);
    }
    return colors;
}

export function generateColorsFromPalettes(palettes: Palette[]) {
    let countByPalette: number[] = new Array(PALETTE_COUNT).fill(0);
    for (const element of palettes) {
        countByPalette[element]++;
    }
    let colorsByPalette: string[][] = Array.from(
        { length: PALETTE_COUNT },
        () => [],
    );
    for (let palette = 0; palette < countByPalette.length; palette++) {
        let count = countByPalette[palette];
        if (count > 0) {
            let paletteColors = generateColors(count, palette as Palette);
            colorsByPalette[palette] = paletteColors;
        }
    }
    countByPalette.fill(0);
    let colors = new Array<string>(palettes.length);
    for (let i = 0; i < palettes.length; i++) {
        let palette = palettes[i];
        let j = countByPalette[palette]++;
        let paletteColors = colorsByPalette[palette];
        colors[i] = paletteColors[j];
    }
    return colors;
}
