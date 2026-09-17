import { ArrowRight, Briefcase, Check } from "lucide-react";
import Link from "next/link";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { Reveal } from "@/components/marketing/reveal";
import { TelaRelatorio } from "@/components/marketing/telas/tela-relatorio";
import { Button } from "@/components/ui/button";

const VANTAGENS = [
  "Todos os seus clientes do Alicerce numa lista, com o mês fechado ou em aberto",
  "Fechamento travado: o cliente não altera o mês depois de entregar",
  "Exportação no leiaute que você configura, com o seu plano de contas",
  "Pedido de comprovante por e-mail, sem caçar recibo no WhatsApp",
  "Acesso gratuito em todos os planos, sem limite de clientes",
];

export function ParaContadores() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="grid min-w-0 gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal className="flex min-w-0 flex-col gap-6">
          <span className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
            <Briefcase className="size-3.5" aria-hidden />
            Para contadores
          </span>

          <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Seus clientes organizados, sem pedir comprovante toda semana.
          </h2>

          <p className="text-lg text-muted-foreground">
            O dono lança no dia a dia, o mês fecha travado e você recebe o pacote pronto — no formato
            que o seu sistema espera.
          </p>

          <ul className="flex flex-col gap-2.5">
            {VANTAGENS.map((vantagem) => (
              <li key={vantagem} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {vantagem}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/para-contadores">
                Sou contador
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </Reveal>

        <Reveal className="min-w-0">
          <BrowserFrame url="app.alicerce.com.br/contador">
            <TelaRelatorio />
          </BrowserFrame>
        </Reveal>
      </div>
    </section>
  );
}
