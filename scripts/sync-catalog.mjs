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

function candidateTitle(result) {
  return result.title || result.name || result.original_title || result.original_name || "";
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
  const multi = await tmdbFetch(`/search/multi?query=${q}&include_adult=false&language=pt-BR`, token);
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
    tmdbFetch(`/search/movie?query=${q}&include_adult=false&language=pt-BR&region=BR${movieYear}`, token),
    tmdbFetch(`/search/tv?query=${q}&include_adult=false&language=pt-BR${tvYear}`, token),
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
      posterUrl: match?.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null,
      genres: genreIds.map((id) => genreMap.get(id)).filter(Boolean),
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
