"use client";

import Image from "next/image";
import type { Movie } from "@/lib/types";

function Score({ label, value, scale = 100 }: { label: string; value: number | null; scale?: number }) {
  return (
    <div className="score">
      <span className="scoreValue">{value === null ? "—" : scale === 10 ? value.toFixed(1) : Math.round(value)}</span>
      <span className="scoreLabel">{label}</span>
    </div>
  );
}

export function MovieCard({ movie, compact = false }: { movie: Movie; compact?: boolean }) {
  return (
    <article className={`movieCard ${compact ? "compact" : ""}`}>
      <div className="posterWrap">
        {movie.posterUrl ? (
          <Image
            src={movie.posterUrl}
            alt={`Pôster de ${movie.title}`}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1100px) 28vw, 220px"
            className="poster"
          />
        ) : (
          <div className="posterFallback" aria-label="Pôster indisponível">
            <span>{movie.title}</span>
          </div>
        )}
        <div className="posterScores">
          <Score label="Meta" value={movie.metascore} />
          <Score label="Users" value={movie.userScore} scale={10} />
        </div>
      </div>

      <div className="movieInfo">
        <div className="titleRow">
          <h3>{movie.title}</h3>
          {movie.year && <span className="year">{movie.year}</span>}
        </div>

        {movie.genres.length > 0 && (
          <p className="genres">{movie.genres.slice(0, 3).join(" · ")}</p>
        )}

        <div className="services" aria-label="Onde assistir">
          {movie.services.length ? (
            movie.services.map((service) => (
              <span className="serviceBadge" key={service}>{service}</span>
            ))
          ) : (
            <span className="serviceBadge muted">Fora dos 4 serviços</span>
          )}
        </div>
      </div>
    </article>
  );
}
