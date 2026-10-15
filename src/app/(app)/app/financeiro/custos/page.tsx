import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { carregarTelaDeCustos } from "./dados";
import { GraficoFixosVariaveis } from "@/components/app/custos/grafico-fixos-variaveis";
import { CartoesDeCustos, MargemEPontoDeEquilibrio } from "@/components/app/custos/painel-de-custos";
import { SugerirClassificacao } from "@/components/app/custos/sugerir-classificacao";
import { TabelaDeDespesas } from "@/components/app/custos/tabela-de-despesas";
import { SeletorDeMes } from "@/components/app/financeiro/seletor-mes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/money";
import { garantirEscrita, empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Custos operacionais — Bossa" };

/** A sugestão da IA roda numa server action desta página: até três lotes por clique. */
export const maxDuration = 120;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaCustos({
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

  const { resumo, cota, iaConfigurada } = await carregarTelaDeCustos(empresa, mes);
  const podeAlterar = garantirEscrita(vinculo) === null;

  const rotuloDoMes = format(new Date(`${mes}-01T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });
  const rotuloDoMesAnterior = format(new Date(`${resumo.mesAnterior.mes}-01T12:00:00Z`), "MMMM", {
    locale: ptBR,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={rotuloDoMes} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/financeiro?mes=${mes}`}>
            <ArrowLeft aria-hidden />
            Voltar ao painel
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Custos operacionais</h1>
          <p className="text-sm text-muted-foreground">
            O que foi pago no mês, separado entre custos fixos, variáveis e fora da operação.
          </p>
        </div>
        <Alert>
          <Info aria-hidden />
          <AlertDescription>
            Visão gerencial — não substitui o resumo contábil do seu contador.
          </AlertDescription>
        </Alert>
      </div>

      <CartoesDeCustos resumo={resumo} rotuloDoMesAnterior={rotuloDoMesAnterior} />

      <MargemEPontoDeEquilibrio resumo={resumo} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fixos e variáveis nos últimos seis meses</CardTitle>
          <CardDescription>Pela data de pagamento, com a classificação de hoje.</CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoFixosVariaveis meses={resumo.tendencia} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="titulo-despesas">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-despesas" className="text-lg font-semibold tracking-tight">
            Despesas do mês
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada despesa segue a categoria, a menos que você (ou uma sugestão) diga outra coisa.
            Corrigir aqui não muda o lançamento nem o relatório do contador.
          </p>
        </div>

        <SugerirClassificacao
          mes={mes}
          total={resumo.despesas.length}
          pendentes={resumo.quantidadeSemClassificacao}
          iaConfigurada={iaConfigurada}
          cota={cota}
          podeAlterar={podeAlterar}
        />

        <TabelaDeDespesas despesas={resumo.despesas} fuso={empresa.timezone} podeAlterar={podeAlterar} />

        {resumo.retiradasCents > 0 ? (
          <p className="text-sm text-muted-foreground">
            Retiradas do dono no mês:{" "}
            <span className="font-mono tabular text-foreground">
              {formatarBRL(resumo.retiradasCents)}
            </span>
            . Ficam fora desta análise: retirada não é custo.
          </p>
        ) : null}
      </section>

      <p className="text-xs text-muted-foreground">
        Os valores são do regime de caixa: o que foi efetivamente pago e recebido no mês. Para mudar
        a classificação padrão de uma categoria, use{" "}
        <Link href="/app/financeiro/categorias" className="underline underline-offset-4">
          Categorias e contas
        </Link>
        .
      </p>
    </div>
  );
}
