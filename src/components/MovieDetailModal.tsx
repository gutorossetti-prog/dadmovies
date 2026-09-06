"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Movie, PersonalState, StreamingService } from "@/lib/types";

type MovieDetails = {
  overview: string;
  tagline: string;
  runtime: number | null;
  cast: Array<{ name: string; character: string }>;
  crew: Array<{ name: string; role: string }>;
  trailer: { site: "YouTube"; key: string; name: string } | null;
};

const PERSONAL_STATE_PIN_HASH_KEY = "dadmovies.personal-state.pin-hash.v1";
const PERSONAL_STATE_PIN_SESSION_KEY = "dadmovies.personal-state.pin-session.v1";

function serviceClass(service: StreamingService) {
  if (service === "Netflix") return "service-netflix";
  if (service === "Prime Video") return "service-prime";
  if (service === "HBO Max") return "service-hbo";
  return "service-disney";
}

function serviceSearchUrl(service: StreamingService, title: string) {
  const query = encodeURIComponent(title);
  if (service === "Netflix") return `https://www.netflix.com/search?q=${query}`;
  if (service === "Prime Video") return `https://www.primevideo.com/search?phrase=${query}`;
  if (service === "HBO Max") return `https://play.max.com/search?q=${query}`;
  return `https://www.disneyplus.com/search?q=${query}`;
}

function stateLabel(state: PersonalState) {
  if (state === "seen") return "Visto";
  if (state === "dismissed") return "Não quero ver";
  return "Quero ver";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MovieDetailModal({
  movie,
  onClose,
  personalState,
  onSetPersonalState,
}: {
  movie: Movie | null;
  onClose: () => void;
  personalState: PersonalState;
  onSetPersonalState: (state: PersonalState) => void;
}) {
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [showTrailer, setShowTrailer] = useState(false);

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
    setShowTrailer(false);

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

  async function requestPersonalStateChange(nextState: PersonalState) {
    if (window.sessionStorage.getItem(PERSONAL_STATE_PIN_SESSION_KEY) === "1") {
      onSetPersonalState(nextState);
      return;
    }

    const storedHash = window.localStorage.getItem(PERSONAL_STATE_PIN_HASH_KEY);

    if (!storedHash) {
      const created = window.prompt("Crie um PIN de 4 a 6 dígitos para proteger alterações na lista:");
      if (created === null) return;
      if (!/^\d{4,6}$/.test(created)) {
        window.alert("O PIN precisa ter de 4 a 6 dígitos.");
        return;
      }
      const confirmation = window.prompt("Digite o mesmo PIN novamente para confirmar:");
      if (confirmation !== created) {
        window.alert("Os PINs não conferem.");
        return;
      }
      window.localStorage.setItem(PERSONAL_STATE_PIN_HASH_KEY, await sha256(created));
    } else {
      const entered = window.prompt("Digite o PIN para alterar o estado deste título:");
      if (entered === null) return;
      if ((await sha256(entered)) !== storedHash) {
        window.alert("PIN incorreto.");
        return;
      }
    }

    window.sessionStorage.setItem(PERSONAL_STATE_PIN_SESSION_KEY, "1");
    onSetPersonalState(nextState);
  }

  if (!movie) return null;

  const trailer = details?.trailer ?? null;

  return (
    <div className="modalBackdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="movieModal" role="dialog" aria-modal="true" aria-labelledby="movie-modal-title">
        <button className="modalClose" type="button" onClick={onClose} aria-label="Fechar detalhes">×</button>

        <div className="modalPosterColumn">
          {trailer ? (
            <button
              type="button"
              className="modalPosterWrap"
              onClick={() => setShowTrailer(true)}
              aria-label={`Assistir trailer de ${movie.title}`}
              style={{ width: "100%", padding: 0, cursor: "pointer", color: "inherit" }}
            >
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
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 18,
                  transform: "translateX(-50%)",
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "rgba(5,7,10,.88)",
                  border: "1px solid rgba(255,255,255,.16)",
                  color: "#fff",
                  fontSize: ".78rem",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                ▶ Trailer
              </span>
            </button>
          ) : (
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
          )}
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
              <a
                className={`serviceBadge ${serviceClass(service)}`}
                href={serviceSearchUrl(service, movie.title)}
                target="_blank"
                rel="noreferrer"
                key={service}
                aria-label={`Buscar ${movie.title} no ${service}`}
                title={`Buscar ${movie.title} no ${service}`}
                style={{ textDecoration: "none" }}
              >
                {service} ↗
              </a>
            )) : <span className="serviceBadge muted">Fora dos 4 serviços</span>}
          </div>

          <div className="modalScores">
            <div><strong>{movie.metascore === null ? "—" : Math.round(movie.metascore)}</strong><span>Metascore</span></div>
            <div><strong>{movie.userScore === null ? "—" : movie.userScore.toFixed(1)}</strong><span>User Score</span></div>
          </div>

          <div className="modalSection">
            <h3>Sua lista</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span className="serviceBadge muted">{stateLabel(personalState)}</span>
              {personalState !== "seen" && (
                <button className="textButton" type="button" onClick={() => void requestPersonalStateChange("seen")}>✓ Marcar como visto</button>
              )}
              {personalState !== "dismissed" && (
                <button className="textButton" type="button" onClick={() => void requestPersonalStateChange("dismissed")}>✕ Não quero ver</button>
              )}
              {personalState !== "watch" && (
                <button className="textButton" type="button" onClick={() => void requestPersonalStateChange("watch")}>Voltar para quero ver</button>
              )}
            </div>
            <p style={{ marginTop: 8, opacity: .62, fontSize: ".78rem" }}>Alterações da lista são protegidas por PIN; navegar e assistir não exige PIN.</p>
          </div>

          {showTrailer && trailer && (
            <div className="modalSection">
              <h3>Trailer</h3>
              <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", borderRadius: 14, background: "#05070a" }}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`}
                  title={`${trailer.name} — ${movie.title}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                />
              </div>
              <button className="textButton" type="button" onClick={() => setShowTrailer(false)} style={{ marginTop: 10 }}>Fechar trailer</button>
            </div>
          )}

          {status === "loading" && <p className="modalLoading">Carregando sinopse, créditos e trailer…</p>}

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
