import { appConfig } from './appConfig';
import { formatDuration } from './formatting';

function buildConflictDatasetUrl(path: string): string {
    return `${appConfig.data_origin}${path}`;
}

export function getConflictsIndexUrl(version: number | string): string {
    return buildConflictDatasetUrl(`/conflicts/index.gzip?${version}`);
}

export function getConflictDataUrl(conflictId: string, version: number | string): string {
    return buildConflictDatasetUrl(`/conflicts/${conflictId}.gzip?${version}`);
}

export function getConflictGraphDataUrl(conflictId: string, version: number | string): string {
    return buildConflictDatasetUrl(`/conflicts/graphs/${conflictId}.gzip?${version}`);
}

export function formatDatasetProvenance(version: number | string, updateMs?: number): string {
    let text = `Version: ${version}`;
    if (updateMs != null && !isNaN(updateMs)) {
        const secondsAgo = Math.max(0, Math.round((Date.now() - updateMs) / 1000));
        text += ` • Last updated ${formatDuration(secondsAgo)} ago`;
    }
    return text;
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
