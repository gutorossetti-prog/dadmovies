"use client";

import { useMemo, useState } from "react";
import { MovieCard } from "@/components/MovieCard";
import { MovieDetailModal } from "@/components/MovieDetailModal";
import type { Movie, StreamingService } from "@/lib/types";

const SERVICES: Array<"Todos" | StreamingService> = ["Todos", "Netflix", "HBO Max", "Disney+", "Prime Video"];

type SortMode = "meta" | "users" | "year" | "title";

function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function CatalogClient({ movies }: { movies: Movie[] }) {
  const [service, setService] = useState<(typeof SERVICES)[number]>("Todos");
  const [genre, setGenre] = useState("Todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("meta");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [randomKeys, setRandomKeys] = useState<string[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const genres = useMemo(() => {
    const values = new Set<string>();
    movies.forEach((movie) => movie.genres.forEach((g) => values.add(g)));
    return ["Todos", ...Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [movies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const rows = movies.filter((movie) => {
      if (onlyAvailable && movie.services.length === 0) return false;
      if (service !== "Todos" && !movie.services.includes(service)) return false;
      if (genre !== "Todos" && !movie.genres.includes(genre)) return false;
      if (q && !movie.title.toLocaleLowerCase("pt-BR").includes(q)) return false;
      return true;
    });

    return rows.sort((a, b) => {
      if (sort === "users") return (b.userScore ?? -1) - (a.userScore ?? -1);
      if (sort === "year") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "title") return a.title.localeCompare(b.title, "pt-BR");
      return (b.metascore ?? -1) - (a.metascore ?? -1);
    });
  }, [movies, service, genre, query, sort, onlyAvailable]);

  const topRated = useMemo(() => {
    return movies
      .filter((movie) => movie.services.length > 0 && movie.metascore !== null)
      .sort((a, b) => (b.metascore ?? -1) - (a.metascore ?? -1))
      .slice(0, 10);
  }, [movies]);

  const randomMovies = useMemo(() => {
    const byKey = new Map(movies.map((m) => [m.key, m]));
    return randomKeys.map((key) => byKey.get(key)).filter(Boolean) as Movie[];
  }, [movies, randomKeys]);

  function drawThree() {
    const candidates = filtered.filter((movie) => movie.services.length > 0 && movie.availabilityStatus === "confirmed");
    setRandomKeys(shuffle(candidates).slice(0, 3).map((movie) => movie.key));
    window.setTimeout(() => document.getElementById("sorteio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">CATÁLOGO PESSOAL</span>
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
            <button className="textButton" onClick={drawThree}>Sortear de novo</button>
          </div>
          <div className="featuredGrid">
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
          <span className="sectionNote">Metascore · disponíveis agora</span>
        </div>
        <div className="topGrid">
          {topRated.map((movie) => <MovieCard movie={movie} compact key={movie.key} onSelect={setSelectedMovie} />)}
        </div>
      </section>

      <section className="section catalogSection">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">ESTANTE</span>
            <h2>Catálogo</h2>
          </div>
          <span className="sectionNote">{filtered.length} títulos</span>
        </div>

        <div className="filters">
          <label className="searchBox">
            <span className="srOnly">Buscar filme</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar título…" />
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
              <span>Ordenar</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
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
        </div>

        <div className="catalogGrid">
          {filtered.map((movie) => <MovieCard movie={movie} key={movie.key} onSelect={setSelectedMovie} />)}
        </div>

        {filtered.length === 0 && <div className="emptyState">Nenhum filme corresponde a esses filtros.</div>}
      </section>

      <MovieDetailModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
    </>
  );
}
