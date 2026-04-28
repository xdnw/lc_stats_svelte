import * as publicEnv from "$env/static/public";

const staticPublicEnv = publicEnv as Partial<
    Record<"PUBLIC_API_ORIGIN" | "PUBLIC_DATA_ORIGIN" | "PUBLIC_LEGACY_SEARCH_PAGE_ORIGIN", string>
>;

export type AppVersion = {
    conflicts: number;
    conflict_data: number;
    graph_data: number;
};

export type AppRoutes = {
    conflicts: string;
    conflict: string;
    aava: string;
    tiering: string;
    bubble: string;
    chord: string;
};

export type AppConfig = {
    application: string;
    admin_id: number;
    admin_nation: number;
    api_origin: string;
    legacy_search_page_origin: string;
    data_origin: string;
    discord_invite: string;
    email: string;
    repository_url: string;
    wiki_url: string;
    routes: AppRoutes;
    version: AppVersion;
};

const DEFAULT_API_ORIGIN = "https://api.locutus.link/api";
const DEFAULT_LEGACY_SEARCH_PAGE_ORIGIN = "https://api.locutus.link/page";
const DEFAULT_DATA_ORIGIN = "https://data.locutus.link";

function normalizeOrigin(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
        return fallback;
    }

    return trimmed.replace(/\/+$/, "");
}

function readPublicApiOrigin(): string | undefined {
    return staticPublicEnv.PUBLIC_API_ORIGIN;
}

function readPublicLegacySearchPageOrigin(): string | undefined {
    return staticPublicEnv.PUBLIC_LEGACY_SEARCH_PAGE_ORIGIN;
}

function normalizeDataOrigin(value?: string): string {
    return normalizeOrigin(value, DEFAULT_DATA_ORIGIN);
}

function readPublicDataOrigin(): string | undefined {
    return staticPublicEnv.PUBLIC_DATA_ORIGIN;
}

export const appRoutes: AppRoutes = {
    conflicts: "conflicts",
    conflict: "conflict",
    aava: "aava",
    tiering: "tiering",
    bubble: "bubble",
    chord: "chord",
};

export const appVersion: AppVersion = {
    conflicts: 1.2,
    conflict_data: 1.2,
    graph_data: 1.3,
};

export const appConfig: AppConfig = {
    application: "Locutus",
    admin_id: 664156861033086987,
    admin_nation: 189573,
    api_origin: normalizeOrigin(readPublicApiOrigin(), DEFAULT_API_ORIGIN),
    legacy_search_page_origin: normalizeOrigin(
        readPublicLegacySearchPageOrigin(),
        DEFAULT_LEGACY_SEARCH_PAGE_ORIGIN,
    ),
    data_origin: normalizeDataOrigin(readPublicDataOrigin()),
    discord_invite: "cUuskPDrB7",
    email: "jessepaleg@gmail.com",
    repository_url: "https://github.com/xdnw/locutus",
    wiki_url: "https://github.com/xdnw/locutus/wiki",
    routes: appRoutes,
    version: appVersion,
};
