<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";

  let searchQuery = "";
  let isDarkMode = false;

  function setCookie(name: string, value: string, days: number) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  function syncThemeState(): void {
    isDarkMode = document.documentElement.getAttribute("data-bs-theme") === "dark";
  }

  function toggleDarkMode() {
    syncThemeState();
    const nextTheme = isDarkMode ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", nextTheme);
    setCookie("halfmoonColorMode", nextTheme, 365);
    syncThemeState();
  }

  const searchUrl = "https://api.locutus.link/page/search/";

  function handleSearch(event: Event) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    window.location.href = `${searchUrl}${encodeURIComponent(query)}`;
  }

  onMount(() => {
    syncThemeState();
  });
</script>

<nav class="navbar ux-navbar border-bottom bg-body-subtle">
  <div class="container-fluid py-0">
    <div class="ux-navbar-shell">
      <button
        class="btn ux-navbar-theme"
        type="button"
        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={isDarkMode}
        title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        on:click={toggleDarkMode}
      >
        <Icon name="moon" />
      </button>

      <form
        class="ux-navbar-search"
        role="search"
        id="navbar-search-form"
        on:submit={handleSearch}
      >
        <input
          id="navbar-search"
          class="form-control ux-navbar-search-input"
          type="search"
          placeholder="Search pages"
          aria-label="Search pages"
          bind:value={searchQuery}
        />
        <button
          type="submit"
          class="btn ux-navbar-search-button"
          aria-label="Search"
        >
          Search
        </button>
      </form>
    </div>
  </div>
</nav>

<style>
  .ux-navbar-shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.5rem;
    align-items: center;
    padding: 0.28rem 0;
  }

  .ux-navbar-theme {
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: var(--ux-radius-sm) !important;
    border: 1px solid color-mix(in srgb, var(--ux-border) 92%, var(--ux-text-muted));
    background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
  }

  .ux-navbar-theme:hover {
    background: color-mix(in srgb, var(--ux-brand) 8%, var(--ux-surface));
  }

  .ux-navbar-search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    align-items: stretch;
  }

  .ux-navbar-search-input {
    min-height: 2rem;
    font-size: var(--ux-text-md);
    border-top-right-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
  }

  .ux-navbar-search-button {
    min-height: 2rem;
    padding-inline: 0.72rem;
    border: 1px solid color-mix(in srgb, var(--ux-border) 92%, var(--ux-text-muted));
    border-left: 0;
    border-top-left-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
    border-top-right-radius: var(--ux-radius-sm) !important;
    border-bottom-right-radius: var(--ux-radius-sm) !important;
    background: color-mix(in srgb, var(--ux-surface) 96%, transparent);
    color: var(--ux-text);
    font-size: var(--ux-text-md);
    font-weight: 500;
  }

  .ux-navbar-search-button:hover {
    background: color-mix(in srgb, var(--ux-brand) 8%, var(--ux-surface));
  }

  @media (max-width: 640px) {
    .ux-navbar-shell {
      gap: 0.4rem;
    }

    .ux-navbar-search-button {
      padding-inline: 0.65rem;
    }
  }
</style>
