type ModalController = {
    show: () => void;
    hide?: () => void;
    dispose?: () => void;
};

type ManagedModalElement = Element & {
    __lcModalController?: ModalController;
};

export function getVisGlobal<T = any>(): T | undefined {
    return window.vis as T | undefined;
}

export function setWindowGlobal<T>(name: string, value: T): void {
    (window as Record<string, unknown>)[name] = value;
}

export function getWindowGlobal<T>(name: string): T | undefined {
    return (window as Record<string, unknown>)[name] as T | undefined;
}

export function getModalController(
    element: Element | null,
): ModalController | null {
    if (!element) return null;
    const managedElement = element as ManagedModalElement;
    return managedElement.__lcModalController ?? null;
}
