import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const buildDir = path.resolve('build');
const defaultOutputDir = path.resolve('tmp', 'lighthouse-matrix');
const defaultConflictId = '161';
const defaultLighthousePackage = 'lighthouse@12.8.2';
const defaultChromeFlags = '--headless=new --no-sandbox';

const routeDefinitions = {
  'conflict-coalition': {
    label: 'Conflict coalition',
    buildPath: ({ conflictId }) => `/conflict?id=${conflictId}&layout=coalition`,
  },
  'conflict-nation': {
    label: 'Conflict nation',
    buildPath: ({ conflictId }) => `/conflict?id=${conflictId}&layout=nation`,
  },
  tiering: {
    label: 'Tier / Time',
    buildPath: ({ conflictId }) => `/tiering?id=${conflictId}`,
  },
  bubble: {
    label: 'Bubble / Time',
    buildPath: ({ conflictId }) => `/bubble?id=${conflictId}`,
  },
  aava: {
    label: 'AA vs AA',
    buildPath: ({ conflictId }) => `/aava?id=${conflictId}`,
  },
};

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    conflictId: defaultConflictId,
    outputDir: defaultOutputDir,
    chromeFlags: defaultChromeFlags,
    routes: Object.keys(routeDefinitions),
  };

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).trim();
      continue;
    }
    if (arg.startsWith('--conflict-id=')) {
      options.conflictId = arg.slice('--conflict-id='.length).trim();
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(arg.slice('--output-dir='.length).trim());
      continue;
    }
    if (arg.startsWith('--chrome-flags=')) {
      options.chromeFlags = arg.slice('--chrome-flags='.length).trim();
      continue;
    }
    if (arg.startsWith('--routes=')) {
      options.routes = arg
        .slice('--routes='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  if (!/^\d+$/.test(options.conflictId)) {
    throw new Error('Expected --conflict-id to be a numeric conflict id.');
  }

  if (options.routes.length === 0) {
    throw new Error('Expected at least one Lighthouse route in --routes.');
  }

  for (const routeKey of options.routes) {
    if (!routeDefinitions[routeKey]) {
      throw new Error(`Unsupported route key: ${routeKey}`);
    }
  }

  return options;
}

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
    throw new Error('Static build output is missing. Run `npm run build` before `npm run lighthouse:matrix`.');
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
    throw new Error('Could not determine the local Lighthouse server address.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

async function runLighthouse(url, outputPath, options) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const chrome = await launch({
    chromeFlags: options.chromeFlags.split(/\s+/).filter(Boolean),
    logLevel: 'silent',
  });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
    });

    if (!result?.lhr) {
      throw new Error(`Lighthouse did not return a report for ${url}`);
    }

    await fs.writeFile(outputPath, `${JSON.stringify(result.lhr, null, 2)}\n`);
    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

function readAuditNumber(report, id) {
  const audit = report.audits?.[id];
  return typeof audit?.numericValue === 'number' ? audit.numericValue : null;
}

function readAuditText(report, id) {
  const audit = report.audits?.[id];
  return typeof audit?.displayValue === 'string' ? audit.displayValue : null;
}

function readThirdPartyBlockingTime(report) {
  const items = report.audits?.['third-party-summary']?.details?.items;
  if (!Array.isArray(items)) return null;
  return items.reduce((sum, item) => sum + (typeof item.blockingTime === 'number' ? item.blockingTime : 0), 0);
}

function readPageOwnedLongTaskMs(report, baseUrl) {
  const items = report.audits?.['long-tasks']?.details?.items;
  if (!Array.isArray(items)) return null;
  const pageTasks = items.filter((item) => typeof item.url === 'string' && item.url.startsWith(baseUrl));
  if (pageTasks.length === 0) return null;
  return Math.max(...pageTasks.map((item) => (typeof item.duration === 'number' ? item.duration : 0)));
}

function formatMs(value) {
  if (value == null) return 'n/a';
  return `${Math.round(value)} ms`;
}

function formatSeconds(value) {
  if (value == null) return 'n/a';
  return `${(value / 1000).toFixed(1)} s`;
}

function formatScore(value) {
  if (typeof value !== 'number') return 'n/a';
  return `${Math.round(value * 100)}`;
}

function formatCls(value) {
  if (value == null) return 'n/a';
  return `${Math.round(value * 1000) / 1000}`;
}

function buildSummary(routeKey, routeUrl, report, baseUrl) {
  const lcpElement = report.audits?.['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.nodeLabel ?? null;
  return {
    key: routeKey,
    label: routeDefinitions[routeKey].label,
    url: routeUrl,
    performanceScore: report.categories?.performance?.score ?? null,
    firstContentfulPaintMs: readAuditNumber(report, 'first-contentful-paint'),
    largestContentfulPaintMs: readAuditNumber(report, 'largest-contentful-paint'),
    speedIndexMs: readAuditNumber(report, 'speed-index'),
    totalBlockingTimeMs: readAuditNumber(report, 'total-blocking-time'),
    cumulativeLayoutShift: readAuditNumber(report, 'cumulative-layout-shift'),
    renderBlockingSavingsMs: report.audits?.['render-blocking-resources']?.details?.overallSavingsMs ?? null,
    unusedJavascriptBytes: report.audits?.['unused-javascript']?.details?.overallSavingsBytes ?? null,
    thirdPartyBlockingTimeMs: readThirdPartyBlockingTime(report),
    pageOwnedLongTaskMs: readPageOwnedLongTaskMs(report, baseUrl),
    largestContentfulPaintElement: lcpElement,
    firstContentfulPaintText: readAuditText(report, 'first-contentful-paint'),
    largestContentfulPaintText: readAuditText(report, 'largest-contentful-paint'),
  };
}

function buildMarkdown(summary) {
  const lines = [
    '# Lighthouse Matrix',
    '',
    `Generated at ${summary.generatedAt}.`,
    '',
    `Base URL: ${summary.baseUrl}`,
    '',
    `Lighthouse package: ${summary.lighthousePackage}`,
    '',
    '| Route | Score | FCP | LCP | TBT | CLS | Page long task | Third-party block |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const route of summary.routes) {
    lines.push(
      `| ${route.label} | ${formatScore(route.performanceScore)} | ${formatSeconds(route.firstContentfulPaintMs)} | ${formatSeconds(route.largestContentfulPaintMs)} | ${formatMs(route.totalBlockingTimeMs)} | ${formatCls(route.cumulativeLayoutShift)} | ${formatMs(route.pageOwnedLongTaskMs)} | ${formatMs(route.thirdPartyBlockingTimeMs)} |`,
    );
  }

  lines.push('', '## Route Details', '');

  for (const route of summary.routes) {
    lines.push(`- ${route.label}: ${route.url}`);
    lines.push(`  FCP ${formatSeconds(route.firstContentfulPaintMs)}, LCP ${formatSeconds(route.largestContentfulPaintMs)}, TBT ${formatMs(route.totalBlockingTimeMs)}, CLS ${formatCls(route.cumulativeLayoutShift)}.`);
    lines.push(`  Render-blocking savings ${formatMs(route.renderBlockingSavingsMs)}, unused JS ${route.unusedJavascriptBytes == null ? 'n/a' : `${Math.round(route.unusedJavascriptBytes / 1024)} KiB`}, page long task ${formatMs(route.pageOwnedLongTaskMs)}, third-party block ${formatMs(route.thirdPartyBlockingTimeMs)}.`);
    if (route.largestContentfulPaintElement) {
      lines.push(`  LCP element: ${route.largestContentfulPaintElement}.`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = options.baseUrl ? null : await createStaticBuildServer();
  const baseUrl = options.baseUrl ?? server.baseUrl;

  try {
    await fs.mkdir(options.outputDir, { recursive: true });

    const summaries = [];
    for (const routeKey of options.routes) {
      const routeUrl = `${baseUrl}${routeDefinitions[routeKey].buildPath({ conflictId: options.conflictId })}`;
      const outputPath = path.join(options.outputDir, `${routeKey}.json`);
      console.log(`[lighthouse] ${routeDefinitions[routeKey].label} -> ${routeUrl}`);
      const report = await runLighthouse(routeUrl, outputPath, options);
      summaries.push(buildSummary(routeKey, routeUrl, report, baseUrl));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      conflictId: options.conflictId,
      lighthousePackage: defaultLighthousePackage,
      routes: summaries,
    };

    const summaryJsonPath = path.join(options.outputDir, 'summary.json');
    const summaryMarkdownPath = path.join(options.outputDir, 'summary.md');
    await fs.writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`);
    await fs.writeFile(summaryMarkdownPath, buildMarkdown(summary));

    console.log(`[lighthouse] summary json -> ${summaryJsonPath}`);
    console.log(`[lighthouse] summary md -> ${summaryMarkdownPath}`);
  } finally {
    await server?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});