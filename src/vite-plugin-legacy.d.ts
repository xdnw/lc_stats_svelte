declare module '@vitejs/plugin-legacy' {
    import type { Plugin } from 'vite';

    export interface LegacyOptions {
        modernTargets?: string | string[];
        modernPolyfills?: boolean | string[];
        renderLegacyChunks?: boolean;
    }

    export default function legacy(options?: LegacyOptions): Plugin[];
}