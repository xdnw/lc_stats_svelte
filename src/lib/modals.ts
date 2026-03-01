import { getBootstrapModalInstance } from "./globals";
import { htmlToElement } from "./misc";

let modalCounter = 0;

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
    const html = `<div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${labelId}" aria-hidden="true">
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

    const createdModal = htmlToElement(html);
    document.body.appendChild(createdModal);

    createdModal.getElementsByClassName("modal-title")[0].innerHTML = title;
    const modalBody = createdModal.getElementsByClassName("modal-body")[0];
    modalBody.innerHTML = "";
    modalBody.appendChild(body);
    createdModal.getElementsByClassName("modal-footer")[0].innerHTML = footer;

    const modalInstance = getBootstrapModalInstance(createdModal);
    createdModal.addEventListener(
        "hidden.bs.modal",
        () => {
            (modalInstance as { dispose?: () => void } | null)?.dispose?.();
            createdModal.remove();
        },
        { once: true },
    );
    modalInstance?.show();
}
