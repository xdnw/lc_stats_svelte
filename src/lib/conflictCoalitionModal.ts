import { modalWithCloseButton } from "./modals";

export type ConflictCoalitionModalAlliance = {
    id: number;
    name: string;
};

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function copyTextToClipboard(value: string): void {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
        return;
    }
    fallbackCopy(value);
}

function fallbackCopy(value: string): void {
    if (typeof document === "undefined") return;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand("copy");
    } finally {
        input.remove();
    }
}

export function openConflictCoalitionModal(options: {
    title: string;
    alliances: ConflictCoalitionModalAlliance[];
    titleHtml?: string;
}): void {
    const idsText = options.alliances.map((alliance) => alliance.id).join(",");
    const body = document.createElement("div");
    body.className = "position-relative";

    const idsBlock = document.createElement("div");
    idsBlock.className = "mb-2";

    const idsValue = document.createElement("kbd");
    idsValue.className = "form-control m-0 pe-5";
    idsValue.textContent = idsText;
    idsBlock.appendChild(idsValue);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className =
        "btn btn-outline-info btn-sm position-absolute top-0 end-0 m-3";
    copyButton.setAttribute("aria-label", "Copy alliance ids");
    copyButton.innerHTML = "<i class='bi bi-clipboard'></i>";
    copyButton.addEventListener("click", () => copyTextToClipboard(idsText));
    idsBlock.appendChild(copyButton);

    body.appendChild(idsBlock);

    const list = document.createElement("ul");
    list.className = "mb-0";
    options.alliances.forEach((alliance) => {
        const link = document.createElement("a");
        link.href = `https://politicsandwar.com/alliance/id=${alliance.id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = alliance.name;

        const item = document.createElement("li");
        item.appendChild(link);
        list.appendChild(item);
    });
    body.appendChild(list);

    modalWithCloseButton(options.titleHtml ?? escapeHtml(options.title), body);
}