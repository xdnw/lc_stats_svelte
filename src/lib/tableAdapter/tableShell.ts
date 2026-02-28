import { resolveExportActions } from "$lib/exportActions";

export function getColumnToneClass(title: string | null | undefined): string {
    const normalized = (title ?? "").toLowerCase();
    if (normalized.includes("selected")) return "ux-col-selected";
    if (normalized.includes("compared") || normalized.includes("confirmed")) {
        return "ux-col-compared";
    }
    return "";
}

export function addTableShell(
    container: HTMLElement,
    id: string,
    htmlToElement: (html: string) => HTMLElement,
): void {
    const modalId = `tblColModal-${id}`;
    const dropdownId = `dropdownMenuButton-${id}`;

    const actionsHtml = resolveExportActions({ includeJson: false })
        .map((action) => {
            const isClipboard = action.target === "clipboard";
            return `<li><button class="dropdown-item fw-bold ux-export-btn" type="button" data-export-type="${action.format}" data-export-clipboard="${isClipboard}"><kbd><i class="bi ${action.icon}"></i></kbd> ${action.label}</button></li>`;
        })
        .join("");

    container.appendChild(
        htmlToElement(`<div class="ux-toolbar">
    <button class="btn ux-btn" type="button" data-bs-toggle="modal" data-bs-target="#${modalId}" aria-expanded="false" aria-controls="${modalId}">
    <i class="bi bi-layout-three-columns"></i>&nbsp;Customize Columns&nbsp;<i class="bi bi-chevron-down"></i></button>
    <div class="dropdown d-inline">
    <button class="btn ux-btn" type="button" id="${dropdownId}" data-bs-toggle="dropdown" aria-expanded="false">
    Export data&nbsp;<i class="bi bi-chevron-down"></i>
    </button>
    <ul class="dropdown-menu" aria-labelledby="${dropdownId}">
    ${actionsHtml}
    </ul>
    </div>
    </div>`),
    );
    container.appendChild(
        htmlToElement(`<div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="${modalId}-label">Customize Columns</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="ux-callout mb-2">
                    Search and toggle visible columns. Changes apply immediately.
                </div>
                <input class="form-control mb-2 ux-colmgr-search" type="search" placeholder="Search columns" aria-label="Search columns">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <button class="btn ux-btn btn-sm ux-colmgr-all" type="button">Show all</button>
                    <button class="btn ux-btn btn-sm ux-colmgr-none" type="button">Hide all</button>
                    <span class="small ux-muted ux-colmgr-count"></span>
                </div>
                <div class="ux-surface p-2 ux-colmgr-list" style="max-height:50vh;overflow:auto;"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>`),
    );
    container.appendChild(
        htmlToElement(`<div class="ux-table-wrap"><table id="${id}" class="bg-body-secondary border table compact table-bordered table-striped d-none" style="width:100%">
        <thead class="table-info"><tr></tr></thead>
        <tbody></tbody>
        <tfoot></tfoot>
    </table></div>`),
    );
}

export function bindExportActions(
    container: HTMLElement,
    onDownload?: (useClipboard: boolean, type: string) => void,
): void {
    const buttons = container.querySelectorAll<HTMLButtonElement>(".ux-export-btn");
    buttons.forEach((button) => {
        const type = button.dataset.exportType;
        const useClipboard = button.dataset.exportClipboard === "true";
        if (!onDownload || !type) {
            button.disabled = true;
            return;
        }
        button.disabled = false;
        button.addEventListener("click", () => {
            onDownload(useClipboard, type);
        });
    });
}
