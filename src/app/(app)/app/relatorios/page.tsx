import { endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { carregarLancamentosParaRelatorio } from "./dados";
import { BarraDeRelatorios } from "@/components/app/relatorios/barra-relatorios";
import { TabelaDeRelatorio } from "@/components/app/relatorios/tabela-relatorio";
import { Button } from "@/components/ui/button";
import { filtroDeData, montarRelatorio, relatoriosDoRegime, type TipoDeRelatorio } from "@/lib/reports";
import { empresaAtual } from "@/lib/supabase/sessao";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatórios — Alicerce" };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; de?: string; ate?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const empresa = vinculo.empresa;
  const parametros = await searchParams;

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: empresa.timezone }).format(new Date());
  const disponiveis = relatoriosDoRegime(empresa.tax_regime);
  const tipo = (disponiveis.some((item) => item.tipo === parametros.tipo)
    ? parametros.tipo
    : "resumo") as TipoDeRelatorio;

  const de =
    parametros.de && DIA.test(parametros.de)
      ? parametros.de
      : format(startOfMonth(new Date(`${hoje}T12:00:00Z`)), "yyyy-MM-dd");
  const ate =
    parametros.ate && DIA.test(parametros.ate)
      ? parametros.ate
      : format(endOfMonth(new Date(`${hoje}T12:00:00Z`)), "yyyy-MM-dd");

  // O relatório do MEI é anual: puxa o ano inteiro do período escolhido.
  const inicio = tipo === "receitas-mei" ? `${de.slice(0, 4)}-01-01` : de;
  const fim = tipo === "receitas-mei" ? `${de.slice(0, 4)}-12-31` : ate;

  const lancamentos = await carregarLancamentosParaRelatorio({
    empresaId: empresa.id,
    de: inicio,
    ate: fim,
    por: filtroDeData(tipo),
  });

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

  const escolhido = disponiveis.find((item) => item.tipo === tipo);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Os mesmos números do painel, no formato que o seu contador pede.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/app/relatorios/exportacao">Configurar exportação contábil</Link>
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
            <Link href={`/app/relatorios?tipo=${relatorio.tipo}&de=${de}&ate=${ate}`}>
              {relatorio.nome}
            </Link>
          </Button>
        ))}
      </div>

      {escolhido ? (
        <p className={cn("text-sm text-muted-foreground")}>{escolhido.descricao}</p>
      ) : null}

      <BarraDeRelatorios de={de} ate={ate} tipo={tipo} />

      <TabelaDeRelatorio tabela={tabela} />
    </div>
  );
}
