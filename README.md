# setbound MVP

Clean sports-card checklist search + a generic PDF ingestion pipeline. SvelteKit, JavaScript, Cloudflare Pages/Workers, and D1.

## MVP includes
- Clean public home, set browser, set detail, global card search
- Browser-local "owned" checkboxes + set completion progress (no account required yet)
- Generic checklist PDF import screen
- Browser-side PDF text extraction with PDF.js
- Heuristic section/card detection; not hard-coded to Allen & Ginter
- Canonical affiliation matching with aliases and historical teams
- NIL fallback when no affiliation is present
- Confidence scoring + review screen before D1 import
- D1 schema for sports, manufacturers, products, checklists, subjects, affiliations, cards, and sources
- Baseball seeded first, with football/basketball/hockey sports already modeled

## Run locally
1. `npm install`
2. Create a D1 database: `npx wrangler d1 create setbound`
3. Put the returned database ID in `wrangler.toml`
4. `npm run cf:migrate:local`
5. `npm run cf:seed:local`
6. Use `npx wrangler pages dev .svelte-kit/cloudflare --compatibility-date=2026-09-01` after a build, or configure your normal Cloudflare Pages dev workflow.

For plain UI work, `npm run dev` works, but D1-backed pages need the Cloudflare binding. The home page intentionally falls back to preview content when D1 is absent.

## Deploy
- Create/bind D1 as `DB`
- Run `npm run cf:migrate`
- Run `npm run cf:seed`
- Build command: `npm run build`
- Output: `.svelte-kit/cloudflare`

## Importing
Open `/admin/import`, fill in the product metadata, then upload an official manufacturer PDF. PDF.js extracts the text in the browser. `checklist-parser.js` detects headings and rows using document structure and a growing affiliation vocabulary. Review low-confidence rows before importing.

### Important MVP note
The importer is deliberately generic but still heuristic. PDFs are chaotic. The long-term direction should be adapters for extraction quality (PDF/XLSX/CSV/HTML) feeding this same canonical parser + review flow, not set-specific parsers.

### Security note
`/admin/import` is not authenticated in this MVP. Add your preferred auth/admin gate before exposing it publicly.
