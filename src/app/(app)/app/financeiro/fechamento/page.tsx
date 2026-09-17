import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { pendenciasDoMes } from "./dados";
import { carregarFechamentos } from "../../relatorios/dados";
import { FecharMes } from "@/components/app/financeiro/fechar-mes";
import { SeletorDeMes } from "@/components/app/financeiro/seletor-mes";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Fechar o mês — Alicerce" };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaFechamento({
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

  const supabase = await createClient();
  const [pendencias, fechamentos, { count: contadores }] = await Promise.all([
    pendenciasDoMes({ empresaId: empresa.id, mes, regime: empresa.tax_regime }),
    carregarFechamentos(empresa.id),
    supabase
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", empresa.id)
      .eq("role", "contador"),
  ]);

  const doMes = fechamentos.find((item) => item.month.slice(0, 7) === mes);
  const totais = (doMes?.totals ?? {}) as {
    receitas_cents?: number;
    despesas_cents?: number;
    lancamentos?: number;
  };

  const rotuloDoMes = format(new Date(`${mes}-01T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={`Fechar ${rotuloDoMes}`} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/financeiro?mes=${mes}`}>
            <ArrowLeft aria-hidden />
            Voltar ao painel
          </Link>
        </Button>
      </div>

      <FecharMes
        mes={mes}
        rotuloDoMes={rotuloDoMes}
        fuso={empresa.timezone}
        pendencias={pendencias}
        temContador={(contadores ?? 0) > 0}
        fechamento={
          doMes
            ? {
                mes,
                fechadoEm: doMes.closed_at,
                reabertoEm: doMes.reopened_at,
                receitasCents: Number(totais.receitas_cents ?? 0),
                despesasCents: Number(totais.despesas_cents ?? 0),
                lancamentos: Number(totais.lancamentos ?? 0),
                pacote: doMes.package_path,
              }
            : null
        }
      />

      {fechamentos.length > 1 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Meses já fechados</h2>
          <div className="flex flex-wrap gap-2">
            {fechamentos.map((item) => (
              <Button key={item.month} asChild variant="outline" size="sm">
                <Link href={`/app/financeiro/fechamento?mes=${item.month.slice(0, 7)}`}>
                  {format(new Date(`${item.month.slice(0, 7)}-01T12:00:00Z`), "MMM/yyyy", {
                    locale: ptBR,
                  })}
                  {item.reopened_at ? " (reaberto)" : ""}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
