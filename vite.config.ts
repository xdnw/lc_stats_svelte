import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { visualizer } from 'rollup-plugin-visualizer';

const SUPPORTED_BROWSER_VERSIONS = {
    chrome: '103',
    edge: '111',
    firefox: '114',
    safari: '14',
    ios: '14',
} as const;
const SUPPORTED_BROWSER_TARGETS = [
    `chrome >= ${SUPPORTED_BROWSER_VERSIONS.chrome}`,
    `edge >= ${SUPPORTED_BROWSER_VERSIONS.edge}`,
    `firefox >= ${SUPPORTED_BROWSER_VERSIONS.firefox}`,
    `safari >= ${SUPPORTED_BROWSER_VERSIONS.safari}`,
    `iOS >= ${SUPPORTED_BROWSER_VERSIONS.ios}`,
    'not IE 11',
];

export default defineConfig({
    plugins: [
        sveltekit(),

        // Keep a single modern bundle, but lower its browser floor and add
        // usage-detected polyfills for the module-capable browsers we can actually support.
        legacy({
            modernTargets: SUPPORTED_BROWSER_TARGETS,
            modernPolyfills: true,
            renderLegacyChunks: false,
        }),
        visualizer({
            emitFile: true,
            filename: 'stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
        }),
    ],

    build: {
        minify: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('/node_modules/d3')) {
                        return 'd3';
                    }

                    return undefined;
                },
            },
        },
    },

    server: {
        hmr: true,
    },
});