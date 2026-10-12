import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ROTULO_DA_NATUREZA, type Natureza } from "@/lib/custos/calculo";
import { cn } from "@/lib/utils";

/** Mesmas cores do gráfico: fixo terracota, variável dourado, fora da operação azul acinzentado. */
export const COR_DA_NATUREZA: Record<Natureza, string> = {
  fixo: "bg-chart-4",
  variavel: "bg-chart-2",
  nao_operacional: "bg-chart-3",
};

/** Cor e texto juntos: a natureza nunca depende só da cor. */
export function SeloNatureza({ natureza }: { natureza: Natureza | null }) {
  if (!natureza) {
    return (
      <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
        <AlertTriangle className="size-3" aria-hidden />
        Sem classificação
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-2 rounded-full", COR_DA_NATUREZA[natureza])} aria-hidden />
      {ROTULO_DA_NATUREZA[natureza]}
    </Badge>
  );
}
