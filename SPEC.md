# Filmes para ver — v1 product spec

## Goal
A poster-first personal catalog for one very simple job: open the site, find a good movie, see where it is available, and start watching it.

The site is deliberately not a data-analysis product. Scores and availability are supporting metadata; the poster is the primary visual unit.

## Audience
Primary user: a family member who does not want to maintain a watchlist or operate a complex movie app.

## Canonical data
Google Sheet: `Letterboxd — Streaming Brasil`, tab `Disponibilidade`.

Consumed fields:
- Filme
- Ano
- Netflix
- HBO Max
- Disney+
- Prime Video
- Status
- Observação
- Letterboxd
- Metascore
- User Score

Ignored by the public UI:
- audit/helper sheets
- verification source plumbing
- spreadsheet mechanics

## Enrichment
TMDB is used only to enrich title + year with:
- poster
- genres
- TMDB id/type for matching/debugging

Matching is year-aware and supports movie + TV results. Ambiguous matches can be pinned in `src/data/tmdb-overrides.json`.

## Home hierarchy
1. Hero with one dominant action: `Sortear 3 filmes`
2. Three randomized, watchable choices
3. `Melhores avaliados`
4. Full poster catalog

## Random-3 rule
The draw operates on the currently filtered catalog and only selects titles that:
- have confirmed streaming status; and
- are available on at least one of Netflix / HBO Max / Disney+ / Prime Video.

This avoids recommending something the user cannot immediately watch.

## Ranking rule
`Melhores avaliados` is sorted by numeric Metascore, descending, and only includes titles available on at least one of the four target services.

No blended or proprietary score in v1.

## Card anatomy
Poster dominates the card.
Supporting information:
- title
- year
- up to three genres
- Metascore
- Metacritic user score
- streaming-service badges

`tbd` and `N/A` from the Sheet are rendered as an em dash rather than exposed as backend vocabulary.

## Filters
Minimal controls only:
- text search
- streaming service
- genre
- sort: Metascore / user score / year / title
- `Só disponíveis nos 4 serviços` toggle, enabled by default

Filters should never visually dominate the posters.

## Responsive layout
- phone: 2-column catalog
- tablet: 3–4 columns
- desktop: 5–6 columns
- random selection remains highly visible

## Data flow
`Google Sheet (published CSV) -> build-time sync -> TMDB enrichment -> catalog.json -> static Next.js UI -> Vercel`

Build-time enrichment is intentional: it avoids hundreds of TMDB calls on each visit and keeps the site fast and stable.

## Updating the catalog
For v1, a new Vercel build refreshes the Sheet snapshot and TMDB enrichment. Later, a Vercel Deploy Hook can make refresh a one-click action or be called automatically after Sheet maintenance.

## Non-goals for v1
- no accounts
- no login
- no database
- no CMS
- no per-user watchlist
- no charts or analytics
- no review text
- no recommendation algorithm
- no automatic streaming-provider discovery outside the Sheet
- no editing from the site

## Failure behavior
- no TMDB match -> neutral poster placeholder
- missing Metascore/User Score -> `—`
- no target streaming service -> hidden by default; visible when availability toggle is disabled
- uncertain Sheet streaming status -> not eligible for random-3

## Attribution
TMDB attribution must remain in the site credits/footer and follow TMDB branding requirements before public deployment.
