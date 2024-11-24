import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
// import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    plugins: [
        sveltekit(),
        // legacy({
        //     targets: ['defaults', 'not IE 11'],
        //     polyfills: ['es/object/has-own'],
        //     modernPolyfills: ['es/object/has-own'],
        // })
    ],
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2020'
        }
    },
    build: {
        minify: true,
        target: 'es2020'
    },
    esbuild: {
        target: 'es2020'
    },
    server: {
        hmr: true
    },
});