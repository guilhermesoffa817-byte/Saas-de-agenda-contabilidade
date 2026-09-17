import { ArrowLeft, Table2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { carregarModeloDeExportacao } from "../dados";
import { ConfigurarExportacao } from "@/components/app/relatorios/configurar-exportacao";
import { Button } from "@/components/ui/button";
import { MODELO_PADRAO, type ChaveDeColuna } from "@/lib/reports/exportacao-contabil";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Configurar exportação — Alicerce" };

export default async function PaginaExportacao() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono" && vinculo.papel !== "contador") redirect("/app");

  const modelo = await carregarModeloDeExportacao(vinculo.empresa.id);
  const hoje = new Date();
  const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Configurar exportação contábil</h1>
          <p className="text-sm text-muted-foreground">
            Peça ao seu contador um arquivo de exemplo do sistema dele e reproduza aqui a ordem das
            colunas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`/app/relatorios/exportar?tipo=exportacao-contabil&formato=csv&de=${primeiroDia}&ate=${ultimoDia}`}
              target="_blank"
              rel="noreferrer"
            >
              <Table2 aria-hidden />
              Baixar deste mês
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/relatorios">
              <ArrowLeft aria-hidden />
              Voltar
            </Link>
          </Button>
        </div>
      </div>

      <ConfigurarExportacao
        empresaId={vinculo.empresa.id}
        inicial={
          modelo
            ? {
                colunas: modelo.columns as ChaveDeColuna[],
                separador: modelo.separator,
                formatoDeData: modelo.date_format,
                decimalComVirgula: modelo.decimal_comma,
              }
            : {
                colunas: [...MODELO_PADRAO.colunas],
                separador: MODELO_PADRAO.separador,
                formatoDeData: MODELO_PADRAO.formatoDeData,
                decimalComVirgula: MODELO_PADRAO.decimalComVirgula,
              }
        }
      />
    </div>
  );
}
