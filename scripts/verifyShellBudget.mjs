#!/usr/bin/env node
/**
 * Static perf budget for the production build output.
 *
 * Asserts that the deferred-CSS shell split and route-level render-blocking
 * CSS cannot silently regress. Reads only `build/`; does not require a server.
 *
 * Run via `npm run verify:shell-budget` after `npm run build`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const BUILD_DIR = path.resolve("build");
const ASSET_DIR = path.join(BUILD_DIR, "_app", "immutable", "assets");

// Strip the per-build content hash so budgets are stable across builds.
// e.g. `0.BkpdXhYo.css` -> `0.css`, `app-shell-deferred.DJlAVqss.css` -> `app-shell-deferred.css`.
function stripHash(filename) {
  return filename.replace(/\.[A-Za-z0-9_-]{6,}\.css$/, ".css");
}

async function readAssets() {
  const entries = await fs.readdir(ASSET_DIR);
  const cssEntries = entries.filter((entry) => entry.endsWith(".css"));
  const byBaseName = new Map();
  for (const entry of cssEntries) {
    const base = stripHash(entry);
    const full = path.join(ASSET_DIR, entry);
    const stat = await fs.stat(full);
    byBaseName.set(base, { file: entry, size: stat.size, full });
  }
  return byBaseName;
}

async function readHtml(name) {
  const full = path.join(BUILD_DIR, name);
  return fs.readFile(full, "utf8");
}

// Returns array of { href, isThirdParty } for non-commented stylesheet links.
function extractStylesheetLinks(html) {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const links = [];
  const linkPattern = /<link\b([^>]*?)\/?>(?!<\/link)/gi;
  let match;
  while ((match = linkPattern.exec(stripped)) !== null) {
    const attrs = match[1];
    if (!/\brel\s*=\s*["']?stylesheet["']?/i.test(attrs)) continue;
    if (/\bmedia\s*=\s*["']print["']/i.test(attrs)) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const isThirdParty = /^https?:\/\//i.test(href);
    links.push({ href, isThirdParty });
  }
  return links;
}

function basenameFromHref(href) {
  const stripped = href.split(/[?#]/)[0];
  return stripHash(path.basename(stripped));
}

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

// --- Budgets ---------------------------------------------------------------

// Critical layout-root sheet (loaded by every route as render-blocking).
// Anything added back into this sheet directly regresses cold-load TBT on
// every route, so the budget is intentionally tight.
const CRITICAL_SHELL_BUDGET_BYTES = 26_000;

// Deferred app-shell sheet must exist, must stay below this budget, and must
// never be referenced by an HTML <link rel="stylesheet"> (it is loaded via
// onMount dynamic import in `+layout.svelte`).
const DEFERRED_SHELL_BUDGET_BYTES = 8_000;

// Allowed render-blocking stylesheet basenames per direct-entry route, plus
// a hard cap on total render-blocking CSS bytes for that route. Per-route
// chunk basenames like `3.css` come from SvelteKit numeric route nodes; if
// the numbering shifts the diff will surface here so we can re-confirm.
const ROUTE_BUDGETS = {
  "conflict.html": {
    label: "/conflict",
    allowed: new Set([
      "0.css",
      "Breadcrumbs.css",
      "ConflictRouteTabs.css",
      "ShareResetBar.css",
      "GridLoadingShell.css",
      "6.css",
      "conflict-shell.css",
    ]),
    maxRenderBlockingBytes: 37_000,
  },
  "aava.html": {
    label: "/aava",
    allowed: new Set([
      "0.css",
      "3.css",
      "conflict-shell.css",
      "conflict-widgets.css",
      "Breadcrumbs.css",
      "ConflictRouteTabs.css",
      "ShareResetBar.css",
      "GridLoadingShell.css",
    ]),
    maxRenderBlockingBytes: 40_000,
  },
};

// Routes that must never load a third-party render-blocking stylesheet.
const ROUTES_NO_THIRD_PARTY_CSS = [
  "conflict.html",
  "aava.html",
  "bubble.html",
  "tiering.html",
  "metric-time.html",
  "conflicts.html",
  "index.html",
];

// --- Run -------------------------------------------------------------------

const assets = await readAssets();

const critical = assets.get("0.css");
if (!critical) {
  fail("Missing critical shell sheet (expected `0.<hash>.css` in build assets)");
} else if (critical.size > CRITICAL_SHELL_BUDGET_BYTES) {
  fail(
    `Critical shell sheet ${critical.file} is ${critical.size} B, ` +
      `over budget ${CRITICAL_SHELL_BUDGET_BYTES} B. ` +
      `Move non-first-paint rules (forms, dropdowns, modals, btn-close) into app-shell-deferred.css.`,
  );
}

const deferred = assets.get("app-shell-deferred.css");
if (!deferred) {
  fail(
    "Missing deferred shell sheet `app-shell-deferred.<hash>.css`. " +
      "It must be loaded via onMount dynamic import in `src/routes/+layout.svelte`.",
  );
} else if (deferred.size > DEFERRED_SHELL_BUDGET_BYTES) {
  warn(
    `Deferred shell sheet ${deferred.file} is ${deferred.size} B, ` +
      `over soft budget ${DEFERRED_SHELL_BUDGET_BYTES} B. Audit before raising.`,
  );
}

// Walk every HTML file once: collect link sets and cross-check rules.
const htmlFiles = (await fs.readdir(BUILD_DIR)).filter((entry) => entry.endsWith(".html"));
const linksByHtml = new Map();
for (const htmlFile of htmlFiles) {
  const html = await readHtml(htmlFile);
  linksByHtml.set(htmlFile, extractStylesheetLinks(html));
}

// Deferred sheet must never be a render-blocking <link>.
if (deferred) {
  for (const [htmlFile, links] of linksByHtml) {
    for (const link of links) {
      if (basenameFromHref(link.href) === "app-shell-deferred.css") {
        fail(
          `${htmlFile} render-blocks app-shell-deferred.css; it must load via dynamic import in +layout.svelte.`,
        );
      }
    }
  }
}

// Third-party render-blocking CSS forbidden on listed routes.
for (const routeHtml of ROUTES_NO_THIRD_PARTY_CSS) {
  const links = linksByHtml.get(routeHtml);
  if (!links) continue;
  for (const link of links) {
    if (link.isThirdParty) {
      fail(
        `${routeHtml} render-blocks third-party stylesheet ${link.href}; ` +
          `defer it via lazy <link> injection alongside the related script.`,
      );
    }
  }
}

// Per-route allow-list and byte budget.
for (const [routeHtml, budget] of Object.entries(ROUTE_BUDGETS)) {
  const links = linksByHtml.get(routeHtml);
  if (!links) {
    fail(`${routeHtml}: missing from build output`);
    continue;
  }

  let totalBytes = 0;
  const unexpected = [];
  for (const link of links) {
    if (link.isThirdParty) continue; // already reported above
    const base = basenameFromHref(link.href);
    if (!budget.allowed.has(base)) {
      unexpected.push(base);
    }
    const asset = assets.get(base);
    if (asset) totalBytes += asset.size;
  }

  if (unexpected.length > 0) {
    fail(
      `${budget.label} (${routeHtml}) introduced unexpected render-blocking stylesheets: ` +
        `${unexpected.join(", ")}. Either lazy-load the owning component or update the budget allow-list with justification.`,
    );
  }

  if (totalBytes > budget.maxRenderBlockingBytes) {
    fail(
      `${budget.label} (${routeHtml}) render-blocking CSS total ${totalBytes} B ` +
        `exceeds budget ${budget.maxRenderBlockingBytes} B.`,
    );
  }
}

// --- Report ----------------------------------------------------------------

console.log(`shell-budget: critical ${critical?.size ?? "n/a"} B (budget ${CRITICAL_SHELL_BUDGET_BYTES} B)`);
console.log(`shell-budget: deferred ${deferred?.size ?? "missing"} B (soft budget ${DEFERRED_SHELL_BUDGET_BYTES} B)`);

for (const [routeHtml, budget] of Object.entries(ROUTE_BUDGETS)) {
  const links = linksByHtml.get(routeHtml) ?? [];
  let bytes = 0;
  for (const link of links) {
    if (link.isThirdParty) continue;
    const asset = assets.get(basenameFromHref(link.href));
    if (asset) bytes += asset.size;
  }
  console.log(
    `shell-budget: ${budget.label} render-blocking ${links.length} link(s), ${bytes} B (budget ${budget.maxRenderBlockingBytes} B)`,
  );
}

if (warnings.length > 0) {
  for (const message of warnings) console.warn(`warn: ${message}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(`error: ${message}`);
  process.exit(1);
}

console.log("shell-budget: ok");
