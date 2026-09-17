"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatarBRL } from "@/lib/money";

export type MesDoGrafico = { mes: string; rotulo: string; entrouCents: number; saiuCents: number };

const config = {
  entrou: { label: "Entrou", color: "var(--chart-1)" },
  saiu: { label: "Saiu", color: "var(--chart-4)" },
} satisfies ChartConfig;

/** Abrevia para o eixo: 18.430,00 vira "18,4 mil". */
function abreviar(cents: number) {
  const reais = cents / 100;
  if (reais >= 1000) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(reais / 1000)} mil`;
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(reais);
}

export function GraficoSeisMeses({ meses }: { meses: MesDoGrafico[] }) {
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    entrou: mes.entrouCents,
    saiu: mes.saiuCents,
  }));

  const temMovimento = dados.some((linha) => linha.entrou > 0 || linha.saiu > 0);

  if (!temMovimento) {
    return (
      <p className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
        Sem movimento nos últimos seis meses.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <BarChart data={dados} barGap={2} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
        <defs>
          {/* A trama a 45° dá um segundo sinal além da cor: ajuda quem não
              distingue verde de vermelho e sobrevive à impressão em preto e branco. */}
          <pattern id="trama-saiu" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="var(--chart-4)" />
            <path d="M0 6 L6 0" stroke="var(--card)" strokeWidth="1.5" opacity="0.55" />
          </pattern>
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(valor: number) => abreviar(valor)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(valor) => formatarBRL(Number(valor))}
              labelFormatter={(rotulo) => `Mês de ${String(rotulo)}`}
            />
          }
        />
        <Bar dataKey="entrou" fill="var(--color-entrou)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="saiu" fill="url(#trama-saiu)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
      </ChartContainer>

      {/* Legenda própria: a cor identifica, e a trama repete a informação para
          quem não distingue verde de vermelho e para a impressão em preto e branco. */}
      <ul className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-chart-1" aria-hidden />
          Entrou
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-3 rounded-sm bg-chart-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 2px, var(--card) 2px, var(--card) 3px)",
            }}
            aria-hidden
          />
          Saiu
        </li>
      </ul>
    </div>
  );
}
