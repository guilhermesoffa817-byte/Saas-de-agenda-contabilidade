import type { Metadata } from "next";

import { Comparativo } from "@/components/marketing/secoes/comparativo";
import { CtaFinal } from "@/components/marketing/secoes/cta-final";
import { Perguntas } from "@/components/marketing/secoes/perguntas";
import { Precos } from "@/components/marketing/secoes/precos";

export const metadata: Metadata = {
  title: "Preços do Alicerce — três planos, contador sempre de graça",
  description:
    "Planos mensais e anuais com dois meses grátis. Agenda, financeiro, fechamento do mês e acesso gratuito do contador em todos eles.",
  alternates: { canonical: "/precos" },
};

export default function PaginaPrecos() {
  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-4 text-center">
        <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
          Um preço, e o seu contador entra de graça.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Todos os planos têm agenda, link de agendamento, financeiro, fechamento do mês e
          relatórios. O que muda é o tamanho da equipe.
        </p>
      </section>

      <Precos
        titulo="Escolha pelo tamanho da sua equipe"
        subtitulo="Pague por mês ou no plano anual, que sai com dois meses de graça. Troque de plano quando a equipe crescer, sem perder o histórico."
      />
      <Comparativo />
      <Perguntas />
      <CtaFinal />
    </>
  );
}
