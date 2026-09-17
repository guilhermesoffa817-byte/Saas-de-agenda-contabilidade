"use client";

import { CheckCircle2, FileSpreadsheet, FileText, Lock, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatarBRL } from "@/lib/money";
import { lancamentosDemo } from "@/lib/demo-data";
import { montarDRE } from "@/lib/reports/dre";

/** O fim do mês: um clique, o mês travado e o pacote pronto para o contador. */
export function TelaFechamento() {
  const lancamentos = lancamentosDemo();
  const tabela = montarDRE({ lancamentos, periodo: "agosto de 2026" });
  const receitas = tabela.resumo?.find((item) => item.rotulo === "Receitas")?.valorCents ?? 0;
  const resultado = tabela.resumo?.find((item) => item.destaque)?.valorCents ?? 0;

  const conferidos = [
    "Lançamentos sem categoria",
    "Recebimentos sem forma de pagamento",
    "Despesas sem comprovante",
  ];

  return (
    <div className="flex max-h-[460px] w-full min-w-0 flex-col gap-4 overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-medium">
            agosto de 2026
            <Badge variant="outline" className="border-gold text-gold-ink">
              <Lock className="size-3" aria-hidden />
              Fechado
            </Badge>
          </span>
          <span className="text-xs text-muted-foreground">
            Fechado em 01/09/2026 · {lancamentos.length} lançamentos
          </span>
        </span>
        <span className="flex gap-2">
          {[FileText, FileSpreadsheet, Table2].map((Icone, indice) => (
            <span
              key={indice}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              <Icone className="size-3.5" aria-hidden />
              {["PDF", "Excel", "CSV"][indice]}
            </span>
          ))}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground">Receitas do mês</span>
          <p className="font-mono text-lg tabular text-success">{formatarBRL(receitas)}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground">Resultado</span>
          <p className="font-mono text-lg tabular">{formatarBRL(resultado)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {conferidos.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {item}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        E-mail enviado ao contador com o pacote do mês.
      </p>
    </div>
  );
}
