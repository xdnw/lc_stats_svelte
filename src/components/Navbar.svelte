<script lang="ts">
  import { onMount } from "svelte";

  // Function to read cookie
  function readCookie(name: string) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === " ") {
        c = c.substring(1, c.length);
      }
      if (c.indexOf(nameEQ) === 0) {
        return c.substring(nameEQ.length, c.length);
      }
    }
    return null;
  }

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

  // function navsearch(): boolean {
  //     window.location.href = "${WebRoot.REDIRECT}/page/search/" + document.getElementById("navbar-search").value;
  //     return false;
  // }
</script>

<nav class="navbar navbar-expand-md border-bottom bg-body">
  <div class="container-fluid p-0 m-0">
    <div class="row d-flex w-100 p-0 m-0">
      <div class="col-auto p-0 pe-1">
        <div class="btn-group">
          <button
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#sidebar"
            class="btn btn btn-secondary d-md-none"
          >
            <i class="bi bi-layout-sidebar"></i>
          </button>
          <button
            class="btn btn btn-secondary d-md-block"
            aria-label="Toggle dark mode"
            on:click={() => toggleDarkMode()}
          >
            <i class="bi bi-moon-stars-fill" style="color:gray"></i>
          </button>
          <div class="d-inline text-truncate mt-1">
            <!-- @for (Map.Entry<String, String> entry : ws.getPathLinks().entrySet())
                            <span class="mx-1">/</span>
                            <a href="${entry.getValue()}/" class="simple-link fw-bold">${entry.getKey()}</a>
                        @endfor -->
          </div>
        </div>
      </div>
      <div class="col p-0">
        <form class="d-flex" role="search" id="navbar-search-form">
          <input
            id="navbar-search"
            class="form-control rounded-end-0"
            type="search"
            placeholder="Search pages..."
            aria-label="Search"
          />
          <button
            type="submit"
            class="btn btn-light text-nowrap rounded-start-0"
            ><i class="bi bi-search"></i></button
          >
        </form>
      </div>
      <div class="col-auto p-0 ps-1">
        <!-- @template.dropdown(ws = ws) -->
      </div>
    </div>
  </div>
</nav>
