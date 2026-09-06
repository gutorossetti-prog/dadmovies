import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/data/catalog.json");
const UNMATCHED = path.join(ROOT, "src/data/tmdb-unmatched.json");
const OVERRIDES = path.join(ROOT, "src/data/tmdb-overrides.json");
const allowFallback = process.argv.includes("--allow-fallback");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ""; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function numberOrNull(value) {
  if (!value || value === "N/A" || value.toLowerCase() === "tbd") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateYear(result) {
  const d = result.release_date || result.first_air_date || "";
  const y = Number(String(d).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function scoreCandidate(result, title, year) {
  const q = normalize(title);
  const variants = [result.title, result.name, result.original_title, result.original_name].map(normalize);
  let score = 0;
  if (variants.includes(q)) score += 20;
  else if (variants.some((v) => v && (v.includes(q) || q.includes(v)))) score += 8;
  const cy = candidateYear(result);
  if (year && cy === year) score += 10;
  else if (year && cy && Math.abs(cy - year) === 1) score += 4;
  score += Math.min(Number(result.popularity || 0) / 100, 2);
  return score;
}

async function tmdbFetch(endpoint, token) {
  const res = await fetch(`https://api.themoviedb.org/3${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${endpoint}`);
  return res.json();
}

const NATIVE_POSTER_LANGUAGES = new Set(["en", "es", "pt"]);
const TMDB_LANGUAGE_TAG = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
};

function posterLanguagePriority(originalLanguage) {
  // Preserve the original poster language for English, Spanish and Portuguese.
  // For every other original language, prefer a Portuguese poster for DadMovies.
  const preferred = NATIVE_POSTER_LANGUAGES.has(originalLanguage) ? originalLanguage : "pt";
  const priority = [preferred, "pt", "en", null];
  return priority.filter((language, index) => priority.indexOf(language) === index);
}

function bestPoster(posters) {
  return [...posters].sort((a, b) => {
    const voteDiff = Number(b.vote_average || 0) - Number(a.vote_average || 0);
    if (voteDiff !== 0) return voteDiff;
    const countDiff = Number(b.vote_count || 0) - Number(a.vote_count || 0);
    if (countDiff !== 0) return countDiff;
    return Number(b.width || 0) - Number(a.width || 0);
  })[0] ?? null;
}

async function selectPosterPath(match, token) {
  if (!match?.id || !match?.media_type) return null;

  const priority = posterLanguagePriority(match.original_language);
  const preferred = priority.find(Boolean) || "pt";
  const language = TMDB_LANGUAGE_TAG[preferred] || "pt-BR";
  const includeLanguages = priority
    .map((value) => value ?? "null")
    .join(",");

  try {
    const images = await tmdbFetch(
      `/${match.media_type}/${match.id}/images?language=${language}&include_image_language=${encodeURIComponent(includeLanguages)}`,
      token,
    );
    const posters = images.posters || [];

    for (const wantedLanguage of priority) {
      const candidates = posters.filter((poster) => (poster.iso_639_1 ?? null) === wantedLanguage);
      const selected = bestPoster(candidates);
      if (selected?.file_path) return selected.file_path;
    }
  } catch (error) {
    console.warn(`TMDB poster lookup failed for ${match.media_type}/${match.id}:`, error.message);
  }

  // The match itself was searched in en-US. This is a safe final fallback if the
  // image endpoint has no poster in the requested language chain.
  return match.poster_path ?? null;
}

async function loadOverrides() {
  try { return JSON.parse(await fs.readFile(OVERRIDES, "utf8")); }
  catch { return {}; }
}

async function matchTmdb(title, year, token, overrides) {
  const key = `${title}|${year ?? ""}`;
  if (overrides[key]) {
    const o = overrides[key];
    const details = await tmdbFetch(`/${o.type}/${o.id}?language=pt-BR`, token);
    return { ...details, media_type: o.type };
  }

  const q = encodeURIComponent(title);

  // The Sheet/Letterboxd titles are predominantly international English titles.
  // Search in en-US so translated titles such as "Howl's Moving Castle" and
  // "City of God" are present in the returned title fields used by our scorer.
  // Display metadata (genres/details) remains localized separately in pt-BR.
  const multi = await tmdbFetch(`/search/multi?query=${q}&include_adult=false&language=en-US`, token);
  const candidates = (multi.results || [])
    .filter((x) => x.media_type === "movie" || x.media_type === "tv")
    .slice(0, 12)
    .map((x) => ({ ...x, _score: scoreCandidate(x, title, year) }))
    .sort((a, b) => b._score - a._score);

  if (candidates[0]?._score >= 18) return candidates[0];

  // Year-aware fallback for ambiguous or weak multi-search matches.
  const movieYear = year ? `&primary_release_year=${year}` : "";
  const tvYear = year ? `&first_air_date_year=${year}` : "";
  const [movie, tv] = await Promise.all([
    tmdbFetch(`/search/movie?query=${q}&include_adult=false&language=en-US${movieYear}`, token),
    tmdbFetch(`/search/tv?query=${q}&include_adult=false&language=en-US${tvYear}`, token),
  ]);

  const strict = [
    ...(movie.results || []).slice(0, 6).map((x) => ({ ...x, media_type: "movie" })),
    ...(tv.results || []).slice(0, 6).map((x) => ({ ...x, media_type: "tv" })),
  ].map((x) => ({ ...x, _score: scoreCandidate(x, title, year) }))
    .sort((a, b) => b._score - a._score);

  return strict[0]?._score >= 18 ? strict[0] : null;
}

async function main() {
  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;
  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!csvUrl || !token) {
    if (allowFallback) {
      console.log("Catalog sync skipped: GOOGLE_SHEET_CSV_URL or TMDB_READ_ACCESS_TOKEN not set. Demo catalog will be used.");
      return;
    }
    throw new Error("Set GOOGLE_SHEET_CSV_URL and TMDB_READ_ACCESS_TOKEN before syncing.");
  }

  const csvRes = await fetch(csvUrl, { cache: "no-store" });
  if (!csvRes.ok) throw new Error(`Sheet CSV returned ${csvRes.status}`);
  const rows = parseCsv(await csvRes.text());
  const headers = rows.shift();
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const required = ["Filme", "Ano", "Netflix", "HBO Max", "Disney+", "Prime Video", "Status", "Observação", "Letterboxd", "Metascore", "User Score"];
  for (const h of required) if (!(h in idx)) throw new Error(`Missing sheet column: ${h}`);

  const movieGenres = await tmdbFetch("/genre/movie/list?language=pt-BR", token);
  const tvGenres = await tmdbFetch("/genre/tv/list?language=pt-BR", token);
  const genreMap = new Map([...movieGenres.genres, ...tvGenres.genres].map((g) => [g.id, g.name]));
  const overrides = await loadOverrides();

  const catalog = [];
  const unmatched = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const title = r[idx["Filme"]]?.trim();
    if (!title) continue;
    const year = numberOrNull(r[idx["Ano"]]);
    const services = [];
    if (r[idx["Netflix"]] === "Sim") services.push("Netflix");
    if (r[idx["HBO Max"]] === "Sim") services.push("HBO Max");
    if (r[idx["Disney+"]] === "Sim") services.push("Disney+");
    if (r[idx["Prime Video"]] === "Sim") services.push("Prime Video");

    let match = null;
    try { match = await matchTmdb(title, year, token, overrides); }
    catch (error) { console.warn(`TMDB error for ${title}:`, error.message); }

    if (!match) unmatched.push({ title, year });
    const genreIds = match?.genre_ids || match?.genres?.map((g) => g.id) || [];

    let posterPath = null;
    if (match) posterPath = await selectPosterPath(match, token);

    catalog.push({
      key: `${title}|${year ?? ""}`,
      title,
      year,
      services,
      availabilityStatus: r[idx["Status"]] === "Confirmado" ? "confirmed" : "unconfirmed",
      note: r[idx["Observação"]] || "",
      letterboxdUrl: r[idx["Letterboxd"]] || "",
      metascore: numberOrNull(r[idx["Metascore"]]),
      userScore: numberOrNull(r[idx["User Score"]]),
      posterUrl: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
      genres: genreIds.map((id) => genreMap.get(id)).filter(Boolean),
      originalLanguage: match?.original_language ?? null,
      tmdbId: match?.id ?? null,
      tmdbType: match?.media_type ?? null,
    });

    if ((i + 1) % 25 === 0) console.log(`Enriched ${i + 1}/${rows.length}`);
    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  await fs.writeFile(OUT, JSON.stringify(catalog, null, 2) + "\n");
  await fs.writeFile(UNMATCHED, JSON.stringify(unmatched, null, 2) + "\n");
  console.log(`Wrote ${catalog.length} titles to ${path.relative(ROOT, OUT)}; unmatched: ${unmatched.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
