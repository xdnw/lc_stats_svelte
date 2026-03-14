import { encodeCompositeSelectionIds } from "./conflictIds";
import { applyConflictReturnQuery, type ConflictReturnQuery } from "./conflictReturnQuery";

export type ConflictLayoutTab = "coalition" | "alliance" | "nation";

export type ConflictTab =
    | ConflictLayoutTab
    | "aava"
    | "tiering"
    | "bubble"
    | "chord";

export type ConflictRouteKind = "single" | "composite";

export type ConflictTabCapabilities = Partial<Record<ConflictTab, boolean>>;

export type ConflictTabHrefContext = {
    routeKind: ConflictRouteKind;
    conflictId?: string | null;
    compositeIds?: string[] | null;
    selectedAllianceId?: number | null;
    basePath?: string;
    preservedQuery?: ConflictReturnQuery | null;
};

export type ConflictTabDescriptor = {
    tab: ConflictTab;
    href: string | null;
    disabled: boolean;
    active: boolean;
};

export const CONFLICT_LAYOUT_TAB_INDEX: Record<ConflictLayoutTab, 0 | 1 | 2> = {
    coalition: 0,
    alliance: 1,
    nation: 2,
};

const TAB_ORDER: ConflictTab[] = [
    "coalition",
    "alliance",
    "nation",
    "aava",
    "tiering",
    "bubble",
    "chord",
];

const COMPOSITE_DEFAULT_CAPABILITIES: Record<ConflictTab, boolean> = {
    coalition: true,
    alliance: true,
    nation: true,
    aava: true,
    tiering: false,
    bubble: false,
    chord: false,
};

const SINGLE_DEFAULT_CAPABILITIES: Record<ConflictTab, boolean> = {
    coalition: true,
    alliance: true,
    nation: true,
    aava: true,
    tiering: true,
    bubble: true,
    chord: true,
};

function resolvePathname(urlOrSearchParams: URL | URLSearchParams): string | null {
    if (urlOrSearchParams instanceof URLSearchParams) return null;
    if (urlOrSearchParams instanceof URL) return urlOrSearchParams.pathname;
    return null;
}

function resolveSearchParams(urlOrSearchParams: URL | URLSearchParams): URLSearchParams {
    if (urlOrSearchParams instanceof URLSearchParams) return urlOrSearchParams;
    if (urlOrSearchParams instanceof URL) return urlOrSearchParams.searchParams;
    return new URLSearchParams();
}

function normalizeLayoutTab(layoutValue: string | null): ConflictLayoutTab {
    if (layoutValue === "alliance" || layoutValue === "1") return "alliance";
    if (layoutValue === "nation" || layoutValue === "2") return "nation";
    return "coalition";
}

export function isLayoutTab(tab: ConflictTab): tab is ConflictLayoutTab {
    return tab === "coalition" || tab === "alliance" || tab === "nation";
}

export function layoutTabFromIndex(layout: number): ConflictLayoutTab {
    if (layout === 1) return "alliance";
    if (layout === 2) return "nation";
    return "coalition";
}

export function resolveLayoutTabFromUrl(
    urlOrSearchParams: URL | URLSearchParams,
): ConflictLayoutTab {
    return normalizeLayoutTab(resolveSearchParams(urlOrSearchParams).get("layout"));
}

export function resolveActiveTabFromUrl(
    urlOrSearchParams: URL | URLSearchParams,
    routeKind: ConflictRouteKind,
): ConflictTab {
    const pathname = resolvePathname(urlOrSearchParams);
    if (pathname) {
        if (pathname.endsWith("/aava")) return "aava";
        if (pathname.endsWith("/tiering")) return "tiering";
        if (pathname.endsWith("/bubble")) return "bubble";
        if (pathname.endsWith("/chord")) return "chord";
        if (pathname.endsWith("/conflict") || pathname.endsWith("/conflicts/view")) {
            return resolveLayoutTabFromUrl(urlOrSearchParams);
        }
    }

    if (routeKind === "single" || routeKind === "composite") {
        return resolveLayoutTabFromUrl(urlOrSearchParams);
    }

    return "coalition";
}

function normalizeBase(basePath?: string): string {
    if (!basePath) return "";
    return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function hasSingleContext(context: ConflictTabHrefContext): boolean {
    return context.routeKind === "single" && (context.conflictId ?? "").trim().length > 0;
}

function hasCompositeContext(context: ConflictTabHrefContext): boolean {
    return (
        context.routeKind === "composite" &&
        Array.isArray(context.compositeIds) &&
        context.compositeIds.length >= 2 &&
        Number.isFinite(context.selectedAllianceId) &&
        (context.selectedAllianceId ?? 0) > 0
    );
}

function withPreservedQuery(
    path: string,
    context: ConflictTabHrefContext,
    routeParams: Record<string, string | number | null | undefined>,
    options?: { namespaceConflictLayoutState?: boolean },
): string {
    const search = new URLSearchParams();

    if (options?.namespaceConflictLayoutState) {
        applyConflictReturnQuery(search, context.preservedQuery);
    } else {
        for (const [key, value] of Object.entries(context.preservedQuery ?? {})) {
            if (value == null || value === "") continue;
            search.set(key, value);
        }
    }

    for (const [key, value] of Object.entries(routeParams)) {
        if (value == null || value === "") {
            search.delete(key);
            continue;
        }
        search.set(key, String(value));
    }

    const query = search.toString();
    return query ? `${path}?${query}` : path;
}

export function buildTabHref(tab: ConflictTab, context: ConflictTabHrefContext): string | null {
    const prefix = normalizeBase(context.basePath);

    if (context.routeKind === "composite") {
        if (!hasCompositeContext(context)) return null;
        const ids = encodeCompositeSelectionIds(context.compositeIds ?? []);
        const aid = context.selectedAllianceId;
        if (tab === "coalition" || tab === "alliance" || tab === "nation") {
            return withPreservedQuery(`${prefix}/conflicts/view`, context, {
                ids,
                aid,
                layout: tab,
            });
        }
        return withPreservedQuery(
            `${prefix}/${tab}`,
            context,
            {
                ids,
                aid,
            },
            { namespaceConflictLayoutState: true },
        );
    }

    if (!hasSingleContext(context)) return null;
    const conflictId = context.conflictId?.trim();
    if (!conflictId) return null;
    if (tab === "coalition" || tab === "alliance" || tab === "nation") {
        return withPreservedQuery(`${prefix}/conflict`, context, {
            id: conflictId,
            layout: tab,
        });
    }
    return withPreservedQuery(
        `${prefix}/${tab}`,
        context,
        {
            id: conflictId,
        },
        { namespaceConflictLayoutState: true },
    );
}

export function resolveDisabledTabs(
    capabilities: ConflictTabCapabilities,
    routeKind: ConflictRouteKind,
): ConflictTab[] {
    const defaults = routeKind === "composite"
        ? COMPOSITE_DEFAULT_CAPABILITIES
        : SINGLE_DEFAULT_CAPABILITIES;
    return TAB_ORDER.filter((tab) => {
        const resolved = capabilities[tab] ?? defaults[tab];
        return resolved === false;
    });
}

export function buildConflictTabDescriptors(input: {
    activeTab: ConflictTab;
    routeKind: ConflictRouteKind;
    capabilities?: ConflictTabCapabilities;
    hrefContext: ConflictTabHrefContext;
    disabledTabs?: ConflictTab[];
}): ConflictTabDescriptor[] {
    const resolvedDisabled = new Set<ConflictTab>([
        ...resolveDisabledTabs(input.capabilities ?? {}, input.routeKind),
        ...(input.disabledTabs ?? []),
    ]);

    return TAB_ORDER.map((tab) => {
        const href = buildTabHref(tab, input.hrefContext);
        const disabled = resolvedDisabled.has(tab) || href == null;
        return {
            tab,
            href,
            disabled,
            active: tab === input.activeTab,
        };
    });
}