import { AlertTriangle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Celula, Tabela } from "@/lib/reports/tipos";

function mostrar(valor: Celula, tipo: string) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "dinheiro" && typeof valor === "number") return formatarBRL(valor);
  if (tipo === "data" && typeof valor === "string") return valor.split("-").reverse().join("/");
  return String(valor);
}

/** O mesmo relatório que sai em PDF, Excel e CSV, mostrado na tela. */
export function TabelaDeRelatorio({ tabela }: { tabela: Tabela }) {
  return (
    <div className="flex flex-col gap-5">
      {tabela.resumo?.length ? (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {tabela.resumo.map((item) => (
            <div
              key={item.rotulo}
              className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
            >
              <span className={item.destaque ? "font-medium" : "text-muted-foreground"}>
                {item.rotulo}
              </span>
              <span
                className={cn(
                  "font-mono tabular",
                  item.destaque && "text-base font-medium",
                  item.negativo && "text-destructive",
                  item.destaque && item.valorCents < 0 && "text-destructive",
                )}
              >
                {item.negativo ? "− " : ""}
                {formatarBRL(item.valorCents)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {tabela.avisos?.length ? (
        <div className="flex flex-col gap-2">
          {tabela.avisos.map((aviso) => (
            <p
              key={aviso}
              className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {aviso}
            </p>
          ))}
        </div>
      ) : null}

      {tabela.linhas.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {tabela.colunas.map((coluna) => (
                  <TableHead
                    key={coluna.chave}
                    className={coluna.alinhamento === "direita" ? "text-right" : undefined}
                  >
                    {coluna.rotulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabela.linhas.map((linha, indice) => (
                <TableRow key={indice}>
                  {tabela.colunas.map((coluna) => (
                    <TableCell
                      key={coluna.chave}
                      className={cn(
                        coluna.tipo === "dinheiro" || coluna.tipo === "data"
                          ? "font-mono text-xs tabular"
                          : "text-sm",
                        coluna.alinhamento === "direita" && "text-right",
                      )}
                    >
                      {mostrar(linha[coluna.chave], coluna.tipo)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            {tabela.totais ? (
              <TableFooter>
                <TableRow>
                  {tabela.colunas.map((coluna, indice) => {
                    const total = tabela.totais?.[coluna.chave];
                    return (
                      <TableCell
                        key={coluna.chave}
                        className={cn(
                          "font-medium",
                          coluna.tipo === "dinheiro" && "font-mono tabular",
                          coluna.alinhamento === "direita" && "text-right",
                        )}
                      >
                        {indice === 0
                          ? "Total"
                          : total === undefined
                            ? ""
                            : mostrar(total, coluna.tipo)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento no período escolhido.
        </p>
      )}
    </div>
  );
}
