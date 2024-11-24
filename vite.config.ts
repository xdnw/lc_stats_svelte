import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import babel from '@rollup/plugin-babel';

export default defineConfig({
    plugins: [
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
        minify: true
    },
    esbuild: {
        target: 'es2016'
    },
    server: {
        hmr: true
    },
});