import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Download, Table2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodigosContabeis } from "@/components/app/contador/codigos-contabeis";
import { PedirComprovante } from "@/components/app/contador/pedir-comprovante";
import { BarraDeRelatorios } from "@/components/app/relatorios/barra-relatorios";
import { TabelaDeRelatorio } from "@/components/app/relatorios/tabela-relatorio";
import { Button } from "@/components/ui/button";
import {
  carregarCategorias,
  carregarContas,
} from "@/app/(app)/app/financeiro/dados";
import { carregarFechamentos, carregarLancamentosParaRelatorio } from "@/app/(app)/app/relatorios/dados";
import { filtroDeData, montarRelatorio, relatoriosDoRegime, type TipoDeRelatorio } from "@/lib/reports";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Cliente — Portal do contador" };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default async function PaginaDoCliente({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ tipo?: string; de?: string; ate?: string }>;
}) {
  const { empresa: empresaId } = await params;
  const { vinculos } = await empresaAtual();
  const vinculo = vinculos.find(
    (item) => item.empresa.id === empresaId && item.papel === "contador",
  );
  if (!vinculo) notFound();

  const empresa = vinculo.empresa;
  const parametros = await searchParams;

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: empresa.timezone }).format(new Date());
  const mesPassado = subMonths(new Date(`${hoje}T12:00:00Z`), 1);

  const disponiveis = relatoriosDoRegime(empresa.tax_regime);
  const tipo = (disponiveis.some((item) => item.tipo === parametros.tipo)
    ? parametros.tipo
    : "resumo") as TipoDeRelatorio;

  const de =
    parametros.de && DIA.test(parametros.de)
      ? parametros.de
      : format(startOfMonth(mesPassado), "yyyy-MM-dd");
  const ate =
    parametros.ate && DIA.test(parametros.ate)
      ? parametros.ate
      : format(endOfMonth(mesPassado), "yyyy-MM-dd");

  const inicio = tipo === "receitas-mei" ? `${de.slice(0, 4)}-01-01` : de;
  const fim = tipo === "receitas-mei" ? `${de.slice(0, 4)}-12-31` : ate;

  const [lancamentos, categorias, contas, fechamentos] = await Promise.all([
    carregarLancamentosParaRelatorio({
      empresaId: empresa.id,
      de: inicio,
      ate: fim,
      por: filtroDeData(tipo),
    }),
    carregarCategorias(empresa.id),
    carregarContas(empresa.id),
    carregarFechamentos(empresa.id, 6),
  ]);

  const periodo =
    inicio.slice(0, 7) === fim.slice(0, 7)
      ? format(new Date(`${inicio}T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR })
      : `${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}`;

  const tabela = montarRelatorio(tipo, {
    lancamentos,
    periodo,
    ano: Number(de.slice(0, 4)),
    hoje,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{empresa.name}</h1>
          <p className="text-sm text-muted-foreground">
            {empresa.document ? `${empresa.document} · ` : ""}
            {empresa.city ? `${empresa.city}${empresa.state ? `/${empresa.state}` : ""} · ` : ""}
            fuso {empresa.timezone.replace("America/", "").replace("_", " ")}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/contador">
            <ArrowLeft aria-hidden />
            Todos os clientes
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {disponiveis.map((relatorio) => (
          <Button
            key={relatorio.tipo}
            asChild
            variant={relatorio.tipo === tipo ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/contador/${empresa.id}?tipo=${relatorio.tipo}&de=${de}&ate=${ate}`}>
              {relatorio.nome}
            </Link>
          </Button>
        ))}
        <Button asChild variant="outline" size="sm">
          <a
            href={`/app/relatorios/exportar?tipo=exportacao-contabil&formato=csv&de=${de}&ate=${ate}&empresa=${empresa.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <Table2 aria-hidden />
            Exportação contábil
          </a>
        </Button>
      </div>

      <BarraDeRelatorios de={de} ate={ate} tipo={tipo} empresaId={empresa.id} />

      <TabelaDeRelatorio tabela={tabela} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CodigosContabeis
          categorias={categorias.map((categoria) => ({
            id: categoria.id,
            nome: categoria.name,
            tipo: categoria.kind,
            codigo: categoria.accounting_code,
          }))}
          contas={contas.map((conta) => ({
            id: conta.id,
            nome: conta.name,
            codigo: conta.accounting_code,
          }))}
        />

        <div className="flex flex-col gap-6">
          <PedirComprovante empresaId={empresa.id} />

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Meses fechados</h2>
            {fechamentos.length ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {fechamentos.map((fechamento) => {
                  const mes = fechamento.month.slice(0, 7);
                  return (
                    <li
                      key={fechamento.month}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                    >
                      <span className="first-letter:uppercase">
                        {format(new Date(`${mes}-01T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR })}
                        {fechamento.reopened_at ? " (reaberto)" : ""}
                      </span>
                      <Button asChild variant="ghost" size="xs">
                        <a
                          href={`/app/relatorios/exportar?tipo=resumo&formato=pdf&de=${mes}-01&ate=${format(
                            endOfMonth(new Date(`${mes}-01T12:00:00Z`)),
                            "yyyy-MM-dd",
                          )}&empresa=${empresa.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download aria-hidden />
                          Resumo em PDF
                        </a>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Este cliente ainda não fechou nenhum mês.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O Alicerce organiza os lançamentos do cliente. A apuração, as guias e a escrituração seguem
        sendo do escritório.
      </p>
    </div>
  );
}
