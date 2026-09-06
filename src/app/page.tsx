import { CatalogClient } from "@/components/CatalogClient";
import { getCatalog } from "@/lib/catalog";

export default async function Home() {
  const movies = await getCatalog();

  return (
    <main>
      <CatalogClient movies={movies} />
      <footer>
        <p>Dados de disponibilidade e notas: catálogo pessoal em Google Sheets.</p>
        <p>Posters e gêneros: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </footer>
    </main>
  );
}
