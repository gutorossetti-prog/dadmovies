import { CatalogClient } from "@/components/CatalogClient";
import { getCatalog } from "@/lib/catalog";

export default async function Home() {
  const movies = await getCatalog();

  return (
    <main>
      <CatalogClient movies={movies} />
      <footer>
        <p>Disponibilidade de streaming no Brasil: JustWatch, via TMDB. Notas: catálogo pessoal em Google Sheets.</p>
        <p>Posters, gêneros, sinopses, créditos e trailers: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </footer>
    </main>
  );
}
