import * as publicEnv from "$env/static/public";

const staticPublicEnv = publicEnv as Partial<Record<"PUBLIC_DATA_ORIGIN", string>>;

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
    data_origin: string;
    discord_invite: string;
    email: string;
    repository_url: string;
    wiki_url: string;
    routes: AppRoutes;
    version: AppVersion;
};

const DEFAULT_DATA_ORIGIN = "https://data.locutus.link";

function normalizeDataOrigin(value?: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
        return DEFAULT_DATA_ORIGIN;
    }

    return trimmed.replace(/\/+$/, "");
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
    data_origin: normalizeDataOrigin(readPublicDataOrigin()),
    discord_invite: "cUuskPDrB7",
    email: "jessepaleg@gmail.com",
    repository_url: "https://github.com/xdnw/locutus",
    wiki_url: "https://github.com/xdnw/locutus/wiki",
    routes: appRoutes,
    version: appVersion,
};
