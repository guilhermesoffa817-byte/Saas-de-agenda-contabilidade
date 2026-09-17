"use client";

import { CartoesDeResumo } from "@/components/app/financeiro/cartoes-resumo";
import { GraficoSeisMeses } from "@/components/app/financeiro/grafico-seis-meses";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FINANCEIRO_DEMO } from "@/lib/demo-data";
import { formatarBRL } from "@/lib/money";

/** O painel "Entrou, saiu, sobrou" real, com números de demonstração. */
export function TelaFinanceiro() {
  const atual = {
    entrouCents: FINANCEIRO_DEMO.entrouCents,
    saiuCents: FINANCEIRO_DEMO.saiuCents,
    sobrouCents: FINANCEIRO_DEMO.entrouCents - FINANCEIRO_DEMO.saiuCents,
  };
  const maior = FINANCEIRO_DEMO.maioresDespesas[0].valorCents;

  return (
    <div className="flex max-h-[460px] w-full min-w-0 flex-col gap-4 overflow-hidden p-4">
      <CartoesDeResumo atual={atual} anterior={FINANCEIRO_DEMO.anteriorCents} />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos seis meses</CardTitle>
            <CardDescription>O que entrou contra o que saiu.</CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoSeisMeses meses={FINANCEIRO_DEMO.seisMeses} />
          </CardContent>
        </Card>

        <Card className="hidden lg:block">
          <CardHeader>
            <CardTitle className="text-base">Maiores despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {FINANCEIRO_DEMO.maioresDespesas.slice(0, 4).map((despesa) => (
                <li key={despesa.categoria} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{despesa.categoria}</span>
                    <span className="font-mono tabular">{formatarBRL(despesa.valorCents)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-4"
                      style={{ width: `${(despesa.valorCents / maior) * 100}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
