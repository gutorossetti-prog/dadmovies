"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Movie, StreamingService } from "@/lib/types";

type MovieDetails = {
  overview: string;
  tagline: string;
  runtime: number | null;
  cast: Array<{ name: string; character: string }>;
  crew: Array<{ name: string; role: string }>;
};

function serviceClass(service: StreamingService) {
  if (service === "Netflix") return "service-netflix";
  if (service === "Prime Video") return "service-prime";
  if (service === "HBO Max") return "service-hbo";
  return "service-disney";
}

export function MovieDetailModal({ movie, onClose }: { movie: Movie | null; onClose: () => void }) {
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!movie) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [movie, onClose]);

  useEffect(() => {
    if (!movie) {
      setDetails(null);
      setStatus("idle");
      return;
    }

    setDetails(null);

    if (!movie.tmdbId || !movie.tmdbType) {
      setStatus("error");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");

    fetch(`/api/movie/${movie.tmdbType}/${movie.tmdbId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Details request failed: ${response.status}`);
        return response.json() as Promise<MovieDetails>;
      })
      .then((data) => {
        setDetails(data);
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [movie]);

  if (!movie) return null;

  return (
    <div className="modalBackdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="movieModal" role="dialog" aria-modal="true" aria-labelledby="movie-modal-title">
        <button className="modalClose" type="button" onClick={onClose} aria-label="Fechar detalhes">×</button>

        <div className="modalPosterColumn">
          <div className="modalPosterWrap">
            {movie.posterUrl ? (
              <Image
                src={movie.posterUrl}
                alt={`Pôster de ${movie.title}`}
                fill
                sizes="(max-width: 700px) 70vw, 300px"
                className="poster"
              />
            ) : (
              <div className="posterFallback"><span>{movie.title}</span></div>
            )}
          </div>
        </div>

        <div className="modalBody">
          <span className="eyebrow">DETALHES</span>
          <h2 id="movie-modal-title">{movie.title}</h2>

          <div className="modalMetaLine">
            {movie.year && <span>{movie.year}</span>}
            {movie.genres.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}
            {details?.runtime ? <span>{details.runtime} min</span> : null}
          </div>

          <div className="services modalServices" aria-label="Onde assistir">
            {movie.services.length ? movie.services.map((service) => (
              <span className={`serviceBadge ${serviceClass(service)}`} key={service}>{service}</span>
            )) : <span className="serviceBadge muted">Fora dos 4 serviços</span>}
          </div>

          <div className="modalScores">
            <div><strong>{movie.metascore === null ? "—" : Math.round(movie.metascore)}</strong><span>Metascore</span></div>
            <div><strong>{movie.userScore === null ? "—" : movie.userScore.toFixed(1)}</strong><span>User Score</span></div>
          </div>

          {status === "loading" && <p className="modalLoading">Carregando sinopse e créditos…</p>}

          {status === "error" && (
            <p className="modalLoading">Sinopse e créditos ainda não estão disponíveis para este título.</p>
          )}

          {status === "ready" && details && (
            <>
              {details.tagline && <p className="tagline">{details.tagline}</p>}

              <div className="modalSection">
                <h3>Sinopse</h3>
                <p>{details.overview || "Sinopse não disponível."}</p>
              </div>

              {details.cast.length > 0 && (
                <div className="modalSection">
                  <h3>Elenco</h3>
                  <div className="creditGrid">
                    {details.cast.map((person) => (
                      <div className="creditItem" key={`${person.name}|${person.character}`}>
                        <strong>{person.name}</strong>
                        {person.character && <span>{person.character}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {details.crew.length > 0 && (
                <div className="modalSection">
                  <h3>Equipe</h3>
                  <div className="creditGrid">
                    {details.crew.map((person) => (
                      <div className="creditItem" key={`${person.name}|${person.role}`}>
                        <strong>{person.name}</strong>
                        <span>{person.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
