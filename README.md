Frontend for https://wars.locutus.link written in svelte
(built to static js/html with node.js / vite)

`npm run dev`
or
`npm run build`

Svelte: <https://kit.svelte.dev/>

Libraries used:
bootstrap (js/css/icons)
halfmoon (modern: bootstrap theme)
chart.js
datatables + colreorder, numeric-comma
jquery
bytebuffer.js (forked and modified to support longs)
PSON (forked and modified to support longs)

Backend hosted on AWS
- message me on discord to be whitelisted

## Pages
(in `/src`)
- `page.svelte` (which has a locutus logo and a link to the conflicts page)
- `conflicts/page.svelte` (which loads the `conflicts.gzip` and displays them)
- `conflict/page.svelte` (loads `/conflicts/<id>.gzip` and displays a table for a specific conflict, as well as the timeline
- `tiering/page.svelte` (loads `/conflict/graphs/<id>.gzip` and displays the tiering graphs)

index.ts (shared script)
app.html (shared html (head))

### Components:
- Footer.svelte
- Navbar.svelte
- Sidebar.svelte