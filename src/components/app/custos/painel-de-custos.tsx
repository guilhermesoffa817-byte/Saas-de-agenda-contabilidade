import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumoDeCustos } from "@/lib/custos/calculo";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

import { COR_DA_NATUREZA } from "./selo-natureza";

/** Pontos-base (10.000 = 100%) para "45,5%". */
export function formatarPontosBase(bps: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(
    bps / 10_000,
  );
}

function Diferenca({
  diferencaCents,
  mesAnterior,
}: {
  diferencaCents: number | null;
  mesAnterior: string;
}) {
  if (diferencaCents === null) return null;
  const Icone = diferencaCents === 0 ? Minus : diferencaCents > 0 ? ArrowUpRight : ArrowDownRight;
  const texto =
    diferencaCents === 0
      ? `igual a ${mesAnterior}`
      : `${formatarBRL(Math.abs(diferencaCents))} ${diferencaCents > 0 ? "a mais" : "a menos"} que em ${mesAnterior}`;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icone className="size-3.5 shrink-0" aria-hidden />
      {texto}
    </span>
  );
}

export function CartoesDeCustos({
  resumo,
  rotuloDoMesAnterior,
}: {
  resumo: ResumoDeCustos;
  rotuloDoMesAnterior: string;
}) {
  const anterior = resumo.mesAnterior;
  const cartoes = [
    {
      titulo: "Receita",
      descricao: "Recebido no mês",
      valor: resumo.receitaCents,
      classe: "text-success",
      cor: null,
      diferenca: anterior.diferencaReceitaCents,
      extra: null,
    },
    {
      titulo: "Custos fixos",
      descricao: "Pagos mesmo sem atendimento",
      valor: resumo.fixosCents,
      classe: "",
      cor: COR_DA_NATUREZA.fixo,
      diferenca: anterior.diferencaFixosCents,
      extra: null,
    },
    {
      titulo: "Custos variáveis",
      descricao: "Sobem e descem com os atendimentos",
      valor: resumo.variaveisCents,
      classe: "",
      cor: COR_DA_NATUREZA.variavel,
      diferenca: anterior.diferencaVariaveisCents,
      extra: null,
    },
    {
      titulo: "Fora da operação",
      descricao: "Juros, multas, investimentos",
      valor: resumo.foraDaOperacaoCents,
      classe: "",
      cor: COR_DA_NATUREZA.nao_operacional,
      diferenca: null,
      extra: null,
    },
    {
      titulo: "Sem classificação",
      descricao: "Ainda não entram na conta",
      valor: resumo.semClassificacaoCents,
      classe: resumo.semClassificacaoCents > 0 ? "text-warning" : "",
      cor: null,
      diferenca: null,
      extra:
        resumo.quantidadeSemClassificacao > 0
          ? resumo.quantidadeSemClassificacao === 1
            ? "1 despesa"
            : `${resumo.quantidadeSemClassificacao} despesas`
          : "Nada pendente",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cartoes.map((cartao) => (
        <Card key={cartao.titulo}>
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {cartao.cor ? (
                <span className={cn("size-2.5 rounded-full", cartao.cor)} aria-hidden />
              ) : null}
              {cartao.titulo}
            </CardTitle>
            <CardDescription>{cartao.descricao}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className={cn("font-mono text-2xl tabular", cartao.classe)}>
              {formatarBRL(cartao.valor)}
            </span>
            {cartao.extra ? (
              <span className="text-xs text-muted-foreground">{cartao.extra}</span>
            ) : (
              <Diferenca diferencaCents={cartao.diferenca} mesAnterior={rotuloDoMesAnterior} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MargemEPontoDeEquilibrio({ resumo }: { resumo: ResumoDeCustos }) {
  const margemNegativa = resumo.margemDeContribuicaoCents < 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margem de contribuição</CardTitle>
          <CardDescription>O que entra menos os custos variáveis.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <span
            className={cn("font-mono text-3xl tabular", margemNegativa ? "text-destructive" : "")}
          >
            {formatarBRL(resumo.margemDeContribuicaoCents)}
          </span>
          {resumo.sobraACadaCemReaisCents !== null ? (
            <p className="text-sm">
              De cada <span className="font-mono tabular">{formatarBRL(10_000)}</span> que entram,{" "}
              {resumo.sobraACadaCemReaisCents > 0 ? (
                <>
                  sobram{" "}
                  <span className="font-mono font-medium tabular">
                    {formatarBRL(resumo.sobraACadaCemReaisCents)}
                  </span>{" "}
                  para pagar os custos fixos.
                </>
              ) : (
                <span className="text-destructive">
                  não sobra nada para pagar os custos fixos.
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem receita recebida no mês, não há margem para calcular.
            </p>
          )}
          {resumo.pesoDosFixosBps !== null && resumo.fixosCents > 0 ? (
            <p className="text-sm text-muted-foreground">
              Os custos fixos levam{" "}
              <span className="font-mono tabular text-foreground">
                {formatarPontosBase(resumo.pesoDosFixosBps)}
              </span>{" "}
              do que entra.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ponto de equilíbrio</CardTitle>
          <CardDescription>Quanto você precisa faturar no mês para empatar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PontoDeEquilibrio resumo={resumo} />
        </CardContent>
      </Card>
    </div>
  );
}

function PontoDeEquilibrio({ resumo }: { resumo: ResumoDeCustos }) {
  switch (resumo.situacaoDoPontoDeEquilibrio) {
    case "sem_custos_fixos":
      return (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Classifique ao menos os custos fixos do mês para ver o ponto de equilíbrio.
        </p>
      );
    case "sem_receita":
      return (
        <p className="text-sm text-muted-foreground">
          Nada foi recebido neste mês, então ainda não dá para calcular o ponto de equilíbrio.
        </p>
      );
    case "margem_insuficiente":
      return (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Com a margem atual, os custos variáveis já consomem tudo o que entra.
        </p>
      );
    case "calculado": {
      const valor = resumo.pontoDeEquilibrioCents ?? 0;
      const folga = resumo.receitaCents - valor;
      return (
        <>
          <span className="font-mono text-3xl tabular">{formatarBRL(valor)}</span>
          <p className="text-sm text-muted-foreground">
            É a receita que cobre os custos fixos com a margem de hoje: custos fixos divididos pelo
            índice de margem.
          </p>
          {resumo.pontoDeEquilibrioAtendimentos !== null ? (
            <p className="text-sm">
              Equivale a cerca de{" "}
              <span className="font-mono font-medium tabular">
                {resumo.pontoDeEquilibrioAtendimentos}
              </span>{" "}
              {resumo.pontoDeEquilibrioAtendimentos === 1 ? "atendimento" : "atendimentos"} no mês,
              pela margem média de cada um.
            </p>
          ) : null}
          <p className={cn("text-sm", folga < 0 ? "text-destructive" : "text-success")}>
            {folga >= 0
              ? `Neste mês a receita passou o ponto de equilíbrio em ${formatarBRL(folga)}.`
              : `Neste mês faltaram ${formatarBRL(-folga)} para chegar ao ponto de equilíbrio.`}
          </p>
        </>
      );
    }
  }
}
