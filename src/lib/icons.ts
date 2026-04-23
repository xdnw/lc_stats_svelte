function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export type AppIconName =
    | "arrowLeft"
    | "book"
    | "bug"
    | "chat"
    | "checklist"
    | "chevronDown"
    | "clipboard"
    | "code"
    | "cube"
    | "document"
    | "download"
    | "externalLink"
    | "fileJson"
    | "filter"
    | "gamepad"
    | "infoCircle"
    | "mail"
    | "moon"
    | "search"
    | "shield"
    | "user";

type IconDefinition = {
    body: string;
    viewBox?: string;
};

const ICONS: Record<AppIconName, IconDefinition> = {
    arrowLeft: {
        body: '<path d="M19 12H5" /><path d="M11 18 5 12l6-6" />',
    },
    book: {
        body: '<path d="M7 5.5A3 3 0 0 1 10 3h8v15h-8a3 3 0 0 0-3 3Z" /><path d="M7 5.5V21" /><path d="M10 6h6" /><path d="M10 10h6" />',
    },
    bug: {
        body: '<path d="M9 7.5 8 6" /><path d="m15 7.5 1-1.5" /><rect x="8" y="8" width="8" height="8" rx="4" /><path d="M12 8V5" /><path d="M8 11H5" /><path d="M8 14H5" /><path d="M16 11h3" /><path d="M16 14h3" />',
    },
    chat: {
        body: '<path d="M6 7.5A3.5 3.5 0 0 1 9.5 4h5A3.5 3.5 0 0 1 18 7.5v4A3.5 3.5 0 0 1 14.5 15H10l-4 3v-3.8A3.4 3.4 0 0 1 6 14Z" />',
    },
    checklist: {
        body: '<path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /><path d="m10 12.5 1.4 1.4 2.6-3.1" /><path d="m10 17 1.4 1.4 2.6-3.1" />',
    },
    chevronDown: {
        body: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5" />',
    },
    clipboard: {
        body: '<rect x="7" y="6" width="10" height="13" rx="2" /><path d="M9 6.5V5A1.5 1.5 0 0 1 10.5 3.5h3A1.5 1.5 0 0 1 15 5v1.5" />',
    },
    code: {
        body: '<path d="m9 8-4 4 4 4" /><path d="m15 8 4 4-4 4" /><path d="M13.5 5 10.5 19" />',
    },
    cube: {
        body: '<path d="m12 3 7 4v10l-7 4-7-4V7Z" /><path d="m12 3-7 4 7 4 7-4" /><path d="M12 11v10" />',
    },
    document: {
        body: '<path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /><path d="M10 13h6" /><path d="M10 17h4" />',
    },
    download: {
        body: '<path d="M12 4v10" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19h14" />',
    },
    externalLink: {
        body: '<path d="M14 5h5v5" /><path d="M10 14 19 5" /><path d="M18 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />',
    },
    fileJson: {
        body: '<path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /><path d="M10 12q-2 2.5 0 5" /><path d="M14 17q2-2.5 0-5" /><path d="M12 12v5" />',
    },
    filter: {
        body: '<path d="M4.5 6h15l-6 7v4.5l-3 1.5V13Z" />',
    },
    gamepad: {
        body: '<rect x="4.5" y="8" width="15" height="8.5" rx="4.25" /><path d="M9 10.5v3" /><path d="M7.5 12h3" /><circle cx="15.5" cy="11.2" r="0.75" fill="currentColor" stroke="none" /><circle cx="17.6" cy="13.3" r="0.75" fill="currentColor" stroke="none" />',
    },
    infoCircle: {
        body: '<circle cx="12" cy="12" r="8.25" /><path d="M12 10v5" /><path d="M12 7.5h.01" />',
    },
    mail: {
        body: '<rect x="4" y="6" width="16" height="12" rx="2" /><path d="m4.5 7 7.5 5.5L19.5 7" />',
    },
    moon: {
        body: '<path d="M17 14.5A6.5 6.5 0 0 1 12.2 3 8.8 8.8 0 1 0 21 11.8 6.4 6.4 0 0 1 17 14.5Z" />',
    },
    search: {
        body: '<circle cx="11" cy="11" r="6.25" /><path d="m16 16 4 4" />',
    },
    shield: {
        body: '<path d="M12 3 18.5 6v5.5c0 3.9-2.4 7.4-6.5 9-4.1-1.6-6.5-5.1-6.5-9V6Z" /><path d="m9.5 12 2 2 3.5-4" />',
    },
    user: {
        body: '<circle cx="12" cy="8.5" r="3.5" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" />',
    },
};

export type RenderAppIconOptions = {
    className?: string;
    label?: string;
    size?: string;
};

export function renderAppIconSvg(
    name: AppIconName,
    options: RenderAppIconOptions = {},
): string {
    const definition = ICONS[name];
    const className = ["ux-icon", options.className].filter(Boolean).join(" ");
    const size = options.size ?? "1em";
    const aria = options.label
        ? `role="img" aria-label="${escapeHtml(options.label)}"`
        : 'aria-hidden="true" focusable="false"';

    return `<svg class="${escapeHtml(className)}" viewBox="${escapeHtml(definition.viewBox ?? "0 0 24 24")}" width="${escapeHtml(size)}" height="${escapeHtml(size)}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${aria}>${definition.body}</svg>`;
}
