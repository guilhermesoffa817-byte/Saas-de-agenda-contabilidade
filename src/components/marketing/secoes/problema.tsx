import { ArrowRight } from "lucide-react";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { Reveal } from "@/components/marketing/reveal";
import { TelaFinanceiro } from "@/components/marketing/telas/tela-financeiro";

const CUSTOS = [
  {
    titulo: "Cadeira vazia",
    texto: "O cliente esquece, ninguém confirmou, e aquele horário não volta mais.",
  },
  {
    titulo: "Recibo perdido",
    texto: "A nota do fornecedor sumiu na bolsa e a despesa nunca entrou na conta.",
  },
  {
    titulo: "Contador cobrando",
    texto: "Toda semana a mesma mensagem pedindo comprovante que você não acha.",
  },
];

/** Problema em PAS: problema, agitação, solução. */
export function Problema() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-20">
        <Reveal className="flex flex-col gap-4">
          <h2 className="max-w-3xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            O cliente marca no WhatsApp, você anota no caderno, e no fim do mês ninguém sabe quanto
            entrou.
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Não é desorganização: é que as informações do seu negócio moram em três lugares que não
            conversam.
          </p>
        </Reveal>

        <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:items-center">
          <div className="flex min-w-0 flex-col gap-6">
            <Reveal className="flex flex-col gap-3">
              {CUSTOS.map((custo) => (
                <div
                  key={custo.titulo}
                  className="flex flex-col gap-1 border-l-2 border-destructive/60 pl-4"
                >
                  <span className="font-medium">{custo.titulo}</span>
                  <span className="text-sm text-muted-foreground">{custo.texto}</span>
                </div>
              ))}
            </Reveal>

            {/* Antes e depois (BAB) sem foto: o "hoje" é desenhado em código. */}
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card/60 p-4">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Hoje
              </span>
              <div className="flex flex-col gap-2 font-mono text-sm">
                {[
                  "seg 14h — Marina? (confirmar)",
                  "aluguel 2.800 …pago?",
                  "cortar 3 clientes = ?",
                ].map((linha) => (
                  <span
                    key={linha}
                    className="border-b border-dashed border-border pb-1.5 text-muted-foreground"
                  >
                    {linha}
                  </span>
                ))}
              </div>
              <span className="flex items-center gap-2 text-sm text-foreground">
                <ArrowRight className="size-4 text-primary" aria-hidden />
                Com o Alicerce, isso vira a tela ao lado.
              </span>
            </div>
          </div>

          <Reveal className="min-w-0">
            <BrowserFrame url="app.alicerce.com.br/app/financeiro">
              <TelaFinanceiro />
            </BrowserFrame>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
