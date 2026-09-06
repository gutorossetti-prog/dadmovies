import type { Metadata } from "next";
import "./globals.css";
import "./mobile.css";
import "./series-placeholder.css";
import "./genre-shelves.css";

export const metadata: Metadata = {
  title: "Catálogo do Paizão",
  description: "Catálogo visual de filmes e séries do Paizão para escolher o que ver.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
