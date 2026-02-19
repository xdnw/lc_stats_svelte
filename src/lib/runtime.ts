import { formatDuration } from './formatting';

export function getConflictDataUrl(conflictId: string, version: number | string): string {
    return `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${version}`;
}

export function getConflictGraphDataUrl(conflictId: string, version: number | string): string {
    return `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/graphs/${conflictId}.gzip?${version}`;
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
