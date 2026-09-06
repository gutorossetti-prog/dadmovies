import type { Movie } from "@/lib/types";
import { demoCatalog } from "@/data/demo-catalog";

export async function getCatalog(): Promise<Movie[]> {
  try {
    const catalog = await import("@/data/catalog.json");
    const movies = catalog.default as Movie[];
    return movies.length ? movies : demoCatalog;
  } catch {
    return demoCatalog;
  }
}
