# Setbound collector suite

Adds:

- User registration / login / logout
- 30-day server sessions
- D1-backed Have / Want tracking
- `/collection`
- Per-set progress
- Want list
- Guest browser collection import
- Owned / Wanted / Missing filters
- Grouped search results for sets, players/subjects, teams/affiliations and cards
- Product release date + collector notes
- Admin product metadata editor

## Install

No new npm packages are required.

Apply locally:

```powershell
npx wrangler d1 migrations apply setbound --local
```

Apply production:

```powershell
npx wrangler d1 migrations apply setbound --remote
```

Then restart:

```powershell
npm run dev
```

## Smoke test

1. `/auth/register`
2. Open a set and mark cards Have / Want.
3. `/collection`
4. Test Owned / Wanted / Missing filters on a set.
5. `/search?q=Ohtani`
6. `/admin/sets` -> Edit details -> add release date / note.
