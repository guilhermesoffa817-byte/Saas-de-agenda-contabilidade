import type { Metadata } from "next";

import { Comparativo } from "@/components/marketing/secoes/comparativo";
import { CtaFinal } from "@/components/marketing/secoes/cta-final";
import { Funcionalidades } from "@/components/marketing/secoes/funcionalidades";
import { Hero } from "@/components/marketing/secoes/hero";
import { ParaContadores } from "@/components/marketing/secoes/para-contadores";
import { ParaQuem } from "@/components/marketing/secoes/para-quem";
import { Perguntas, PERGUNTAS_FREQUENTES } from "@/components/marketing/secoes/perguntas";
import { Pilares } from "@/components/marketing/secoes/pilares";
import { Precos } from "@/components/marketing/secoes/precos";
import { Problema } from "@/components/marketing/secoes/problema";
import { ProvaSocial } from "@/components/marketing/secoes/prova-social";
import { Tour } from "@/components/marketing/secoes/tour";
import { PLANOS } from "@/lib/planos";

export const metadata: Metadata = {
  title: "Alicerce — agenda e financeiro do seu negócio em um só lugar",
  description:
    "Agenda online com link próprio, controle financeiro simples e relatórios prontos para o contador. Teste grátis por 7 dias, sem cartão.",
  alternates: { canonical: "/" },
};

export default function PaginaInicial() {
  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Alicerce",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        description:
          "Sistema de agenda e financeiro para autônomos e pequenos negócios, com fechamento do mês e relatórios para o contador.",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "BRL",
          lowPrice: (PLANOS.essencial.mensalCents / 100).toFixed(2),
          highPrice: (PLANOS.negocio.mensalCents / 100).toFixed(2),
          offerCount: 3,
        },
        featureList: [
          "Agendamento online por link",
          "Lembrete no WhatsApp",
          "Controle financeiro em centavos",
          "Fechamento do mês",
          "Relatórios em PDF, Excel e CSV",
          "Portal do contador",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: PERGUNTAS_FREQUENTES.map((item) => ({
          "@type": "Question",
          name: item.pergunta,
          acceptedAnswer: { "@type": "Answer", text: item.resposta },
        })),
      },
    ],
  };

  return (
    <>
      {/* Dados estruturados: ajudam o Google a entender que é um software com preço. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados) }}
      />

      <Hero />
      <Problema />
      <Pilares />
      <Tour />
      <Funcionalidades />
      <ParaQuem />
      <ProvaSocial />
      <Comparativo />
      <ParaContadores />
      <Precos />
      <Perguntas />
      <CtaFinal />
    </>
  );
}
