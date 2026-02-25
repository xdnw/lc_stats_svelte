export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function htmlToElement(html: string): HTMLElement {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild as HTMLElement;
}

export function arrayEquals(a: any[], b: any[]) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

type SchedulerLike = {
    yield?: () => Promise<void>;
};

type IdleWindow = Window & {
    requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
    ) => number;
};

/**
 * Run a callback when the browser is idle, with a timeout fallback for older engines.
 */
export function scheduleWhenIdle(
    callback: () => void,
    options?: { timeout?: number; fallbackDelayMs?: number },
): number {
    const timeout = options?.timeout ?? 2500;
    const fallbackDelayMs = options?.fallbackDelayMs ?? 300;
    const idleWindow = window as IdleWindow;
    if (typeof idleWindow.requestIdleCallback === "function") {
        return idleWindow.requestIdleCallback(callback, { timeout });
    }
    return window.setTimeout(callback, fallbackDelayMs);
}

/**
 * Yield control to the browser so it can paint pending UI changes (e.g. skeletons).
 * Prefer scheduler.yield() (Chrome 129+), fall back to a rAF+setTimeout combo.
 */
export function yieldToMain(): Promise<void> {
    const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
    if (typeof scheduler?.yield === 'function') {
        return scheduler.yield();
    }
    return new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });
}
