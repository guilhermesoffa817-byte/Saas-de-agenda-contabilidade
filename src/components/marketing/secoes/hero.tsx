import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { HeroMockup } from "@/components/marketing/hero-mockup";
import { TelaAgenda } from "@/components/marketing/telas/tela-agenda";
import { Button } from "@/components/ui/button";

/**
 * Título com no máximo 8 palavras, falando do resultado, e um CTA só.
 * Textos marcados como [EXEMPLO] na especificação — testar variações depois.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Textura sutil de papel quadriculado: dá profundidade sem virar enfeite. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)",
        }}
        aria-hidden
      />

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pt-12 pb-20 lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16 lg:pt-20">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="w-fit rounded-full border border-gold/60 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-ink">
            Agenda + financeiro + contador
          </span>

          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Sua agenda cheia. Seu financeiro em ordem.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground">
            O cliente marca sozinho pelo link, o atendimento concluído entra no caixa na hora, e no
            fim do mês o relatório do seu contador sai em um clique.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/cadastro">
                Testar 7 dias grátis
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {["Sem cartão de crédito", "7 dias grátis", "Cancele quando quiser"].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  {item}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <HeroMockup>
            <BrowserFrame url="app.alicerce.com.br/app/agenda">
              <TelaAgenda />
            </BrowserFrame>
          </HeroMockup>
        </div>
      </div>
    </section>
  );
}
