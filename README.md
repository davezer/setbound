# Setbound SEO infrastructure pass

Built against the current `davezer/setbound` main branch on 2026-10-13.

## What it adds

- Descriptive page titles and meta descriptions
- Canonical URLs
- Open Graph metadata
- JSON-LD on the homepage, sets, subjects, and affiliations
- `robots.txt`
- Dynamic `sitemap.xml` powered by D1
- `noindex,follow` on search result pages
- Thin subject/team pages (<2 cards) are `noindex`
- Sitemap also excludes subject/team pages with fewer than 2 cards

## What it does NOT touch

- importer/parser logic
- collection behavior
- admin pages
- odds
- affiliations/data cleanup
- D1 schema
- product slugs
- card/checklist data

No migration is required.

## Install

From the Setbound project root:

1. Copy this zip's `src` folder over your project's `src` folder. These are **new files only**:
   - `src/lib/seo.js`
   - `src/routes/robots.txt/+server.js`
   - `src/routes/sitemap.xml/+server.js`
2. Put `apply-seo-pass.mjs` in the project root.
3. Run:

```powershell
node .\apply-seo-pass.mjs
npm run check
npm run dev
```

The patcher changes only the `<svelte:head>`/SEO portions of these existing pages and creates `.seo-backup` files beside them:

- `src/routes/+page.svelte`
- `src/routes/sets/+page.svelte`
- `src/routes/search/+page.svelte`
- `src/routes/sets/[slug]/+page.svelte`
- `src/routes/subjects/[id]/+page.svelte`
- `src/routes/teams/[id]/+page.svelte`

## Verify locally

Open:

- `/robots.txt`
- `/sitemap.xml`
- a set page
- a subject page
- a team page
- `/search?q=ohtani`

View page source and confirm title, description, canonical and JSON-LD are server-rendered.

## After production deploy

Add `https://setbound.app/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
