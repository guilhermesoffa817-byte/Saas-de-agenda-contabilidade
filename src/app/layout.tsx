import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz", "SOFT"] });

const enderecoDoSite = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const metadata: Metadata = {
  metadataBase: new URL(enderecoDoSite),
  title: {
    default: "Alicerce — agenda e financeiro do seu negócio em um só lugar",
    template: "%s · Alicerce",
  },
  description:
    "Agenda online, controle financeiro simples e relatórios prontos para o contador. Teste grátis por 7 dias, sem cartão.",
  applicationName: "Alicerce",
  keywords: [
    "agenda online",
    "sistema para salão",
    "agenda para barbearia",
    "financeiro para autônomo",
    "livro-caixa carnê-leão",
    "relatório para contador",
    "MEI",
  ],
  authors: [{ name: "Alicerce" }],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Alicerce",
    url: enderecoDoSite,
    title: "Alicerce — agenda e financeiro do seu negócio em um só lugar",
    description:
      "Agenda online, financeiro sem planilha e relatório pronto para o seu contador. Teste grátis por 7 dias, sem cartão.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Alicerce — agenda e financeiro do seu negócio",
    description:
      "Agenda online, financeiro sem planilha e relatório pronto para o seu contador.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
