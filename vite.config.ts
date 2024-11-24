import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    plugins: [
        sveltekit(),
        legacy({
            targets: ['defaults', 'not IE 11']
        })
    ],
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2015'
        }
    },
    build: {
        minify: true,
        target: 'es2015'
    },
    esbuild: {
        target: 'es2015'
    },
    server: {
        hmr: true
    },
});