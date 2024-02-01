<script lang=ts>

function unhideParent(ele: HTMLElement) {
    if (((ele.parentNode as HTMLElement)?.parentNode as HTMLElement).style.display === "none") {
        ((ele.parentNode as HTMLElement).parentNode as HTMLElement).style.display = '';
        unhideParent(ele.parentNode as HTMLElement);
    }
}

function filterSearch(): void {
    let input: HTMLInputElement = document.getElementById("sb-s-i") as HTMLInputElement;
    let filter: string = input.value.toUpperCase();
    let ul: HTMLUListElement = document.getElementById("list") as HTMLUListElement;
    let tr: HTMLLIElement[] = Array.from(ul.getElementsByTagName("li"));
    for (let i = 0; i < tr.length; i++) {
        let search: HTMLAnchorElement = tr[i].getElementsByTagName("a")[0] as HTMLAnchorElement;
        let txtValue: string = search.textContent || search.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            tr[i].style.display = "";
            unhideParent(tr[i]);
        } else {
            tr[i].style.display = "none";
        }
    }
}

</script>
<nav id="sidebar" class="sidebar offcanvas-start offcanvas-md" tabindex="-1" role="dialog">
    <div class="offcanvas-header position-relative justify-content-start flex-shrink-0 py-0 mt-2">
        <a href="#top" class="visually-hidden-focusable btn btn-link fw-bold antialiased bg-body-secondary position-absolute top-50 end-0 translate-middle-y me-3 z-1">Skip to main content</a>
        <div class="col-auto ms-auto">
            <button type="button" class="btn-close d-md-none ms-1" data-bs-dismiss="offcanvas" aria-label="Close" data-bs-target="#sidebar"></button>
        </div>
    </div>
    <div class="offcanvas-body position-relative p-0" id="sidebarlist">
        <div class="filter-docs sticky-top p-3">
            <input type="text" id="sb-s-i" class="form-control search" placeholder="Filter pages" aria-label="Filter pages" on:keyup={() => filterSearch()}>
            <div class="mt-1">
                <small>Press <kbd class="text-body" style="font-size: 10px; background-color: hsla(var(--bs-emphasis-color-hsl), 0.1)">/</kbd> to focus</small>
            </div>
        </div>
    </div>
</nav>