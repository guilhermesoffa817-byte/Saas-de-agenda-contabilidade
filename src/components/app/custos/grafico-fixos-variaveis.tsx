"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MesDaTendencia } from "@/lib/custos/calculo";
import { formatarBRL } from "@/lib/money";

/** Fixo em terracota (com trama), variável em dourado: as mesmas cores da tabela. */
const config = {
  fixos: { label: "Custos fixos", color: "var(--chart-4)" },
  variaveis: { label: "Custos variáveis", color: "var(--chart-2)" },
} satisfies ChartConfig;

/**
 * Seis meses de custos fixos contra variáveis. O eixo vertical fica escondido
 * de propósito: os valores exatos estão no toque/hover e na tabela para leitor
 * de tela, sem converter centavos para reais fora do `formatarBRL`.
 */
export function GraficoFixosVariaveis({ meses }: { meses: MesDaTendencia[] }) {
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    fixos: mes.fixosCents,
    variaveis: mes.variaveisCents,
  }));

  if (!dados.some((linha) => linha.fixos > 0 || linha.variaveis > 0)) {
    return (
      <p className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Nenhum custo fixo ou variável classificado nos últimos seis meses.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="aspect-auto h-56 w-full" aria-hidden>
        <BarChart data={dados} barGap={2} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <defs>
            {/* A trama dá um segundo sinal além da cor (daltonismo e impressão). */}
            <pattern id="trama-fixos" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="var(--chart-4)" />
              <path d="M0 6 L6 0" stroke="var(--card)" strokeWidth="1.5" opacity="0.55" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(valor, nome) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[nome as keyof typeof config]?.label ?? String(nome)}
                    </span>
                    <span className="font-mono tabular">{formatarBRL(Number(valor))}</span>
                  </span>
                )}
                labelFormatter={(rotulo) => `Mês de ${String(rotulo)}`}
              />
            }
          />
          <Bar dataKey="fixos" fill="url(#trama-fixos)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="variaveis" fill="var(--color-variaveis)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>

      <ul className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span
            className="size-3 rounded-sm bg-chart-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 2px, var(--card) 2px, var(--card) 3px)",
            }}
            aria-hidden
          />
          Custos fixos
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-chart-2" aria-hidden />
          Custos variáveis
        </li>
      </ul>

      <table className="sr-only">
        <caption>Custos fixos e variáveis dos últimos seis meses</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Custos fixos</th>
            <th scope="col">Custos variáveis</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((mes) => (
            <tr key={mes.mes}>
              <th scope="row">{mes.rotulo}</th>
              <td>{formatarBRL(mes.fixosCents)}</td>
              <td>{formatarBRL(mes.variaveisCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
