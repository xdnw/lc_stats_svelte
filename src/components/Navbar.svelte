<script lang="ts">
  // Function to set cookie
  function setCookie(name: string, value: string, days: number) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  // Function to toggle dark mode and set cookie
  function toggleDarkMode() {
    var rootPreference = document.documentElement.getAttribute("data-bs-theme");
    if (rootPreference === "light" || rootPreference === null) {
      document.documentElement.setAttribute("data-bs-theme", "dark");
      setCookie("halfmoonColorMode", "dark", 365);
    } else {
      document.documentElement.setAttribute("data-bs-theme", "light");
      setCookie("halfmoonColorMode", "light", 365);
    }
  }

  const searchUrl = "https://api.locutus.link/page/search/";

  function handleSearch(event: Event) {
    event.preventDefault();
    const query = (document.getElementById("navbar-search") as HTMLInputElement)
      .value;
    window.location.href = `${searchUrl}${encodeURIComponent(query)}`;
  }
</script>

<nav
  class="navbar ux-navbar navbar-expand-md border-bottom bg-body-subtle shadow-sm sticky-top"
>
  <div class="container-fluid py-0">
    <div class="row d-flex w-100 g-0 align-items-center">
      <div class="col-auto">
        <div class="btn-group ux-surface p-0">
          <button
            class="btn ux-btn d-md-block"
            aria-label="Toggle dark mode"
            on:click={() => toggleDarkMode()}
          >
            <i class="bi bi-moon-stars-fill"></i>
          </button>
          <div class="d-inline text-truncate mt-0 ux-muted">
            <!-- @for (Map.Entry<String, String> entry : ws.getPathLinks().entrySet())
                            <span class="mx-1">/</span>
                            <a href="${entry.getValue()}/" class="simple-link fw-bold">${entry.getKey()}</a>
                        @endfor -->
          </div>
        </div>
      </div>
      <div class="col">
        <form
          class="d-flex ux-surface p-0"
          role="search"
          id="navbar-search-form"
          on:submit={handleSearch}
        >
          <input
            id="navbar-search"
            class="form-control border-0"
            type="search"
            placeholder="Search pages..."
            aria-label="Search"
          />
          <button
            type="submit"
            class="btn ux-btn ux-btn-primary text-nowrap"
            aria-label="Search"
          >
            <i class="bi bi-search"></i>
          </button>
        </form>
      </div>
      <div class="col-auto">
        <!-- @template.dropdown(ws = ws) -->
      </div>
    </div>
  </div>
</nav>
