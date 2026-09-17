import type { MetadataRoute } from "next";

/**
 * O sistema logado, o portal do contador e as páginas públicas de agendamento
 * de cada cliente não entram em buscador: são área privada ou conteúdo de
 * terceiro, não do Alicerce.
 */
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/contador", "/comecar", "/agendar", "/api", "/auth", "/convite"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
