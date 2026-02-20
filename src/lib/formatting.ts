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

export function formatTurnsToDate(value: number) {
    let timeMillis = (value / 12) * 60 * 60 * 24 * 1000;
    let date = new Date();
    date.setTime(timeMillis);
    let formattedDate = date.toISOString().slice(0, 16).replace("T", " ");
    return formattedDate.endsWith("00:00") ? formattedDate.slice(0, 10) : formattedDate;
}

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

export function formatNationName(name: string | null | undefined, id: number): string {
    const trimmed = (name ?? '').trim();
    return trimmed.length > 0 ? trimmed : `nation:${id}`;
}

export function normalizeAllianceIds(ids: Array<number | string | null | undefined>): number[] {
    return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
}
