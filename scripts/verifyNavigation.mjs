import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const buildDir = path.resolve('build');
const overallTimeoutMs = 90000;
const perfEventTimeoutMs = 45000;
const shouldReportColdLoadPerf = process.argv.includes('--report-perf');
const PERF_EVENT_LIMIT = 12;
const fatalAlertPatterns = [
  /could not load/i,
  /missing conflict/i,
  /failed to load/i,
  /select an alliance to build/i,
  /no alliance appears/i,
  /composite conflict cannot be built/i,
];

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRouteContext(baseUrl) {
  const parsed = new URL(baseUrl);
  const urlPathBase = parsed.pathname === '/' ? '' : normalizeBasePath(parsed.pathname);
  const envBasePath = normalizeBasePath(process.env.BASE_PATH ?? '');
  const routeBasePath = urlPathBase || envBasePath;
  const origin = parsed.origin;

  return {
    routeBasePath,
    hrefBaseUrl: `${origin}${routeBasePath || ''}/`,
    buildUrl(routePath) {
      return `${origin}${routeBasePath}${routePath}`;
    },
    routePattern(routePathPattern) {
      return new RegExp(`${escapeRegExp(routeBasePath)}${routePathPattern}`);
    },
  };
}

function normalizeAlertText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function matchesAnyPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function summarizePerfEvents(events) {
  const summary = new Map();

  for (const event of events) {
    if (!event?.name || typeof event.durationMs !== 'number') continue;
    const bucket = summary.get(event.name) ?? {
      name: event.name,
      totalMs: 0,
      maxMs: 0,
      count: 0,
      tags: event.tags ?? null,
    };
    bucket.totalMs += event.durationMs;
    bucket.maxMs = Math.max(bucket.maxMs, event.durationMs);
    bucket.count += 1;
    summary.set(event.name, bucket);
  }

  return Array.from(summary.values())
    .map((bucket) => ({
      ...bucket,
      totalMs: roundMs(bucket.totalMs),
      maxMs: roundMs(bucket.maxMs),
    }))
    .sort((left, right) =>
      right.totalMs - left.totalMs || right.maxMs - left.maxMs || left.name.localeCompare(right.name),
    );
}

function summarizePerfCounters(counters) {
  const summary = new Map();

  for (const counter of counters) {
    if (!counter?.name || typeof counter.value !== 'number') continue;
    summary.set(counter.name, (summary.get(counter.name) ?? 0) + counter.value);
  }

  return Array.from(summary.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

async function readPerfReportSnapshot(page) {
  return page.evaluate(() => {
    const perf = window.__lcPerf?.snapshot?.() ?? { events: [], counters: [] };
    const navigation = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
    }));

    return {
      perf,
      navigation: navigation
        ? {
            responseEndMs: navigation.responseEnd,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            loadMs: navigation.loadEventEnd,
          }
        : null,
      paints,
    };
  });
}

async function waitForPerfEvent(page, eventName) {
  if (!eventName) return;
  const deadline = Date.now() + perfEventTimeoutMs;

  while (Date.now() < deadline) {
    const hasEvent = await page.evaluate(
      (targetEventName) =>
        window.__lcPerf?.snapshot?.().events?.some((event) => event?.name === targetEventName) ?? false,
      eventName,
    );
    if (hasEvent) return;
    await page.waitForTimeout(50);
  }

  const seenEvents = await page.evaluate(
    () => window.__lcPerf?.snapshot?.().events?.map((event) => event?.name ?? '') ?? [],
  );
  throw new Error(
    `Timed out waiting for perf event ${eventName}. Seen events: ${seenEvents.join(', ') || '(none)'}`,
  );
}

function buildPerfReport(route, readyDurationMs, snapshot) {
  const events = snapshot.perf.events.filter((event) =>
    matchesAnyPrefix(event?.name ?? '', route.perfEventPrefixes),
  );
  const counters = snapshot.perf.counters.filter((counter) =>
    matchesAnyPrefix(counter?.name ?? '', route.perfCounterPrefixes),
  );

  return {
    label: route.label,
    routePath: route.routePath,
    readyDurationMs: roundMs(readyDurationMs),
    navigation: snapshot.navigation
      ? {
          responseEndMs: roundMs(snapshot.navigation.responseEndMs),
          domContentLoadedMs: roundMs(snapshot.navigation.domContentLoadedMs),
          loadMs: roundMs(snapshot.navigation.loadMs),
        }
      : null,
    paints: snapshot.paints.map((paint) => ({
      name: paint.name,
      startTimeMs: roundMs(paint.startTime),
    })),
    events: summarizePerfEvents(events),
    counters: summarizePerfCounters(counters),
  };
}

function printPerfReport(report) {
  const navSummary = report.navigation
    ? ` responseEnd=${report.navigation.responseEndMs}ms domContentLoaded=${report.navigation.domContentLoadedMs}ms load=${report.navigation.loadMs}ms`
    : '';
  const paintSummary = report.paints.length > 0
    ? ` paints=${report.paints.map((paint) => `${paint.name}:${paint.startTimeMs}ms`).join(', ')}`
    : '';
  console.log(`[perf] ${report.label} ${report.routePath} ready=${report.readyDurationMs}ms${navSummary}${paintSummary}`);

  for (const event of report.events.slice(0, PERF_EVENT_LIMIT)) {
    const tagSummary = event.tags
      ? ` tags=${Object.entries(event.tags)
          .filter(([, value]) => value != null)
          .map(([key, value]) => `${key}:${value}`)
          .join(',')}`
      : '';
    console.log(
      `[perf]   event ${event.name} total=${event.totalMs}ms count=${event.count} max=${event.maxMs}ms${tagSummary}`,
    );
  }

  if (report.counters.length > 0) {
    console.log(
      `[perf]   counters ${report.counters.map((counter) => `${counter.name}=${counter.value}`).join(', ')}`,
    );
  }
}

function isFatalAlertText(text) {
  return fatalAlertPatterns.some((pattern) => pattern.test(text));
}

function conflictIdFromHref(href, baseUrl) {
  if (!href) return null;
  try {
    const url = new URL(href, baseUrl);
    const value = url.searchParams.get('id');
    return value && /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function resolveStaticPath(requestPath) {
  const sanitizedPath = decodeURIComponent(requestPath.split('?')[0] || '/');
  const normalizedPath = sanitizedPath === '/' ? '/index.html' : sanitizedPath;
  const directPath = path.join(buildDir, normalizedPath);
  const htmlPath = path.join(buildDir, `${normalizedPath}.html`);
  const folderIndexPath = path.join(buildDir, normalizedPath, 'index.html');
  const candidates = [directPath, htmlPath, folderIndexPath];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(buildDir)) continue;
    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) return resolved;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function createStaticBuildServer() {
  try {
    const stat = await fs.stat(buildDir);
    if (!stat.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new Error('Static build output is missing. Run `npm run build` before `npm run verify:navigation`.');
  }

  const server = createServer(async (request, response) => {
    const requestPath = request.url ?? '/';
    const resolvedPath = await resolveStaticPath(requestPath);

    if (!resolvedPath) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Not found');
      return;
    }

    try {
      const body = await fs.readFile(resolvedPath);
      response.statusCode = 200;
      response.setHeader(
        'Content-Type',
        contentTypes.get(path.extname(resolvedPath).toLowerCase()) ?? 'application/octet-stream',
      );
      response.end(body);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(error instanceof Error ? error.message : 'Server error');
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not determine the local verification server address.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

function attachPageErrors(page, label) {
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(`[${label}] ${error.message}`);
  });
  return pageErrors;
}

async function clearPerfSnapshot(page) {
  await page.evaluate(() => {
    window.__lcPerf?.clear?.();
  });
}

async function assertWarmNavigationSnapshot(page, expectations, label) {
  const snapshot = await page.evaluate(() => window.__lcPerf?.snapshot?.() ?? { events: [], counters: [] });
  const countCounter = (name) => snapshot.counters.filter((counter) => counter?.name === name).length;

  if (countCounter('decompress.cache.miss') !== 0) {
    throw new Error(`${label} still triggered a decompression cache miss on the visible path.`);
  }

  if (countCounter(expectations.cacheHit) < 1 && countCounter(expectations.cachePending) < 1) {
    throw new Error(`${label} did not attach to warmed derived state on the visible path.`);
  }

  if (countCounter(expectations.cacheMiss) !== 0) {
    throw new Error(`${label} still missed the derived cache on the visible path.`);
  }
}

async function assertNoPerfEvent(page, eventName, label) {
  const snapshot = await page.evaluate(() => window.__lcPerf?.snapshot?.() ?? { events: [], counters: [] });
  if (snapshot.events.some((event) => event?.name === eventName)) {
    throw new Error(`${label} recreated ${eventName} instead of attaching to warmed state.`);
  }
}

async function assertNoPerfActivity(page, options, label) {
  const snapshot = await page.evaluate(() => window.__lcPerf?.snapshot?.() ?? { events: [], counters: [] });
  const matchedEvent = snapshot.events.find((event) =>
    options.eventNames?.includes(event?.name) ||
    options.eventPrefixes?.some((prefix) => (event?.name ?? '').startsWith(prefix)),
  );
  if (matchedEvent) {
    throw new Error(`${label} unexpectedly recorded perf event ${matchedEvent.name}.`);
  }

  const matchedCounter = snapshot.counters.find((counter) =>
    options.counterNames?.includes(counter?.name) ||
    options.counterPrefixes?.some((prefix) => (counter?.name ?? '').startsWith(prefix)),
  );
  if (matchedCounter) {
    throw new Error(`${label} unexpectedly recorded perf counter ${matchedCounter.name}.`);
  }
}

async function readBubbleCanvasSnapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.bubble-chart-stage canvas');
    const timelineDate = document.querySelector('.bubble-timeline-status-date')?.textContent?.trim() ?? null;
    const timelineCount = document.querySelector('.bubble-timeline-status-count')?.textContent?.trim() ?? null;
    const playButton = document.querySelector('.bubble-timeline-button');

    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        hasCanvas: false,
        timelineDate,
        timelineCount,
        playDisabled: playButton instanceof HTMLButtonElement ? playButton.disabled : null,
      };
    }

    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    let nonTransparentSamples = 0;
    if (context && canvas.width > 0 && canvas.height > 0) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const totalPixels = Math.max(1, Math.floor(data.length / 4));
      const pixelStride = Math.max(1, Math.floor(totalPixels / 20000));
      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += pixelStride) {
        const alpha = data[pixelIndex * 4 + 3] ?? 0;
        if (alpha > 0) {
          nonTransparentSamples += 1;
        }
      }
    }

    return {
      hasCanvas: true,
      width: canvas.width,
      height: canvas.height,
      rectWidth: rect.width,
      rectHeight: rect.height,
      nonTransparentSamples,
      timelineDate,
      timelineCount,
      playDisabled: playButton instanceof HTMLButtonElement ? playButton.disabled : null,
    };
  });
}

async function assertBubbleCanvasRendered(page, label) {
  const snapshot = await readBubbleCanvasSnapshot(page);

  if (!snapshot.hasCanvas) {
    throw new Error(`${label} did not render a bubble canvas element.`);
  }

  if (snapshot.width <= 400 || snapshot.height <= 200) {
    throw new Error(
      `${label} kept the bubble canvas at an unrendered backing size (${snapshot.width}x${snapshot.height}).`,
    );
  }

  if (snapshot.rectWidth <= 200 || snapshot.rectHeight <= 150) {
    throw new Error(
      `${label} bubble canvas CSS box is unexpectedly small (${snapshot.rectWidth}x${snapshot.rectHeight}).`,
    );
  }

  if (snapshot.nonTransparentSamples <= 0) {
    throw new Error(`${label} bubble canvas stayed visually blank after load.`);
  }
}

async function assertBubblePlaybackAdvances(page, label) {
  const before = await readBubbleCanvasSnapshot(page);
  if (before.playDisabled) {
    return;
  }

  const playButton = page.locator('.bubble-timeline-button').first();
  await playButton.click();

  try {
    await page.waitForFunction(
      ({ previousDate, previousCount }) => {
        const nextDate = document.querySelector('.bubble-timeline-status-date')?.textContent?.trim() ?? null;
        const nextCount = document.querySelector('.bubble-timeline-status-count')?.textContent?.trim() ?? null;
        return nextDate !== previousDate || nextCount !== previousCount;
      },
      {
        previousDate: before.timelineDate,
        previousCount: before.timelineCount,
      },
      { timeout: 4000 },
    );
  } finally {
    if ((await playButton.textContent())?.trim() === 'Pause') {
      await playButton.click();
    }
  }
}

async function readMetricTimeCanvasSnapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.metric-time-stage canvas');
    const tooltip = document.querySelector('.metric-time-tooltip');
    const filterButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Filter alliances ('),
    );

    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        hasCanvas: false,
        tooltipTitle: tooltip?.querySelector('.metric-time-tooltip__title')?.textContent?.trim() ?? null,
        tooltipSubtitle:
          tooltip?.querySelector('.metric-time-tooltip__subtitle')?.textContent?.trim() ?? null,
        tooltipValue: tooltip?.querySelector('.metric-time-tooltip__row strong')?.textContent?.trim() ?? null,
        filterLabel: filterButton?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      };
    }

    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    let nonTransparentSamples = 0;
    if (context && canvas.width > 0 && canvas.height > 0) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const totalPixels = Math.max(1, Math.floor(data.length / 4));
      const pixelStride = Math.max(1, Math.floor(totalPixels / 20000));
      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += pixelStride) {
        const alpha = data[pixelIndex * 4 + 3] ?? 0;
        if (alpha > 0) {
          nonTransparentSamples += 1;
        }
      }
    }

    return {
      hasCanvas: true,
      width: canvas.width,
      height: canvas.height,
      rectWidth: rect.width,
      rectHeight: rect.height,
      nonTransparentSamples,
      tooltipTitle: tooltip?.querySelector('.metric-time-tooltip__title')?.textContent?.trim() ?? null,
      tooltipSubtitle:
        tooltip?.querySelector('.metric-time-tooltip__subtitle')?.textContent?.trim() ?? null,
      tooltipValue: tooltip?.querySelector('.metric-time-tooltip__row strong')?.textContent?.trim() ?? null,
      filterLabel: filterButton?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    };
  });
}

async function assertMetricTimeCanvasRendered(page, label) {
  const snapshot = await readMetricTimeCanvasSnapshot(page);

  if (!snapshot.hasCanvas) {
    throw new Error(`${label} did not render a metric-time canvas element.`);
  }

  if (snapshot.width <= 400 || snapshot.height <= 200) {
    throw new Error(
      `${label} kept the metric-time canvas at an unrendered backing size (${snapshot.width}x${snapshot.height}).`,
    );
  }

  if (snapshot.rectWidth <= 200 || snapshot.rectHeight <= 150) {
    throw new Error(
      `${label} metric-time canvas CSS box is unexpectedly small (${snapshot.rectWidth}x${snapshot.rectHeight}).`,
    );
  }

  if (snapshot.nonTransparentSamples <= 0) {
    throw new Error(`${label} metric-time canvas stayed visually blank after load.`);
  }
}

async function findMetricTimeHoverTargets(page) {
  const targets = await page.evaluate(() => {
    const canvas = document.querySelector('.metric-time-stage canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return [];
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return [];

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const startX = Math.floor(canvas.width * 0.2);
    const endX = Math.floor(canvas.width * 0.88);
    const startY = Math.floor(canvas.height * 0.12);
    const endY = Math.floor(canvas.height * 0.78);
    const stepX = Math.max(1, Math.floor((endX - startX) / 48));
    const stepY = Math.max(1, Math.floor((endY - startY) / 48));
    const found = [];

    for (let x = endX; x >= startX; x -= stepX) {
      for (let y = startY; y <= endY; y += stepY) {
        const offset = (y * canvas.width + x) * 4;
        const r = imageData[offset] ?? 0;
        const g = imageData[offset + 1] ?? 0;
        const b = imageData[offset + 2] ?? 0;
        const a = imageData[offset + 3] ?? 0;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (a < 24 || chroma < 28) continue;
        found.push({ x: x / canvas.width, y: y / canvas.height });
        if (found.length >= 12) {
          return found;
        }
      }
    }

    return found;
  });

  if (!targets.length) {
    throw new Error('Could not find a hoverable metric-time series pixel.');
  }

  return targets;
}

async function hoverMetricTimeSeries(page, label) {
  const canvas = page.locator('.metric-time-stage canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: overallTimeoutMs });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error(`${label} metric-time canvas does not have a bounding box.`);
  }

  const targets = await findMetricTimeHoverTargets(page);
  let hovered = false;
  const offsets = [0, -0.015, 0.015, -0.03, 0.03];

  for (const target of targets) {
    for (const offsetY of offsets) {
      await page.mouse.move(
        box.x + box.width * target.x,
        box.y + box.height * Math.max(0.05, Math.min(0.95, target.y + offsetY)),
      );
      try {
        await page.waitForFunction(
          () => !!document.querySelector('.metric-time-tooltip .metric-time-tooltip__title'),
          undefined,
          { timeout: 250 },
        );
        hovered = true;
        break;
      } catch {
        // Try the next nearby point.
      }
    }

    if (hovered) break;
  }

  if (!hovered) {
    throw new Error(`${label} could not find a tooltip-producing hover point on the metric-time canvas.`);
  }

  const snapshot = await readMetricTimeCanvasSnapshot(page);
  if (!snapshot.tooltipTitle || !snapshot.tooltipSubtitle || !snapshot.tooltipValue) {
    throw new Error(`${label} did not surface a complete metric-time tooltip after hover.`);
  }

  return snapshot;
}

async function assertMetricTimeCoalitionTooltip(page, label) {
  await assertMetricTimeCanvasRendered(page, label);
  const hover = await hoverMetricTimeSeries(page, `${label} hover`);
  if (!hover.tooltipSubtitle?.includes('Coalition roll-up over selected alliances')) {
    throw new Error(`${label} did not load in coalition aggregation mode.`);
  }
}

function parseMetricTimeFilterCounts(filterLabel) {
  const match = /\((\d+)\/(\d+)\)/.exec(filterLabel ?? '');
  if (!match) return null;
  return {
    selected: Number.parseInt(match[1], 10),
    total: Number.parseInt(match[2], 10),
  };
}

async function findMetricTimeConflict(browser, baseUrl, conflictIds) {
  const routes = createRouteContext(baseUrl);
  const probeIds = conflictIds.slice(0, 6);
  const { page } = await newReadyPage(browser, 'metric-time-probe');

  try {
    for (const conflictId of probeIds) {
      await page.goto(routes.buildUrl(`/metric-time?id=${conflictId}`), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load');

      try {
        await waitForSuccessOrFatal(
          page,
          page.locator('.metric-time-stage canvas').first(),
          `metric-time probe ${conflictId}`,
        );
      } catch {
        continue;
      }

      const snapshot = await readMetricTimeCanvasSnapshot(page);
      const counts = parseMetricTimeFilterCounts(snapshot.filterLabel);
      if (counts && counts.total > 2) {
        return conflictId;
      }
    }

    return probeIds[0] ?? null;
  } finally {
    await page.close();
  }
}

async function assertMetricTimeInteractions(page, label) {
  await assertMetricTimeCanvasRendered(page, label);

  const initialHover = await hoverMetricTimeSeries(page, `${label} initial hover`);

  await page.locator('#metricTimeCumulative').click();
  await page.waitForTimeout(250);
  const cumulativeHover = await hoverMetricTimeSeries(page, `${label} cumulative hover`);
  if (cumulativeHover.tooltipValue === initialHover.tooltipValue) {
    throw new Error(`${label} cumulative toggle did not change the hovered metric value.`);
  }

  const aggregationToggle = page.locator('#metricTimeAggregate');
  if (!(await aggregationToggle.isChecked())) {
    await aggregationToggle.click();
    await page.waitForTimeout(250);
  }
  const coalitionHover = await hoverMetricTimeSeries(page, `${label} coalition hover`);
  if (!coalitionHover.tooltipSubtitle?.includes('Coalition roll-up over selected alliances')) {
    throw new Error(`${label} coalition aggregation toggle did not switch the tooltip to coalition roll-up copy.`);
  }

  const filterTrigger = page
    .locator('button')
    .filter({ hasText: 'Filter alliances (' })
    .first();
  const countsBefore = parseMetricTimeFilterCounts(await filterTrigger.textContent());
  if (countsBefore?.total && countsBefore.total > 2) {
    await filterTrigger.click();
    const selectAllPanel = page.locator('.selection-picker-panel');
    await selectAllPanel.waitFor({ state: 'visible', timeout: overallTimeoutMs });
    await selectAllPanel.locator('.selection-picker-action', { hasText: 'Select All' }).click();
    await selectAllPanel
      .getByText(`Alliances selected: ${countsBefore.total}`, { exact: false })
      .waitFor({ state: 'visible', timeout: overallTimeoutMs });
    await selectAllPanel.locator('.selection-picker-footer .selection-picker-action').last().click();
    await selectAllPanel.waitFor({ state: 'hidden', timeout: overallTimeoutMs });
    await page.waitForTimeout(400);

    await filterTrigger.click();
    const narrowedPanel = page.locator('.selection-picker-panel');
    await narrowedPanel.waitFor({ state: 'visible', timeout: overallTimeoutMs });
    await narrowedPanel.locator('.selection-picker-action', { hasText: 'Clear' }).click();
    await narrowedPanel
      .locator('.selection-picker-row:has(.selection-picker-group-badge--coalition1) input')
      .first()
      .click();
    await narrowedPanel
      .locator('.selection-picker-row:has(.selection-picker-group-badge--coalition2) input')
      .first()
      .click();
    await narrowedPanel.getByText('Alliances selected: 2', { exact: false }).waitFor({
      state: 'visible',
      timeout: overallTimeoutMs,
    });
    await narrowedPanel.locator('.selection-picker-footer .selection-picker-action').last().click();
    await narrowedPanel.waitFor({ state: 'hidden', timeout: overallTimeoutMs });
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get('ids')?.split('.').filter(Boolean).length === 2,
      undefined,
      { timeout: overallTimeoutMs },
    );

    const visibleSeriesCount = await page.locator('.metric-time-legend-item').count();
    if (visibleSeriesCount !== 2) {
      throw new Error(`${label} alliance filter commit did not narrow the visible series to one per coalition.`);
    }

    await assertMetricTimeCanvasRendered(page, `${label} filtered state`);
  }
}

async function waitForSuccessOrFatal(page, successLocator, label, onReady) {
  try {
    await successLocator.waitFor({ state: 'visible', timeout: overallTimeoutMs });
  } catch {
    const alertTexts = (await page.locator('.alert.alert-danger').allTextContents())
      .map(normalizeAlertText);
    const fatalText = alertTexts.find(isFatalAlertText);
    if (fatalText) {
      throw new Error(`${label} failed with fatal alert: ${fatalText}`);
    }
    throw new Error(`${label} did not reach ready state.`);
  }

  const readyValue = onReady ? await onReady() : null;

  await page.waitForTimeout(500);
  const fatalAlerts = (await page.locator('.alert.alert-danger').allTextContents())
    .map(normalizeAlertText)
    .filter(isFatalAlertText);
  if (fatalAlerts.length > 0) {
    throw new Error(`${label} showed fatal alert after readiness: ${fatalAlerts.join(' | ')}`);
  }

  return readyValue;
}

async function gotoRoute(page, baseUrl, routePath, successLocator, label, options = {}) {
  const routes = createRouteContext(baseUrl);
  const startedAt = performance.now();
  await page.goto(routes.buildUrl(routePath), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  const readyValue = await waitForSuccessOrFatal(page, successLocator, label, options.onReady);
  return {
    readyDurationMs: roundMs(performance.now() - startedAt),
    readyValue,
  };
}

async function newReadyPage(browser, label) {
  const page = await browser.newPage();
  const pageErrors = attachPageErrors(page, label);
  return { page, pageErrors };
}

async function findCompositePair(browser, baseUrl, conflictIds) {
  const routes = createRouteContext(baseUrl);
  const probeIds = conflictIds.slice(0, 6);
  const { page } = await newReadyPage(browser, 'composite-probe');

  try {
    for (let left = 0; left < probeIds.length; left += 1) {
      for (let right = left + 1; right < probeIds.length; right += 1) {
        const pair = [probeIds[left], probeIds[right]];
        await page.goto(routes.buildUrl(`/conflicts/view?ids=${pair.join(',')}`), { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('load');

        try {
          await waitForSuccessOrFatal(
            page,
            page.locator('#composite-alliance'),
            `composite probe ${pair.join(',')}`,
          );
          return pair;
        } catch {
          continue;
        }
      }
    }

    return null;
  } finally {
    await page.close();
  }
}

async function runNavigationMatrix(baseUrl) {
  const routes = createRouteContext(baseUrl);
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const perfReports = [];
  const graphWarmLeakPerf = {
    eventPrefixes: [
      'journey.conflict_to_bubble',
      'journey.conflict_to_tiering',
      'decompress.worker.bytes',
    ],
    counterPrefixes: [
      'graph.bubble.',
      'graph.tiering.',
      'worker.bubble.',
      'worker.tiering.',
    ],
  };

  try {
    const { page: homePage, pageErrors: homeErrors } = await newReadyPage(browser, 'home');
    await gotoRoute(homePage, baseUrl, '/', homePage.getByText('View Conflicts', { exact: false }).first(), 'home route');
    errors.push(...homeErrors);
    await homePage.close();

    let { page: conflictsPage, pageErrors: conflictsErrors } = await newReadyPage(browser, 'conflicts');
    await gotoRoute(conflictsPage, baseUrl, '/conflicts', conflictsPage.locator('a[href*="conflict?id="]').first(), 'conflicts index');
    const conflictHrefs = await conflictsPage.locator('a[href*="conflict?id="]').evaluateAll((elements) =>
      Array.from(new Set(elements.map((element) => element.getAttribute('href')).filter(Boolean))),
    );
    const conflictIds = conflictHrefs.map((href) => conflictIdFromHref(href, routes.hrefBaseUrl)).filter(Boolean);
    if (conflictIds.length === 0) {
      throw new Error('No conflict ids were discovered from /conflicts.');
    }
    let selectedConflictId = conflictIds[0];

    const firstConflictAction = conflictsPage.locator('[data-grid-action-id="open-conflict-card"]').first();
    const firstConflictArgs = JSON.parse(await firstConflictAction.getAttribute('data-grid-action-args') ?? '{}');
    const actionConflictId = `${firstConflictArgs.conflictId ?? ''}`;
    if (!/^\d+$/.test(actionConflictId)) {
      throw new Error('Could not read the first conflict id from the grid action.');
    }
    selectedConflictId = actionConflictId;

    await firstConflictAction.hover();
    await conflictsPage.waitForTimeout(400);
    await clearPerfSnapshot(conflictsPage);
    await firstConflictAction.click();
    const openConflictPageLink = conflictsPage.locator(`[data-conflict-action="open-conflict-page"][data-conflict-id="${actionConflictId}"]`).first();
    await openConflictPageLink.waitFor({ state: 'visible', timeout: overallTimeoutMs });
    await conflictsPage.waitForTimeout(250);
    await assertNoPerfActivity(conflictsPage, graphWarmLeakPerf, 'conflict card open');
    await clearPerfSnapshot(conflictsPage);
    await openConflictPageLink.hover();
    await conflictsPage.waitForTimeout(400);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/conflict\\?id=\\d+'), { timeout: overallTimeoutMs }),
      openConflictPageLink.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('table.ux-grid-table').first(), 'conflict route after hover preload');
    await assertNoPerfActivity(conflictsPage, graphWarmLeakPerf, 'conflict route after hover preload');

    const bubbleTab = conflictsPage.locator(`a[href*="bubble?id=${selectedConflictId}"]`).first();
    await bubbleTab.hover();
    await conflictsPage.waitForTimeout(400);
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/bubble\\?id=\\d+'), { timeout: overallTimeoutMs }),
      bubbleTab.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('.bubble-city-slider').first(), 'bubble route');
    await assertBubbleCanvasRendered(conflictsPage, 'bubble route');
    await assertBubblePlaybackAdvances(conflictsPage, 'bubble route');
    await assertWarmNavigationSnapshot(
      conflictsPage,
      {
        cacheHit: 'graph.bubble.cache.hit',
        cachePending: 'graph.bubble.cache.pending',
        cacheMiss: 'graph.bubble.cache.miss',
      },
      'bubble route',
    );

    const conflictReturnTabFromBubble = conflictsPage
      .locator(`a[href*="conflict?id=${selectedConflictId}"]`)
      .filter({ hasText: 'Coalition' })
      .first();
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/conflict\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictReturnTabFromBubble.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('table.ux-grid-table').first(), 'conflict return route');
    await assertNoPerfEvent(conflictsPage, 'conflictGrid.dataset.create', 'bubble to conflict return');

    const tieringTab = conflictsPage.locator(`a[href*="tiering?id=${selectedConflictId}"]`).first();
    await tieringTab.hover();
    await conflictsPage.waitForTimeout(400);
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/tiering\\?id=\\d+'), { timeout: overallTimeoutMs }),
      tieringTab.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.getByText('Conflict Tiering:', { exact: false }).first(), 'tiering route');
    await assertWarmNavigationSnapshot(
      conflictsPage,
      {
        cacheHit: 'graph.tiering.cache.hit',
        cachePending: 'graph.tiering.cache.pending',
        cacheMiss: 'graph.tiering.cache.miss',
      },
      'tiering route',
    );

    const conflictReturnTabFromTiering = conflictsPage
      .locator(`a[href*="conflict?id=${selectedConflictId}"]`)
      .filter({ hasText: 'Coalition' })
      .first();
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/conflict\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictReturnTabFromTiering.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('table.ux-grid-table').first(), 'conflict return from tiering');
    await assertNoPerfEvent(conflictsPage, 'conflictGrid.dataset.create', 'tiering to conflict return');

    const metricTimeConflictId = (await findMetricTimeConflict(browser, baseUrl, conflictIds)) ?? selectedConflictId;
    if (metricTimeConflictId !== selectedConflictId) {
      errors.push(...conflictsErrors);
      await conflictsPage.close();
      ({ page: conflictsPage, pageErrors: conflictsErrors } = await newReadyPage(browser, 'conflicts-metric-time'));
      await gotoRoute(
        conflictsPage,
        baseUrl,
        `/conflict?id=${metricTimeConflictId}`,
        conflictsPage.locator('table.ux-grid-table').first(),
        'metric-time conflict route',
      );
      selectedConflictId = metricTimeConflictId;
    }

    const metricTimeTab = conflictsPage.locator(`a[href*="metric-time?id=${selectedConflictId}"]`).first();
    await metricTimeTab.hover();
    await conflictsPage.waitForTimeout(400);
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/metric-time\\?id=\\d+'), { timeout: overallTimeoutMs }),
      metricTimeTab.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('.metric-time-stage canvas').first(), 'metric-time route');
    await assertMetricTimeInteractions(conflictsPage, 'metric-time route');

    const conflictReturnTabFromMetricTime = conflictsPage
      .locator(`a[href*="conflict?id=${selectedConflictId}"]`)
      .filter({ hasText: 'Coalition' })
      .first();
    await clearPerfSnapshot(conflictsPage);
    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/conflict\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictReturnTabFromMetricTime.click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('table.ux-grid-table').first(), 'conflict return from metric-time');
    await assertNoPerfEvent(conflictsPage, 'conflictGrid.dataset.create', 'metric-time to conflict return');

    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/chord\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictsPage.locator(`a[href*="chord?id=${selectedConflictId}"]`).first().click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.getByText('Metric header:', { exact: false }).first(), 'chord route');

    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/aava\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictsPage.locator(`a[href*="aava?id=${selectedConflictId}"]`).first().click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.getByText('Header:', { exact: false }).first(), 'aava route');

    await Promise.all([
      conflictsPage.waitForURL(routes.routePattern('/conflict\\?id=\\d+'), { timeout: overallTimeoutMs }),
      conflictsPage.locator(`a[href*="conflict?id=${selectedConflictId}"]`).first().click(),
    ]);
    await conflictsPage.waitForLoadState('load');
    await waitForSuccessOrFatal(conflictsPage, conflictsPage.locator('table.ux-grid-table').first(), 'conflict return from aava');

    errors.push(...conflictsErrors);
    await conflictsPage.close();

    for (const route of [
      {
        label: 'conflict cold load',
        routePath: `/conflict?id=${selectedConflictId}`,
        selectorFactory: (page) => page.locator('table.ux-grid-table').first(),
        perfReadyEventName: 'journey.conflicts_to_conflict.firstMount',
        perfEventPrefixes: ['journey.conflicts_to_conflict', 'decompress.', 'conflictGrid.', 'grid.query.'],
        perfCounterPrefixes: ['decompress.', 'conflictGrid.', 'grid.query.'],
      },
      {
        label: 'bubble cold load',
        routePath: `/bubble?id=${selectedConflictId}`,
        selectorFactory: (page) => page.locator('.bubble-city-slider').first(),
        perfReadyEventName: 'journey.conflict_to_bubble.firstMount',
        perfEventPrefixes: ['journey.conflict_to_bubble', 'decompress.', 'graph.'],
        perfCounterPrefixes: ['decompress.', 'graph.', 'worker.bubble.'],
      },
      {
        label: 'tiering cold load',
        routePath: `/tiering?id=${selectedConflictId}`,
        selectorFactory: (page) => page.getByText('Conflict Tiering:', { exact: false }).first(),
        perfReadyEventName: 'journey.conflict_to_tiering.firstMount',
        perfEventPrefixes: ['journey.conflict_to_tiering', 'decompress.', 'graph.'],
        perfCounterPrefixes: ['decompress.', 'graph.', 'worker.tiering.'],
      },
      {
        label: 'metric-time cold load',
        routePath: `/metric-time?id=${selectedConflictId}`,
        selectorFactory: (page) => page.locator('.metric-time-stage canvas').first(),
        perfReadyEventName: 'journey.conflict_to_metric_time.firstMount',
        perfEventPrefixes: ['journey.conflict_to_metric_time', 'decompress.', 'graph.'],
        perfCounterPrefixes: ['decompress.', 'graph.', 'worker.metric-time.'],
      },
      {
        label: 'metric-time coalition cold load',
        routePath: `/metric-time?id=${selectedConflictId}&aggregation=coalition`,
        selectorFactory: (page) => page.locator('.metric-time-stage canvas').first(),
        perfReadyEventName: 'journey.conflict_to_metric_time.firstMount',
        perfEventPrefixes: ['journey.conflict_to_metric_time', 'decompress.', 'graph.'],
        perfCounterPrefixes: ['decompress.', 'graph.', 'worker.metric-time.'],
      },
      {
        label: 'aava cold load',
        routePath: `/aava?id=${selectedConflictId}`,
        selectorFactory: (page) => page.getByText('Header:', { exact: false }).first(),
        perfReadyEventName: 'journey.conflict_to_aava.firstMount',
        perfEventPrefixes: ['journey.conflict_to_aava', 'conflictContext.', 'decompress.', 'grid.query.'],
        perfCounterPrefixes: ['decompress.', 'grid.query.'],
      },
      {
        label: 'chord cold load',
        routePath: `/chord?id=${selectedConflictId}`,
        selectorFactory: (page) => page.getByText('Metric header:', { exact: false }).first(),
      },
    ]) {
      const { page, pageErrors } = await newReadyPage(browser, route.label);
      const result = await gotoRoute(
        page,
        baseUrl,
        route.routePath,
        route.selectorFactory(page),
        route.label,
        shouldReportColdLoadPerf && route.perfEventPrefixes
          ? {
              onReady: async () => {
                await waitForPerfEvent(page, route.perfReadyEventName);
                return readPerfReportSnapshot(page);
              },
            }
          : undefined,
      );
      if (route.label === 'bubble cold load') {
        await assertBubbleCanvasRendered(page, route.label);
      }
      if (route.label === 'metric-time cold load') {
        await assertMetricTimeCanvasRendered(page, route.label);
      }
      if (route.label === 'metric-time coalition cold load') {
        await assertMetricTimeCoalitionTooltip(page, route.label);
      }
      if (shouldReportColdLoadPerf && route.perfEventPrefixes && result.readyValue) {
        perfReports.push(buildPerfReport(route, result.readyDurationMs, result.readyValue));
      }
      errors.push(...pageErrors);
      await page.close();
    }

    const compositePair = await findCompositePair(browser, baseUrl, conflictIds);
    if (!compositePair) {
      throw new Error('No composite route pair was found among the first discovered conflicts.');
    }
    const { page: compositePage, pageErrors: compositeErrors } = await newReadyPage(browser, 'composite cold load');
    await gotoRoute(
      compositePage,
      baseUrl,
      `/conflicts/view?ids=${compositePair.join(',')}`,
      compositePage.locator('#composite-alliance'),
      'composite cold load',
    );
    errors.push(...compositeErrors);
    await compositePage.close();

    if (errors.length > 0) {
      throw new Error(`Page errors were captured:\n${errors.join('\n')}`);
    }

    console.log(`Verified conflict id: ${selectedConflictId}`);
    console.log(`Verified composite pair: ${compositePair.join(',')}`);
    if (shouldReportColdLoadPerf) {
      for (const report of perfReports) {
        printPerfReport(report);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const externalBaseUrl = process.env.BASE_URL?.trim();
  if (externalBaseUrl) {
    await runNavigationMatrix(externalBaseUrl);
    return;
  }

  const server = await createStaticBuildServer();
  try {
    await runNavigationMatrix(server.baseUrl);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (/Executable doesn't exist/i.test(message)) {
    console.error(`${message}\nRun \`npx playwright install chromium\` once, then retry \`npm run verify:navigation\`.`);
    process.exit(1);
  }
  console.error(message);
  process.exit(1);
});
