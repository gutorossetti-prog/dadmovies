import { NextResponse } from "next/server";

const CREW_ROLES = [
  ["Director", "Direção"],
  ["Screenplay", "Roteiro"],
  ["Writer", "Roteiro"],
  ["Story", "História"],
  ["Director of Photography", "Fotografia"],
  ["Original Music Composer", "Música"],
  ["Producer", "Produção"],
  ["Executive Producer", "Produção executiva"],
] as const;

type TmdbPerson = {
  name?: string;
  character?: string;
  job?: string;
};

async function tmdbFetch(type: "movie" | "tv", id: string, language: string, token: string) {
  return fetch(
    `https://api.themoviedb.org/3/${type}/${id}?language=${language}&append_to_response=credits`,
    {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 7 },
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type: rawType, id } = await params;
  const type = rawType === "movie" || rawType === "tv" ? rawType : null;

  if (!type || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid TMDB reference" }, { status: 400 });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TMDB is not configured" }, { status: 503 });
  }

  const response = await tmdbFetch(type, id, "pt-BR", token);
  if (!response.ok) {
    return NextResponse.json({ error: "TMDB lookup failed" }, { status: response.status });
  }

  const data = await response.json();
  let overview = String(data.overview || "").trim();

  if (!overview) {
    const fallback = await tmdbFetch(type, id, "en-US", token);
    if (fallback.ok) {
      const fallbackData = await fallback.json();
      overview = String(fallbackData.overview || "").trim();
    }
  }

  const cast = (data.credits?.cast || [])
    .slice(0, 8)
    .map((person: TmdbPerson) => ({
      name: person.name || "",
      character: person.character || "",
    }))
    .filter((person: { name: string }) => person.name);

  const crew: Array<{ name: string; role: string }> = [];
  const seen = new Set<string>();

  if (type === "tv") {
    for (const person of data.created_by || []) {
      if (!person?.name) continue;
      const key = `${person.name}|Criação`;
      if (!seen.has(key)) {
        seen.add(key);
        crew.push({ name: person.name, role: "Criação" });
      }
    }
  }

  const creditsCrew: TmdbPerson[] = data.credits?.crew || [];
  for (const [job, role] of CREW_ROLES) {
    const people = creditsCrew.filter((person) => person.job === job).slice(0, 2);
    for (const person of people) {
      if (!person.name) continue;
      const key = `${person.name}|${role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      crew.push({ name: person.name, role });
      if (crew.length >= 8) break;
    }
    if (crew.length >= 8) break;
  }

  return NextResponse.json({
    overview,
    tagline: String(data.tagline || "").trim(),
    runtime: data.runtime || data.episode_run_time?.[0] || null,
    cast,
    crew,
  });
}
