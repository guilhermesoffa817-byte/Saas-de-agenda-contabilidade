import type { MetadataRoute } from "next";

function base() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Só as páginas públicas: o sistema logado e o portal do contador ficam fora. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = base();
  const agora = new Date();

  const paginas: { caminho: string; prioridade: number }[] = [
    { caminho: "/", prioridade: 1 },
    { caminho: "/precos", prioridade: 0.9 },
    { caminho: "/para-contadores", prioridade: 0.8 },
    { caminho: "/para-saloes", prioridade: 0.8 },
    { caminho: "/para-clinicas", prioridade: 0.8 },
    { caminho: "/para-personal", prioridade: 0.8 },
    { caminho: "/cadastro", prioridade: 0.6 },
    { caminho: "/entrar", prioridade: 0.4 },
    { caminho: "/termos", prioridade: 0.3 },
    { caminho: "/privacidade", prioridade: 0.3 },
  ];

  return paginas.map((pagina) => ({
    url: `${site}${pagina.caminho}`,
    lastModified: agora,
    changeFrequency: "monthly",
    priority: pagina.prioridade,
  }));
}
