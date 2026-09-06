export type StreamingService = "Netflix" | "HBO Max" | "Disney+" | "Prime Video";

export type Movie = {
  key: string;
  title: string;
  year: number | null;
  services: StreamingService[];
  availabilityStatus: "confirmed" | "unconfirmed";
  note: string;
  letterboxdUrl: string;
  metascore: number | null;
  userScore: number | null;
  posterUrl: string | null;
  genres: string[];
  originalLanguage?: string | null;
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
};
