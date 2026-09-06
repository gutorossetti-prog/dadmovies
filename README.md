# Filmes para ver

Poster-first family movie catalog powered by a Google Sheet and enriched with TMDB posters/genres.

## Stack
- Next.js 16.3.3 / React 19.2
- Vercel
- Google Sheets published CSV as canonical catalog source
- TMDB for posters and genres
- no database

## Local setup

```bash
npm install
cp .env.example .env.local
# fill GOOGLE_SHEET_CSV_URL and TMDB_READ_ACCESS_TOKEN
npm run sync:catalog
npm run dev
```

If the environment variables are absent, the app intentionally falls back to a small demo catalog so the UI can still be reviewed.

## Google Sheet
Publish only the `Disponibilidade` tab as CSV (or use a dedicated sanitized mirror tab if preferred). Put the resulting URL in `GOOGLE_SHEET_CSV_URL`.

The sync expects these exact headers:
`Filme`, `Ano`, `Netflix`, `HBO Max`, `Disney+`, `Prime Video`, `Status`, `Observação`, `Letterboxd`, `Metascore`, `User Score`.

## TMDB
Create a TMDB developer API credential and put the API Read Access Token in `TMDB_READ_ACCESS_TOKEN`. The token stays server/build-side and is not exposed through `NEXT_PUBLIC_*` variables.

The sync searches both movie and TV endpoints using title + year. For an ambiguous title, add a manual mapping to `src/data/tmdb-overrides.json`:

```json
{
  "Example Title|1999": { "type": "movie", "id": 123 }
}
```

Then rerun `npm run sync:catalog`.

## Vercel
1. Connect `gutorossetti-prog/dadmovies` to the Vercel project.
2. Add `GOOGLE_SHEET_CSV_URL` and `TMDB_READ_ACCESS_TOKEN` in Vercel Environment Variables.
3. Deploy. `prebuild` automatically refreshes the catalog.

Git integration verified by deployment-trigger commit on 2026-09-06.

## Product rules
See `SPEC.md`.
