import { formatDuration } from './formatting';

type ScriptManifestEntry = {
    src: string;
};

type StyleManifestEntry = {
    href: string;
};

const scriptManifest: Record<string, ScriptManifestEntry> = {
    jqjs: {
        src: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
    },
    dtjs1: {
        src: 'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js',
    },
    dtjs2: {
        src: 'https://cdn.datatables.net/colreorder/1.7.0/js/dataTables.colReorder.min.js',
    },
    dtjs3: {
        src: 'https://cdn.datatables.net/plug-ins/1.13.7/sorting/numeric-comma.js',
    },
    plotjs: {
        src: 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.29.1/plotly.min.js',
    },
};

const styleManifest: Record<string, StyleManifestEntry> = {
    dtcss1: {
        href: 'https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css',
    },
    dtcss2: {
        href: 'https://cdn.datatables.net/colreorder/1.7.0/css/colReorder.dataTables.min.css',
    },
};

const scriptLoadPromises = new Map<string, Promise<void>>();
const styleLoadPromises = new Map<string, Promise<void>>();

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

function resolveScriptElement(scriptId: string): HTMLScriptElement | null {
    const existing = document.getElementById(scriptId);
    if (existing instanceof HTMLScriptElement) {
        return existing;
    }

    const manifestEntry = scriptManifest[scriptId];
    if (!manifestEntry) return null;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = manifestEntry.src;
    script.defer = true;
    script.async = false;
    document.head.appendChild(script);
    return script;
}

function ensureSingleScriptLoaded(scriptId: string): Promise<void> {
    const cached = scriptLoadPromises.get(scriptId);
    if (cached) return cached;

    const script = resolveScriptElement(scriptId);
    if (!script) {
        return Promise.reject(new Error(`Script element with id ${scriptId} not found`));
    }

    if (script.hasAttribute('data-loaded')) {
        return Promise.resolve();
    }

    const pending = new Promise<void>((resolve, reject) => {
        const onLoad = () => {
            script.setAttribute('data-loaded', 'true');
            scriptLoadPromises.delete(scriptId);
            resolve();
        };

        const onError = () => {
            scriptLoadPromises.delete(scriptId);
            reject(new Error(`Failed to load script ${scriptId}`));
        };

        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
    });

    scriptLoadPromises.set(scriptId, pending);
    return pending;
}

function resolveStyleElement(styleId: string): HTMLLinkElement | null {
    const existing = document.getElementById(styleId);
    if (existing instanceof HTMLLinkElement) {
        return existing;
    }

    const manifestEntry = styleManifest[styleId];
    if (!manifestEntry) return null;

    const styleLink = document.createElement('link');
    styleLink.id = styleId;
    styleLink.rel = 'stylesheet';
    styleLink.href = manifestEntry.href;
    document.head.appendChild(styleLink);
    return styleLink;
}

function ensureSingleStyleLoaded(styleId: string): Promise<void> {
    const cached = styleLoadPromises.get(styleId);
    if (cached) return cached;

    const styleLink = resolveStyleElement(styleId);
    if (!styleLink) {
        return Promise.reject(new Error(`Style element with id ${styleId} not found`));
    }

    if (styleLink.hasAttribute('data-loaded')) {
        return Promise.resolve();
    }

    const pending = new Promise<void>((resolve, reject) => {
        const onLoad = () => {
            styleLink.setAttribute('data-loaded', 'true');
            styleLoadPromises.delete(styleId);
            resolve();
        };

        const onError = () => {
            styleLoadPromises.delete(styleId);
            reject(new Error(`Failed to load stylesheet ${styleId}`));
        };

        styleLink.addEventListener('load', onLoad, { once: true });
        styleLink.addEventListener('error', onError, { once: true });
    });

    styleLoadPromises.set(styleId, pending);
    return pending;
}

export function ensureScriptsLoaded(scriptIds: string[]): Promise<void> {
    return scriptIds.reduce<Promise<void>>((chain, scriptId) => {
        return chain.then(() => ensureSingleScriptLoaded(scriptId));
    }, Promise.resolve());
}

export function ensureStylesLoaded(styleIds: string[]): Promise<void> {
    return styleIds.reduce<Promise<void>>((chain, styleId) => {
        return chain.then(() => ensureSingleStyleLoaded(styleId));
    }, Promise.resolve());
}

export function markScriptAsLoaded(scriptId: string): void {
    const script = document.getElementById(scriptId);
    if (script instanceof HTMLScriptElement) {
        script.setAttribute('data-loaded', 'true');
    }
}

export function markStyleAsLoaded(styleId: string): void {
    const style = document.getElementById(styleId);
    if (style instanceof HTMLLinkElement) {
        style.setAttribute('data-loaded', 'true');
    }
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
