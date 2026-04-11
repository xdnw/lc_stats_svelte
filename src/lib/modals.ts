import { htmlToElement } from "./misc";

let modalCounter = 0;
let activeModalCount = 0;
let savedBodyOverflow = "";

type RuntimeModalInstance = {
    show: () => void;
    hide: () => void;
    dispose: () => void;
};

type RuntimeModalElement = HTMLElement & {
    __lcModalController?: RuntimeModalInstance;
};

function lockBodyScroll(): void {
    if (activeModalCount === 0) {
        savedBodyOverflow = document.body.style.overflow;
        document.body.classList.add("modal-open");
        document.body.style.overflow = "hidden";
    }
    activeModalCount += 1;
}

function unlockBodyScroll(): void {
    if (activeModalCount === 0) return;
    activeModalCount -= 1;
    if (activeModalCount > 0) return;

    document.body.classList.remove("modal-open");
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = "";
}

function dispatchModalEvent(element: HTMLElement, eventName: string): void {
    element.dispatchEvent(new Event(eventName));
}

function focusModal(element: HTMLElement): void {
    const focusTarget = element.querySelector<HTMLElement>(
        ".btn-close, [data-bs-dismiss='modal'], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();
}

function nextModalIds() {
    modalCounter += 1;
    const suffix = `${Date.now()}-${modalCounter}`;
    return {
        modalId: `lc-modal-${suffix}`,
        labelId: `lc-modal-label-${suffix}`,
    };
}

export function modalStrWithCloseButton(title: string, bodyStr: string): void {
    const bodyElem = document.createElement("div");
    bodyElem.innerHTML = bodyStr;
    modalWithCloseButton(title, bodyElem);
}

export function modalWithCloseButton(title: string, body: HTMLElement): void {
    modal(
        title,
        body,
        `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`,
    );
}

export function modal(title: string, body: HTMLElement, footer: string): void {
    const { modalId, labelId } = nextModalIds();
    const html = `<div class="modal show d-block ux-runtime-modal" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${labelId}" aria-modal="true">
          <div class="modal-dialog">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="${labelId}"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body text-break"></div>
                  <div class="modal-footer"></div>
              </div>
          </div>
      </div>`;

    const createdModal = htmlToElement(html) as RuntimeModalElement;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop show ux-runtime-modal-backdrop";

    createdModal.getElementsByClassName("modal-title")[0].innerHTML = title;
    const modalBody = createdModal.getElementsByClassName("modal-body")[0];
    modalBody.innerHTML = "";
    modalBody.appendChild(body);
    createdModal.getElementsByClassName("modal-footer")[0].innerHTML = footer;

    let shown = false;
    let closed = false;

    const cleanup = () => {
        createdModal.removeEventListener("click", handleClick);
        createdModal.removeEventListener("keydown", handleKeyDown);
        createdModal.__lcModalController = undefined;
        backdrop.remove();
        createdModal.remove();
        if (shown) {
            shown = false;
            unlockBodyScroll();
        }
    };

    const runtimeModal: RuntimeModalInstance = {
        show() {
            if (shown || closed) return;
            dispatchModalEvent(createdModal, "show.bs.modal");
            lockBodyScroll();
            shown = true;
            document.body.append(backdrop, createdModal);
            dispatchModalEvent(createdModal, "shown.bs.modal");
            requestAnimationFrame(() => focusModal(createdModal));
        },
        hide() {
            if (closed) return;
            closed = true;
            dispatchModalEvent(createdModal, "hide.bs.modal");
            cleanup();
            dispatchModalEvent(createdModal, "hidden.bs.modal");
        },
        dispose() {
            if (closed) return;
            closed = true;
            cleanup();
        },
    };

    function handleClick(event: Event): void {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target === createdModal) {
            runtimeModal.hide();
            return;
        }
        if (target.closest("[data-bs-dismiss='modal']")) {
            runtimeModal.hide();
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.key !== "Escape") return;
        runtimeModal.hide();
    }

    createdModal.__lcModalController = runtimeModal;
    createdModal.addEventListener("click", handleClick);
    createdModal.addEventListener("keydown", handleKeyDown);
    runtimeModal.show();
}
