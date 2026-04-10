import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import babel from '@rollup/plugin-babel';
// import legacy from '@vitejs/plugin-legacy';

const DEFAULT_PUBLIC_DATA_ORIGIN = 'https://data.locutus.link';

function normalizePublicDataOrigin(value?: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
        return DEFAULT_PUBLIC_DATA_ORIGIN;
    }

    return trimmed.replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    // Keep app.html and client code aligned on one build-time public origin.
    process.env.PUBLIC_DATA_ORIGIN = normalizePublicDataOrigin(
        env.PUBLIC_DATA_ORIGIN || process.env.PUBLIC_DATA_ORIGIN,
    );

    return {
        plugins: [
            sveltekit(),
            // legacy({
            //     targets: ['defaults', 'not IE 11'],
            //     polyfills: ['es/object/has-own'],
            //     modernPolyfills: ['es/object/has-own'],
            // })
            babel({
                babelHelpers: 'bundled',
                // Do not transpile framework/runtime internals (breaks Svelte runes in Kit runtime).
                include: ['src/**/*', 'workers/**/*'],
                exclude: ['node_modules/**', '.svelte-kit/**'],
                presets: [
                    [
                        '@babel/preset-env',
                        {
                            targets: '> 0.25%, not dead',
                        },
                    ],
                ],
                extensions: ['.js', '.ts', '.jsx', '.tsx', '.mjs'],
            })
        ],
        optimizeDeps: {
            esbuildOptions: {
                target: 'es2016'
            }
        },
        build: {
            minify: true,
            target: 'es2016'
        },
        esbuild: {
            target: 'es2016'
        },
        server: {
            hmr: true
        },
    };
});
