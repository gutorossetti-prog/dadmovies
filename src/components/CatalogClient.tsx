"use client";

import { useEffect, useMemo, useState } from "react";
import { MovieCard } from "@/components/MovieCard";
import { MovieDetailModal } from "@/components/MovieDetailModal";
import type { Movie, PersonalState, StreamingService } from "@/lib/types";

const SERVICES: Array<"Todos" | StreamingService> = ["Todos", "Netflix", "HBO Max", "Disney+", "Prime Video"];
const PERSONAL_STATE_STORAGE_KEY = "dadmovies.personal-state.v1";

type SortMode = "meta" | "users" | "year" | "title";
type StateFilter = PersonalState | "all";

function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomRank(key: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

export function CatalogClient({ movies }: { movies: Movie[] }) {
  const [service, setService] = useState<(typeof SERVICES)[number]>("Todos");
  const [genre, setGenre] = useState("Todos");
  const [language, setLanguage] = useState("Todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("meta");
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [stateFilter, setStateFilter] = useState<StateFilter>("watch");
  const [personalStates, setPersonalStates] = useState<Record<string, PersonalState>>({});
  const [randomKeys, setRandomKeys] = useState<string[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PERSONAL_STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, PersonalState>;
      if (parsed && typeof parsed === "object") setPersonalStates(parsed);
    } catch {
      // Ignore malformed/blocked localStorage and keep every movie as "watch".
    }
  }, []);

  function personalStateFor(movie: Movie): PersonalState {
    return personalStates[movie.key] ?? "watch";
  }

  function setMovieState(movie: Movie, state: PersonalState) {
    setPersonalStates((current) => {
      const next = { ...current };
      if (state === "watch") delete next[movie.key];
      else next[movie.key] = state;

      try {
        window.localStorage.setItem(PERSONAL_STATE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // UI still works for the current session if storage is unavailable.
      }
      return next;
    });
  }

  const genres = useMemo(() => {
    const values = new Set<string>();
    movies.forEach((movie) => movie.genres.forEach((g) => values.add(g)));
    return ["Todos", ...Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [movies]);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const movie of movies) {
      if (!movie.originalLanguage) continue;
      counts.set(movie.originalLanguage, (counts.get(movie.originalLanguage) ?? 0) + 1);
    }
    const names = new Intl.DisplayNames(["pt-BR"], { type: "language" });
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, count, label: names.of(code) ?? code.toUpperCase() }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }, [movies]);

  const stateCounts = useMemo(() => {
    const counts = { watch: 0, seen: 0, dismissed: 0 };
    for (const movie of movies) counts[personalStates[movie.key] ?? "watch"] += 1;
    return counts;
  }, [movies, personalStates]);

  const baseFiltered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return movies.filter((movie) => {
      if (onlyAvailable && movie.services.length === 0) return false;
      if (service !== "Todos" && !movie.services.includes(service)) return false;
      if (genre !== "Todos" && !movie.genres.includes(genre)) return false;
      if (language !== "Todos" && movie.originalLanguage !== language) return false;
      if (q && !movie.title.toLocaleLowerCase("pt-BR").includes(q)) return false;
      return true;
    });
  }, [movies, service, genre, language, query, onlyAvailable]);

  const filtered = useMemo(() => {
    const rows = baseFiltered
      .filter((movie) => stateFilter === "all" || (personalStates[movie.key] ?? "watch") === stateFilter)
      .slice();

    return rows.sort((a, b) => {
      if (shuffleSeed !== null) {
        const rankDiff = randomRank(a.key, shuffleSeed) - randomRank(b.key, shuffleSeed);
        return rankDiff || a.key.localeCompare(b.key);
      }
      if (sort === "users") return (b.userScore ?? -1) - (a.userScore ?? -1);
      if (sort === "year") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "title") return a.title.localeCompare(b.title, "pt-BR");
      return (b.metascore ?? -1) - (a.metascore ?? -1);
    });
  }, [baseFiltered, personalStates, stateFilter, sort, shuffleSeed]);

  const topRated = useMemo(() => {
    return movies
      .filter((movie) => (personalStates[movie.key] ?? "watch") === "watch" && movie.services.length > 0 && movie.metascore !== null)
      .sort((a, b) => (b.metascore ?? -1) - (a.metascore ?? -1))
      .slice(0, 10);
  }, [movies, personalStates]);

  const randomMovies = useMemo(() => {
    const byKey = new Map(movies.map((m) => [m.key, m]));
    return randomKeys.map((key) => byKey.get(key)).filter(Boolean) as Movie[];
  }, [movies, randomKeys]);

  function drawThree() {
    const candidates = baseFiltered.filter(
      (movie) => (personalStates[movie.key] ?? "watch") === "watch" && movie.services.length > 0 && movie.availabilityStatus === "confirmed",
    );
    setRandomKeys(shuffle(candidates).slice(0, 3).map((movie) => movie.key));
    window.setTimeout(() => document.getElementById("sorteio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function shuffleCatalog() {
    setShuffleSeed((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  }

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">CATÁLOGO DO PAIZÃO</span>
          <h1>Escolha um bom filme.<br />Sem perder meia hora escolhendo.</h1>
          <p>Uma estante visual com o que vale a pena ver e onde está disponível.</p>
        </div>
        <button className="primaryButton" onClick={drawThree}>Sortear 3 filmes</button>
      </section>

      {randomMovies.length > 0 && (
        <section id="sorteio" className="section spotlight">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">PARA HOJE</span>
              <h2>Três escolhas</h2>
            </div>
            <div className="sectionHeadingActions">
              <span className="mobileSwipeHint" aria-hidden="true">Deslize →</span>
              <button className="textButton" onClick={drawThree}>Sortear de novo</button>
            </div>
          </div>
          <div className="featuredGrid mobileShelf mobileShelfFeatured">
            {randomMovies.map((movie) => <MovieCard movie={movie} key={movie.key} onSelect={setSelectedMovie} />)}
          </div>
        </section>
      )}

      <section className="section">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">ATALHO</span>
            <h2>Melhores avaliados</h2>
          </div>
          <div className="sectionHeadingActions">
            <span className="mobileSwipeHint" aria-hidden="true">Deslize →</span>
            <span className="sectionNote">Metascore · disponíveis agora · ainda quero ver</span>
          </div>
        </div>
        <div className="topGrid mobileShelf mobileShelfTop">
          {topRated.map((movie) => <MovieCard movie={movie} compact key={movie.key} onSelect={setSelectedMovie} />)}
        </div>
      </section>

      <section className="section catalogSection">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">ESTANTE</span>
            <h2>Catálogo</h2>
          </div>
          <span className="sectionNote catalogCount">{filtered.length} títulos</span>
        </div>

        <div className="filters">
          <label className="searchBox">
            <span className="srOnly">Buscar filme</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar título…" inputMode="search" />
          </label>

          <div className="filterRow serviceFilter" role="group" aria-label="Filtrar por serviço">
            {SERVICES.map((item) => (
              <button key={item} onClick={() => setService(item)} className={service === item ? "active" : ""}>{item}</button>
            ))}
          </div>

          <div className="selectRow">
            <label>
              <span>Gênero</span>
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {genres.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Idioma original</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="Todos">Todos</option>
                {languages.map((item) => (
                  <option key={item.code} value={item.code}>{item.label} ({item.count})</option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilter)}>
                <option value="watch">Quero ver ({stateCounts.watch})</option>
                <option value="seen">Vistos ({stateCounts.seen})</option>
                <option value="dismissed">Não quero ver ({stateCounts.dismissed})</option>
                <option value="all">Todos ({movies.length})</option>
              </select>
            </label>
            <label>
              <span>Ordenar</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortMode);
                  setShuffleSeed(null);
                }}
              >
                <option value="meta">Metascore</option>
                <option value="users">Nota dos usuários</option>
                <option value="year">Mais recentes</option>
                <option value="title">Título</option>
              </select>
            </label>
            <label className="toggleLabel">
              <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
              <span>Só disponíveis nos 4 serviços</span>
            </label>
          </div>

          <button type="button" className="textButton" onClick={shuffleCatalog} aria-pressed={shuffleSeed !== null}>
            {shuffleSeed === null ? "↻ Embaralhar catálogo" : "↻ Embaralhar de novo"}
          </button>
        </div>

        <div className="catalogGrid">
          {filtered.map((movie) => <MovieCard movie={movie} key={movie.key} onSelect={setSelectedMovie} />)}
        </div>

        {filtered.length === 0 && <div className="emptyState">Nenhum filme corresponde a esses filtros.</div>}
      </section>

      <MovieDetailModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        personalState={selectedMovie ? personalStateFor(selectedMovie) : "watch"}
        onSetPersonalState={(state) => selectedMovie && setMovieState(selectedMovie, state)}
      />
    </>
  );
}
