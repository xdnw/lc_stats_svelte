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
    discord_invite: string;
    email: string;
    repository_url: string;
    wiki_url: string;
    routes: AppRoutes;
    version: AppVersion;
};

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
    graph_data: 1.2,
};

export const appConfig: AppConfig = {
    application: "Locutus",
    admin_id: 664156861033086987,
    admin_nation: 189573,
    discord_invite: "cUuskPDrB7",
    email: "jessepaleg@gmail.com",
    repository_url: "https://github.com/xdnw/locutus",
    wiki_url: "https://github.com/xdnw/locutus/wiki",
    routes: appRoutes,
    version: appVersion,
};