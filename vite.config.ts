import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import babel from '@rollup/plugin-babel';
// import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    plugins: [
        sveltekit(),
        // legacy({
        //     targets: ['defaults', 'not IE 11'],
        //     polyfills: ['es/object/has-own'],
        //     modernPolyfills: ['es/object/has-own'],
        // })
        babel({
            babelHelpers: 'bundled',
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
});
