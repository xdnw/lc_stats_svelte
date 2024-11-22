import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		esbuildOptions: {
		  target: 'es2020'
		}
	  },
	  build: {
		minify: true,
	  },
	  esbuild: {
		target: 'es2020',
	  },
	  server: {
		hmr: true,
	  },
});

