import { Clock, MapPin } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { EMPRESA_DEMO, SERVICOS_DEMO } from "@/lib/demo-data";
import { formatarBRL } from "@/lib/money";

/**
 * O que o cliente do salão vê no link de agendamento — os mesmos cartões de
 * serviço da página pública, no primeiro passo.
 */
export function TelaAgendamento() {
  return (
    <div className="mx-auto flex max-h-[460px] w-full max-w-sm flex-col gap-5 overflow-hidden p-5">
      <div className="flex flex-col gap-2">
        <h4 className="font-display text-xl font-semibold tracking-tight">{EMPRESA_DEMO.nome}</h4>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          {EMPRESA_DEMO.cidade}, {EMPRESA_DEMO.estado}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Serviço</span>
          <span className="text-xs text-muted-foreground">1 de 5</span>
        </div>
        <Progress value={20} />
      </div>

      <div className="flex flex-col gap-2">
        {SERVICOS_DEMO.map((servico) => (
          <div
            key={servico.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{servico.nome}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                {servico.duracaoMin} minutos
              </span>
            </span>
            <span className="font-mono tabular">{formatarBRL(servico.precoCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
