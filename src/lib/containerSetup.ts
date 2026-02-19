import { setQueryParam } from './queryState';
import { setupContainer as setupContainerWithAdapter } from './tableAdapter';
import { ensureScriptsLoaded } from './runtime';
import { htmlToElement, uuidv4 } from './misc';
import { commafy } from './formatting';
import type { TableData } from './types';

export function setupContainer(container: HTMLElement, data: TableData) {
    return setupContainerWithAdapter(container, data, {
        uuidv4,
        htmlToElement,
        commafy,
        setQueryParam,
        ensureScriptsLoaded,
    });
}
