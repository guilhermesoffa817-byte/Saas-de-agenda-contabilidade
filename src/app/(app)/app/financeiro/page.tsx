import { endOfMonth, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  maioresDespesas,
  mesesFechados,
  pendencias,
  resumoDoMes,
  seisMeses,
  termometroMEI,
} from "./dados";
import { CartoesDeResumo } from "@/components/app/financeiro/cartoes-resumo";
import { GraficoSeisMeses } from "@/components/app/financeiro/grafico-seis-meses";
import { SeletorDeMes } from "@/components/app/financeiro/seletor-mes";
import { TermometroMEI } from "@/components/app/financeiro/termometro-mei";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Financeiro — Alicerce" };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaFinanceiro({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const empresa = vinculo.empresa;
  const parametros = await searchParams;

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: empresa.timezone }).format(new Date());
  const mes = parametros.mes && MES.test(parametros.mes) ? parametros.mes : hoje.slice(0, 7);
  const mesAnterior = format(subMonths(new Date(`${mes}-01T12:00:00Z`), 1), "yyyy-MM");

  const [atual, anterior, meses, despesas, aVencer, fechados] = await Promise.all([
    resumoDoMes(empresa.id, mes),
    resumoDoMes(empresa.id, mesAnterior),
    seisMeses(empresa.id, mes),
    maioresDespesas(empresa.id, mes),
    pendencias(empresa.id, 7),
    mesesFechados(empresa.id),
  ]);

  const termometro =
    empresa.tax_regime === "mei"
      ? await termometroMEI({
          empresaId: empresa.id,
          ano: Number(mes.slice(0, 4)),
          aberturaEm: empresa.opened_on,
        })
      : null;

  const rotuloDoMes = format(new Date(`${mes}-01T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });
  const fechado = fechados.includes(mes);
  const maiorDespesa = despesas[0]?.valorCents ?? 0;

  const aReceber = aVencer.filter((item) => item.tipo === "receita");
  const aPagar = aVencer.filter((item) => item.tipo === "despesa");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={rotuloDoMes} />
        <div className="flex flex-wrap items-center gap-2">
          {fechado ? (
            <Badge variant="outline" className="border-gold text-gold-ink">
              <Lock className="size-3" aria-hidden />
              Mês fechado
            </Badge>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/financeiro/categorias`}>Categorias e contas</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/financeiro/fechamento?mes=${mes}`}>
              <Lock aria-hidden />
              Fechar o mês
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/app/financeiro/lancamentos?mes=${mes}`}>
              Ver lançamentos
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      <CartoesDeResumo atual={atual} anterior={anterior} />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos seis meses</CardTitle>
            <CardDescription>
              O que entrou contra o que saiu, pela data de pagamento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoSeisMeses meses={meses} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maiores despesas do mês</CardTitle>
            <CardDescription>Onde o dinheiro foi, por categoria.</CardDescription>
          </CardHeader>
          <CardContent>
            {despesas.length ? (
              <ul className="flex flex-col gap-3">
                {despesas.map((despesa) => (
                  <li key={despesa.categoria} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{despesa.categoria}</span>
                      <span className="font-mono tabular">{formatarBRL(despesa.valorCents)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-4"
                        style={{
                          width: `${maiorDespesa ? (despesa.valorCents / maiorDespesa) * 100 : 0}%`,
                        }}
                        aria-hidden
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma despesa paga neste mês.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A receber nos próximos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            {aReceber.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {aReceber.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{item.descricao}</span>
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        vence {formatarData(`${item.vencimento}T12:00:00Z`, empresa.timezone)}
                      </span>
                    </span>
                    <span className="font-mono tabular text-success">
                      {formatarBRL(item.valorCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nada a receber nesse prazo.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">A pagar nos próximos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            {aPagar.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {aPagar.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{item.descricao}</span>
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        vence {formatarData(`${item.vencimento}T12:00:00Z`, empresa.timezone)}
                      </span>
                    </span>
                    <span className="font-mono tabular text-destructive">
                      {formatarBRL(item.valorCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nada a pagar nesse prazo.</p>
            )}
          </CardContent>
        </Card>

        {termometro ? (
          <TermometroMEI
            ano={Number(mes.slice(0, 4))}
            recebidoCents={termometro.recebidoCents}
            limiteCents={termometro.limiteCents}
            proporcional={termometro.proporcional}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fechamento do mês</CardTitle>
              <CardDescription>
                Conferido o mês, o fechamento gera os relatórios do contador (FASE 4).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Período de{" "}
                {formatarData(`${mes}-01T12:00:00Z`, empresa.timezone)} a{" "}
                {formatarData(
                  `${format(endOfMonth(new Date(`${mes}-01T12:00:00Z`)), "yyyy-MM-dd")}T12:00:00Z`,
                  empresa.timezone,
                )}
                .
              </p>
              <Button asChild size="sm" variant="secondary" className="w-fit">
                <Link href={`/app/financeiro/fechamento?mes=${mes}`}>Conferir e fechar</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        O Alicerce organiza os números, mas não calcula seus impostos nem substitui o contador.
      </p>
    </div>
  );
}
