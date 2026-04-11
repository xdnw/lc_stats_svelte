type BootstrapModalInstance = {
    show: () => void;
    hide?: () => void;
    dispose?: () => void;
};

type ManagedModalElement = Element & {
    __lcModalController?: BootstrapModalInstance;
};

export function getVisGlobal<T = any>(): T | undefined {
    return window.vis as T | undefined;
}

export function getPlotlyGlobal<T = any>(): T | undefined {
    return window.Plotly as T | undefined;
}

export function setWindowGlobal<T>(name: string, value: T): void {
    (window as Record<string, unknown>)[name] = value;
}

export function getWindowGlobal<T>(name: string): T | undefined {
    return (window as Record<string, unknown>)[name] as T | undefined;
}

export function getBootstrapModalInstance(
    element: Element | null,
): BootstrapModalInstance | null {
    if (!element) return null;
    const managedElement = element as ManagedModalElement;
    if (managedElement.__lcModalController) {
        return managedElement.__lcModalController;
    }
    const modalFactory = window.bootstrap?.Modal;
    if (!modalFactory) return null;
    return modalFactory.getOrCreateInstance(element) as BootstrapModalInstance;
}
