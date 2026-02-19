import { getWindowGlobal, setWindowGlobal } from "./globals";

export type FormatterDeps = {
    commafy: (num: number) => string;
    formatDate: (data: number | null) => string;
    formatAllianceName: (
        name: string | null | undefined,
        id: number,
    ) => string;
    modalWithCloseButton: (title: string, body: HTMLElement) => void;
};

export function registerFormatters(deps: FormatterDeps): void {
    setWindowGlobal(
        "formatNumber",
        (data: number, _type: unknown, _row: unknown, _meta: unknown): string => {
            if (data == 0) return "0";
            if (data < 1000 && data > -1000) return data.toString();
            return deps.commafy(data);
        },
    );

    setWindowGlobal(
        "formatMoney",
        (data: number, _type: unknown, _row: unknown, _meta: unknown): string => {
            if (data == 0) return "$0";
            if (data < 1000 && data > -1000) return `$${data.toString()}`;
            return `$${deps.commafy(data)}`;
        },
    );

    setWindowGlobal(
        "formatDate",
        (data: number, _type: unknown, _row: unknown, _meta: unknown): string => {
            return deps.formatDate(data);
        },
    );

    setWindowGlobal("showNames", (coalitionName: string, index: number) => {
        const getIds = getWindowGlobal<
            (
                coalitionName: string,
                index: number,
            ) => { alliance_ids: number[]; alliance_names: string[] }
        >("getIds");
        if (!getIds) return;

        const col = getIds(coalitionName, index);
        const allianceIds = col.alliance_ids;
        const modalTitle = `Coalition ${index + 1}: ${coalitionName}`;

        const ul = document.createElement("ul");
        for (let i = 0; i < allianceIds.length; i++) {
            const allianceId = allianceIds[i];
            const allianceName = deps.formatAllianceName(
                col.alliance_names[i],
                allianceId,
            );
            const a = document.createElement("a");
            a.setAttribute("href", `https://politicsandwar.com/alliance/id=${allianceId}`);
            a.textContent = allianceName;
            const li = document.createElement("li");
            li.appendChild(a);
            ul.appendChild(li);
        }

        const modalBody = document.createElement("div");
        const areaElem = document.createElement("kbd");
        const idsStr = allianceIds.join(",");
        areaElem.textContent = idsStr;
        areaElem.setAttribute("readonly", "true");
        areaElem.setAttribute("class", "form-control m-0");
        modalBody.appendChild(areaElem);
        const copyToClipboard = `<button class='btn btn-outline-info btn-sm position-absolute top-0 end-0 m-3' onclick='copyToClipboard("${idsStr}")'><i class='bi bi-clipboard'></i></button>`;
        modalBody.innerHTML += copyToClipboard;
        modalBody.appendChild(ul);

        deps.modalWithCloseButton(modalTitle, modalBody);
    });

    setWindowGlobal("copyToClipboard", (data: string) => {
        navigator.clipboard
            .writeText(data)
            .then(() => {
                alert("Copied to clipboard");
            })
            .catch((error) => {
                alert("Failed to copy to clipboard" + error);
            });
    });
}
