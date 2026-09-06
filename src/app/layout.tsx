import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filmes para ver",
  description: "Catálogo visual pessoal para escolher o próximo filme.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
