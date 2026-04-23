import { performance } from 'node:perf_hooks';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Packr, Unpackr, isNativeAccelerationEnabled, pack } from 'msgpackr';

const DEFAULT_DATA_ORIGIN =
    process.env.PUBLIC_DATA_ORIGIN?.trim().replace(/\/+$/, '') ||
    'https://data.locutus.link';
const DEFAULT_CONFLICT_ID = '161';
const DEFAULT_VERSIONS = {
    conflict: '1.2',
    graph: '1.2',
};
const DEFAULT_ITERATIONS = 3;
const DEFAULT_HOT_ITERATIONS = 8;
const DEFAULT_WARMUP = 1;
const DEFAULT_SYNTHETIC_ROWS = 1500;
const DEFAULT_MAX_COMPRESSED_MIB = 2;
const DEFAULT_MAX_INFLATED_MIB = 16;
const FETCH_TIMEOUT_MS = 30_000;

const CURRENT_UNPACK_OPTIONS = {
    largeBigIntToFloat: true,
    mapsAsObjects: true,
    bundleStrings: true,
    int64AsType: 'number',
};

function parseArgs(argv) {
    const options = {
        conflictId: DEFAULT_CONFLICT_ID,
        dataOrigin: DEFAULT_DATA_ORIGIN,
        conflictVersion: DEFAULT_VERSIONS.conflict,
        graphVersion: DEFAULT_VERSIONS.graph,
        kind: 'both',
        iterations: DEFAULT_ITERATIONS,
        hotIterations: DEFAULT_HOT_ITERATIONS,
        warmup: DEFAULT_WARMUP,
        syntheticRows: DEFAULT_SYNTHETIC_ROWS,
        synthetic: true,
        remote: false,
        benchmarkRemote: false,
        maxCompressedMiB: DEFAULT_MAX_COMPRESSED_MIB,
        maxInflatedMiB: DEFAULT_MAX_INFLATED_MIB,
        allowLarge: false,
    };

    for (const arg of argv) {
        if (arg.startsWith('--conflict=')) {
            options.conflictId = arg.slice('--conflict='.length);
            continue;
        }
        if (arg.startsWith('--origin=')) {
            options.dataOrigin = arg.slice('--origin='.length).trim().replace(/\/+$/, '');
            continue;
        }
        if (arg.startsWith('--conflict-version=')) {
            options.conflictVersion = arg.slice('--conflict-version='.length);
            continue;
        }
        if (arg.startsWith('--graph-version=')) {
            options.graphVersion = arg.slice('--graph-version='.length);
            continue;
        }
        if (arg.startsWith('--kind=')) {
            options.kind = arg.slice('--kind='.length);
            continue;
        }
        if (arg.startsWith('--iterations=')) {
            options.iterations = Number.parseInt(arg.slice('--iterations='.length), 10);
            continue;
        }
        if (arg.startsWith('--hot-iterations=')) {
            options.hotIterations = Number.parseInt(arg.slice('--hot-iterations='.length), 10);
            continue;
        }
        if (arg.startsWith('--warmup=')) {
            options.warmup = Number.parseInt(arg.slice('--warmup='.length), 10);
            continue;
        }
        if (arg.startsWith('--synthetic-rows=')) {
            options.syntheticRows = Number.parseInt(arg.slice('--synthetic-rows='.length), 10);
            continue;
        }
        if (arg.startsWith('--max-compressed-mib=')) {
            options.maxCompressedMiB = Number.parseFloat(arg.slice('--max-compressed-mib='.length));
            continue;
        }
        if (arg.startsWith('--max-inflated-mib=')) {
            options.maxInflatedMiB = Number.parseFloat(arg.slice('--max-inflated-mib='.length));
            continue;
        }
        if (arg === '--remote') {
            options.remote = true;
            continue;
        }
        if (arg === '--benchmark-remote') {
            options.benchmarkRemote = true;
            continue;
        }
        if (arg === '--no-synthetic') {
            options.synthetic = false;
            continue;
        }
        if (arg === '--allow-large') {
            options.allowLarge = true;
            continue;
        }
    }

    if (!['conflict', 'graph', 'both'].includes(options.kind)) {
        throw new Error(`Unsupported --kind value: ${options.kind}`);
    }
    if (options.benchmarkRemote && !options.remote) {
        throw new Error('Pass --remote together with --benchmark-remote.');
    }
    if (!options.synthetic && !options.remote) {
        throw new Error('Nothing to do. Leave synthetic enabled or pass --remote.');
    }

    for (const [name, value] of [
        ['iterations', options.iterations],
        ['hotIterations', options.hotIterations],
        ['warmup', options.warmup],
        ['syntheticRows', options.syntheticRows],
    ]) {
        if (!Number.isFinite(value) || value < 1) {
            throw new Error(`Expected ${name} to be a positive integer.`);
        }
    }

    for (const [name, value] of [
        ['maxCompressedMiB', options.maxCompressedMiB],
        ['maxInflatedMiB', options.maxInflatedMiB],
    ]) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`Expected ${name} to be a positive number.`);
        }
    }

    return options;
}

function buildTargets(options) {
    const targets = [];

    if (options.kind === 'conflict' || options.kind === 'both') {
        targets.push({
            label: 'conflict_data',
            url: `${options.dataOrigin}/conflicts/${options.conflictId}.gzip?${options.conflictVersion}`,
        });
    }

    if (options.kind === 'graph' || options.kind === 'both') {
        targets.push({
            label: 'graph_data',
            url: `${options.dataOrigin}/conflicts/graphs/${options.conflictId}.gzip?${options.graphVersion}`,
        });
    }

    return targets;
}

function formatBytes(value) {
    if (value < 1024) {
        return `${value} B`;
    }
    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KiB`;
    }
    return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatMs(value) {
    return `${value.toFixed(2)} ms`;
}

function formatOps(value) {
    return `${value.toFixed(0)} ops/s`;
}

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

function bytesFromMiB(value) {
    return Math.floor(value * 1024 * 1024);
}

function toExactBytes(bytes) {
    return Uint8Array.from(bytes);
}

function makeView(bytes) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function cloneStructures(structures = []) {
    return structures.map((entry) => (Array.isArray(entry) ? [...entry] : entry));
}

function summarizeValue(value) {
    if (Array.isArray(value)) {
        return `Array(${value.length})`;
    }
    if (value && typeof value === 'object') {
        return `Object(${Object.keys(value).length} keys)`;
    }
    return typeof value;
}

async function fetchInflatedBytes(url, options) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: abortController.signal });
        if (!response.ok) {
            throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
        }

        const compressed = new Uint8Array(await response.arrayBuffer());
        if (!options.allowLarge && compressed.byteLength > bytesFromMiB(options.maxCompressedMiB)) {
            throw new Error(
                `Compressed payload ${formatBytes(compressed.byteLength)} exceeds the safety cap of ${options.maxCompressedMiB} MiB. Raise --max-compressed-mib or rerun outside the IDE with --allow-large if you really want to benchmark it.`,
            );
        }

        const inflated = toExactBytes(gunzipSync(compressed));
        if (!options.allowLarge && inflated.byteLength > bytesFromMiB(options.maxInflatedMiB)) {
            throw new Error(
                `Inflated payload ${formatBytes(inflated.byteLength)} exceeds the safety cap of ${options.maxInflatedMiB} MiB. Raise --max-inflated-mib or rerun outside the IDE with --allow-large if you really want to benchmark it.`,
            );
        }

        return {
            compressed,
            bytes: inflated,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function benchmarkCold(createDecoder, bytes, iterations, warmup) {
    for (let index = 0; index < warmup; index += 1) {
        createDecoder().unpack(makeView(bytes));
    }

    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
        const decoder = createDecoder();
        const start = performance.now();
        decoder.unpack(makeView(bytes));
        samples.push(performance.now() - start);
    }

    const totalMs = samples.reduce((sum, sample) => sum + sample, 0);
    return {
        meanMs: totalMs / samples.length,
        medianMs: median(samples),
        opsPerSecond: (samples.length * 1000) / totalMs,
    };
}

function benchmarkHot(createDecoder, bytes, iterations, warmup) {
    const decoder = createDecoder();
    for (let index = 0; index < warmup; index += 1) {
        decoder.unpack(makeView(bytes));
    }

    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) {
        decoder.unpack(makeView(bytes));
    }
    const totalMs = performance.now() - start;

    return {
        meanMs: totalMs / iterations,
        opsPerSecond: (iterations * 1000) / totalMs,
    };
}

function runDecodeCase(label, bytes, createDecoder, options) {
    const cold = benchmarkCold(createDecoder, bytes, options.iterations, options.warmup);
    const hot = benchmarkHot(createDecoder, bytes, options.hotIterations, options.warmup);
    return {
        label,
        cold,
        hot,
    };
}

function printDecodeTable(title, results) {
    console.log(title);
    for (const result of results) {
        console.log(
            `  ${result.label.padEnd(28)} cold ${formatMs(result.cold.meanMs)} mean / ${formatMs(result.cold.medianMs)} median / ${formatOps(result.cold.opsPerSecond)}   hot ${formatMs(result.hot.meanMs)} mean / ${formatOps(result.hot.opsPerSecond)}`,
        );
    }
}

function createSyntheticRows(rowCount) {
    const categories = ['military', 'cities', 'score', 'ground', 'air'];

    return Array.from({ length: rowCount }, (_value, index) => ({
        id: index,
        allianceId: index % 12,
        allianceName: `Alliance ${index % 12}`,
        coalition: index % 3 === 0 ? 'alpha' : 'beta',
        category: categories[index % categories.length],
        cityCount: 18 + (index % 7),
        score: 9000 + (index % 500),
        flags: {
            active: index % 2 === 0,
            atWar: index % 5 === 0,
            applicant: index % 11 === 0,
        },
        metrics: {
            soldiers: 30000 + (index % 900),
            tanks: 4000 + (index % 200),
            aircraft: 2500 + (index % 120),
            ships: 400 + (index % 60),
        },
        notes: `Synthetic member ${index % 12}`,
    }));
}

function createSyntheticBuffers(rowCount) {
    const sample = createSyntheticRows(rowCount);
    const mapPackr = new Packr({ useRecords: false, bundleStrings: false });
    const bundledMapPackr = new Packr({ useRecords: false, bundleStrings: true });
    const recordPackr = new Packr({ bundleStrings: true });
    const sharedRecordPackr = new Packr({
        bundleStrings: true,
        structures: [],
        maxSharedStructures: 256,
    });

    const sharedRecordBytes = toExactBytes(sharedRecordPackr.pack(sample));
    const sharedStructures = cloneStructures(sharedRecordPackr.structures);

    return {
        sampleSummary: summarizeValue(sample),
        entries: [
            {
                label: 'standard maps',
                bytes: toExactBytes(mapPackr.pack(sample)),
                createDecoder: () =>
                    new Unpackr({
                        ...CURRENT_UNPACK_OPTIONS,
                        bundleStrings: false,
                    }),
            },
            {
                label: 'maps + bundleStrings',
                bytes: toExactBytes(bundledMapPackr.pack(sample)),
                createDecoder: () => new Unpackr(CURRENT_UNPACK_OPTIONS),
            },
            {
                label: 'records + bundleStrings',
                bytes: toExactBytes(recordPackr.pack(sample)),
                createDecoder: () => new Unpackr(CURRENT_UNPACK_OPTIONS),
            },
            {
                label: 'shared records + sidecar',
                bytes: sharedRecordBytes,
                sidecarBytes: toExactBytes(pack(sharedStructures)),
                createDecoder: () =>
                    new Unpackr({
                        ...CURRENT_UNPACK_OPTIONS,
                        structures: cloneStructures(sharedStructures),
                    }),
            },
        ],
    };
}

function printSyntheticSizes(entries) {
    console.log('Synthetic re-encode sizes');
    for (const entry of entries) {
        const gzipped = gzipSync(entry.bytes);
        if (entry.sidecarBytes) {
            const gzippedSidecar = gzipSync(entry.sidecarBytes);
            const totalRaw = entry.bytes.byteLength + entry.sidecarBytes.byteLength;
            const totalGzip = gzipped.byteLength + gzippedSidecar.byteLength;
            console.log(
                `  ${entry.label.padEnd(28)} payload raw ${formatBytes(entry.bytes.byteLength)} + sidecar ${formatBytes(entry.sidecarBytes.byteLength)} = ${formatBytes(totalRaw)}   payload gzip ${formatBytes(gzipped.byteLength)} + sidecar ${formatBytes(gzippedSidecar.byteLength)} = ${formatBytes(totalGzip)}`,
            );
            continue;
        }

        console.log(
            `  ${entry.label.padEnd(28)} raw ${formatBytes(entry.bytes.byteLength)}   gzip ${formatBytes(gzipped.byteLength)}`,
        );
    }
}

function inspectRemotePayload(bytes) {
    const decoder = new Unpackr({
        ...CURRENT_UNPACK_OPTIONS,
        structures: [],
    });
    const value = decoder.unpack(makeView(bytes));
    return {
        summary: summarizeValue(value),
        structureCount: decoder.structures?.length ?? 0,
    };
}

function collectRemoteDecodeCases(bytes, options) {
    const results = [
        runDecodeCase(
            'current runtime options',
            bytes,
            () => new Unpackr(CURRENT_UNPACK_OPTIONS),
            options,
        ),
    ];

    try {
        results.push(
            runDecodeCase(
                'bundleStrings disabled',
                bytes,
                () =>
                    new Unpackr({
                        ...CURRENT_UNPACK_OPTIONS,
                        bundleStrings: false,
                    }),
                options,
            ),
        );
    } catch (error) {
        console.log(
            `Remote payload does not decode with bundleStrings disabled: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    return results;
}

async function benchmarkSynthetic(options) {
    console.log('\n=== synthetic repeated-shape sample ===');
    const { sampleSummary, entries } = createSyntheticBuffers(options.syntheticRows);
    console.log(`Sample: ${sampleSummary} built from ${options.syntheticRows} repeated-shape rows`);
    printSyntheticSizes(entries);
    printDecodeTable(
        'Synthetic decode comparison',
        entries.map((entry) =>
            runDecodeCase(entry.label, entry.bytes, entry.createDecoder, options),
        ),
    );
}

async function benchmarkTarget(target, options) {
    console.log(`\n=== ${target.label} (${target.url}) ===`);

    try {
        const { compressed, bytes } = await fetchInflatedBytes(target.url, options);
        console.log(
            `Fetched ${formatBytes(compressed.byteLength)} gzip -> ${formatBytes(bytes.byteLength)} inflated`,
        );

        const inspection = inspectRemotePayload(bytes);
        console.log(`Decoded shape: ${inspection.summary}`);
        console.log(`Record structures declared in remote payload: ${inspection.structureCount}`);

        if (!options.benchmarkRemote) {
            console.log(
                'Remote repeated decode benchmark skipped. Pass --benchmark-remote once the payload is under the safety caps if you want throughput numbers.',
            );
            return;
        }

        printDecodeTable(
            'Remote payload decode',
            collectRemoteDecodeCases(bytes, options),
        );
        if (inspection.structureCount === 0) {
            console.log(
                'Shared-structure speedups are not available from the frontend alone on this payload; the producer would need to emit record/shared-structure encoding.',
            );
        }
    } catch (error) {
        console.log(error instanceof Error ? error.message : String(error));
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    console.log('msgpackr benchmark');
    console.log('  Safe defaults: synthetic only, remote inspection opt-in, remote size caps enabled.');
    console.log(`  Node native string acceleration: ${isNativeAccelerationEnabled}`);
    console.log('  Browser relevance: native acceleration is Node-only; bundleStrings and record encoding are the browser-facing levers.');
    console.log(`  Conflict id: ${options.conflictId}`);
    console.log(`  Origin: ${options.dataOrigin}`);

    if (options.synthetic) {
        await benchmarkSynthetic(options);
    }

    if (options.remote) {
        for (const target of buildTargets(options)) {
            await benchmarkTarget(target, options);
        }
        return;
    }

    console.log(
        '\nRemote payload inspection is disabled. Pass --remote to inspect the live payload boundary, and add --benchmark-remote only after the payload clears the safety caps.',
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});