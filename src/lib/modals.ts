import { getBootstrapModalInstance } from "./globals";

function htmlToElement(html: string): HTMLElement {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild as HTMLElement;
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
    const html = `<div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
          <div class="modal-dialog">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="exampleModalLabel"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body text-break"></div>
                  <div class="modal-footer"></div>
              </div>
          </div>
      </div>`;

    let createdModal = document.getElementById("exampleModal") as HTMLElement | null;

    if (createdModal == null) {
        createdModal = htmlToElement(html);
        document.body.appendChild(createdModal);
    }

    createdModal.getElementsByClassName("modal-title")[0].innerHTML = title;
    const modalBody = createdModal.getElementsByClassName("modal-body")[0];
    modalBody.innerHTML = "";
    modalBody.appendChild(body);
    createdModal.getElementsByClassName("modal-footer")[0].innerHTML = footer;

    const modalInstance = getBootstrapModalInstance(createdModal);
    modalInstance?.show();
}
