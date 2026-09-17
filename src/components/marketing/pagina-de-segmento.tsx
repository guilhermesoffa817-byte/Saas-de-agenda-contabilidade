import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { CtaFinal } from "@/components/marketing/secoes/cta-final";
import { Perguntas } from "@/components/marketing/secoes/perguntas";
import { Precos } from "@/components/marketing/secoes/precos";
import { Reveal } from "@/components/marketing/reveal";
import { TelaAgenda } from "@/components/marketing/telas/tela-agenda";
import { Button } from "@/components/ui/button";

export type ConteudoDeSegmento = {
  eyebrow: string;
  icone: LucideIcon;
  titulo: string;
  subtitulo: string;
  dores: { titulo: string; texto: string }[];
  ganhos: string[];
  fiscal?: { titulo: string; texto: string };
};

/** Molde das páginas por segmento: mesma estrutura, texto e CTA próprios. */
export function PaginaDeSegmento({ conteudo }: { conteudo: ConteudoDeSegmento }) {
  const Icone = conteudo.icone;

  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 pt-12 pb-16 lg:grid-cols-[5fr_6fr] lg:items-center lg:pt-20">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="flex w-fit items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-ink">
            <Icone className="size-3.5" aria-hidden />
            {conteudo.eyebrow}
          </span>

          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
            {conteudo.titulo}
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground">{conteudo.subtitulo}</p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/cadastro">
                Testar 7 dias grátis
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              Sem cartão de crédito · Cancele quando quiser
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <BrowserFrame url="app.alicerce.com.br/app/agenda">
            <TelaAgenda />
          </BrowserFrame>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance">
            O que costuma travar no seu dia
          </h2>

          <Reveal className="grid gap-4 md:grid-cols-3">
            {conteudo.dores.map((dor) => (
              <div
                key={dor.titulo}
                className="flex flex-col gap-2 border-l-2 border-destructive/60 bg-card p-4"
              >
                <span className="font-medium">{dor.titulo}</span>
                <span className="text-sm text-muted-foreground">{dor.texto}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance">
              Como fica com o Alicerce
            </h2>
            <ul className="flex flex-col gap-2.5">
              {conteudo.ganhos.map((ganho) => (
                <li key={ganho} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {ganho}
                </li>
              ))}
            </ul>
          </div>

          {conteudo.fiscal ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
              <span className="font-display text-xl font-semibold">{conteudo.fiscal.titulo}</span>
              <p className="text-sm leading-relaxed text-muted-foreground">{conteudo.fiscal.texto}</p>
              <p className="text-xs text-muted-foreground">
                O Alicerce organiza e entrega os números; quem confirma a regra fiscal é o seu
                contador.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <Precos titulo="Planos que cabem no seu negócio" />
      <Perguntas />
      <CtaFinal />
    </>
  );
}
