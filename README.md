Frontend for https://wars.locutus.link.

This repo is a prerendered SvelteKit + Vite application for exploring Locutus conflict data. The app ships as static assets and reads its versioned payloads from `https://data.locutus.link`.

## Local development

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run check`
- `npm run verify:navigation`

## Main routes

- `/conflicts` for the conflicts index
- `/conflict?id=<id>` for the worker-backed conflict table
- `/bubble?id=<id>` for the bubble/time graph
- `/tiering?id=<id>` for the tiering/time graph
- `/aava?...` for alliance-vs-alliance analysis
- `/chord?id=<id>` for the chord/web view
- `/conflicts/view?...` for composite conflict comparison

## Implementation notes

- Built with SvelteKit, Vite, and a static adapter
- Uses worker-backed conflict and graph pipelines on the hot routes
- Uses a shared provider-driven Svelte data grid
- Uses `d3`, `nouislider`, `svelte-select`, and `msgpackr`
- Includes local forks of `bytebuffer.js` and `PSON` for legacy payload handling

Build output is written to `build/`. Production deploys target the root custom domain rather than a GitHub Pages subpath.
