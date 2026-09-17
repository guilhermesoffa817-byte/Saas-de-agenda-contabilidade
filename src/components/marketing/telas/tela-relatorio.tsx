"use client";

import { TabelaDeRelatorio } from "@/components/app/relatorios/tabela-relatorio";
import { lancamentosDemo } from "@/lib/demo-data";
import { montarDRE } from "@/lib/reports/dre";

/** O relatório que vai para o contador, montado pela mesma função do sistema. */
export function TelaRelatorio() {
  const tabela = montarDRE({ lancamentos: lancamentosDemo(), periodo: "agosto de 2026" });

  return (
    <div className="max-h-[460px] w-full min-w-0 overflow-hidden p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h4 className="font-display text-lg font-semibold">{tabela.titulo}</h4>
        <p className="text-xs text-muted-foreground">{tabela.subtitulo}</p>
      </div>
      <TabelaDeRelatorio tabela={tabela} />
    </div>
  );
}
