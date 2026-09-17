"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AlternadorPreco } from "@/components/marketing/alternador-preco";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/money";
import {
  INCLUSO_EM_TODOS,
  ORDEM_DOS_PLANOS,
  PLANOS,
  PLANO_DESTACADO,
  precoDoCiclo,
} from "@/lib/planos";
import { cn } from "@/lib/utils";

/**
 * Três planos (três convertem melhor que dois; quatro atrapalham), selo dourado
 * só no do meio e o preço anual mostrado por mês, sem esconder o total.
 * Valores marcados como [EXEMPLO] na especificação.
 */
export function Precos({
  titulo = "Preço de sistema, economia de contador",
  subtitulo = "Todos os planos têm agenda, financeiro, fechamento do mês e o acesso gratuito do seu contador. O que muda é o tamanho da equipe.",
}: {
  titulo?: string;
  subtitulo?: string;
}) {
  const [anual, setAnual] = useState(true);
  const ciclo = anual ? ("anual" as const) : ("mensal" as const);

  return (
    <section id="precos" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-5">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            {titulo}
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">{subtitulo}</p>
          <AlternadorPreco anual={anual} onChange={setAnual} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {ORDEM_DOS_PLANOS.map((chave) => {
            const plano = PLANOS[chave];
            const destacado = chave === PLANO_DESTACADO;
            const porMes = anual ? Math.round(precoDoCiclo(chave, "anual") / 12) : plano.mensalCents;

            return (
              <div
                key={chave}
                className={cn(
                  "flex flex-col gap-5 rounded-xl border p-6",
                  destacado
                    ? "border-gold bg-card shadow-2xl shadow-black/10 lg:-mt-4 lg:mb-4"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-xl font-semibold">{plano.nome}</span>
                    <span className="text-sm text-muted-foreground">{plano.resumo}</span>
                  </div>
                  {destacado ? (
                    <Badge className="bg-gold text-gold-foreground hover:bg-gold">
                      Mais escolhido
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-col">
                  <span className="font-display text-4xl font-semibold tracking-tight tabular">
                    {formatarBRL(porMes)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    por mês
                    {anual ? `, no plano anual de ${formatarBRL(precoDoCiclo(chave, "anual"))}` : ""}
                  </span>
                </div>

                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {plano.maxProfissionais === Infinity
                      ? "Profissionais sem limite"
                      : `${plano.maxProfissionais} ${
                          plano.maxProfissionais === 1 ? "profissional" : "profissionais"
                        }`}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {plano.lembretesAutomaticosMes === 0 ? (
                      "Lembrete pelo seu WhatsApp, sem custo"
                    ) : (
                      <>
                        {plano.lembretesAutomaticosMes} lembretes automáticos por mês{" "}
                        <span className="whitespace-nowrap text-muted-foreground">(em breve)</span>
                      </>
                    )}
                  </li>
                  {plano.nfse ? (
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      Emissão de NFS-e <span className="whitespace-nowrap text-muted-foreground">(em breve)</span>
                    </li>
                  ) : null}
                </ul>

                <div className="mt-auto flex flex-col gap-2">
                  <Button asChild variant={destacado ? "default" : "outline"} className="w-full">
                    <Link href={`/cadastro?plano=${chave}&ciclo=${ciclo}`}>Começar o teste</Link>
                  </Button>
                  <span className="text-center text-xs text-muted-foreground">
                    7 dias grátis, sem cartão · Cancele quando quiser
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-5">
          <span className="text-sm font-medium">Em qualquer plano</span>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            {INCLUSO_EM_TODOS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Valores de exemplo, a revisar antes do lançamento.
          </p>
        </div>
      </div>
    </section>
  );
}
