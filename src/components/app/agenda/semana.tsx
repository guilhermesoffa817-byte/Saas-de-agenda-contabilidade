"use client";

import { useState } from "react";

import { AcoesDoAtendimento } from "./acoes-atendimento";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CLASSES_STATUS, type AtendimentoNaAgenda, type ProfissionalDaAgenda } from "@/lib/agenda";
import { diaLocalISO, formatarHora } from "@/lib/dates";
import { DIAS_SEMANA } from "@/lib/dates";
import { cn } from "@/lib/utils";

function diasDaSemana(diaInicial: string) {
  return Array.from({ length: 7 }, (_, indice) => {
    const data = new Date(`${diaInicial}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + indice);
    return data.toISOString().slice(0, 10);
  });
}

export function VisaoSemana({
  dia,
  fuso,
  nomeDaEmpresa,
  atendimentos,
  profissionais,
  aoClicarVazio,
}: {
  dia: string;
  fuso: string;
  nomeDaEmpresa: string;
  atendimentos: AtendimentoNaAgenda[];
  profissionais: ProfissionalDaAgenda[];
  aoClicarVazio: (profissionalId: string, hora: string, dia: string) => void;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const dias = diasDaSemana(dia);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {dias.map((diaAtual) => {
        const doDia = atendimentos.filter((item) => diaLocalISO(item.inicio, fuso) === diaAtual);
        const data = new Date(`${diaAtual}T12:00:00Z`);
        const nomeDoDia = DIAS_SEMANA[data.getUTCDay()].curto;

        return (
          <div key={diaAtual} className="flex min-h-40 flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{nomeDoDia}</span>
              <span className="font-mono text-xs tabular text-muted-foreground">
                {diaAtual.slice(8, 10)}/{diaAtual.slice(5, 7)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {doDia.map((atendimento) => {
                const profissional = profissionais.find(
                  (item) => item.id === atendimento.profissionalId,
                );
                return (
                  <Popover
                    key={atendimento.id}
                    open={abertoId === atendimento.id}
                    onOpenChange={(aberto) => setAbertoId(aberto ? atendimento.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex flex-col rounded-md border px-2 py-1 text-left text-xs",
                          CLASSES_STATUS[atendimento.status],
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono tabular">
                            {formatarHora(atendimento.inicio, fuso)}
                          </span>
                          <span className="truncate font-medium">{atendimento.cliente.nome}</span>
                        </span>
                        <span className="truncate opacity-80">
                          {atendimento.servico.nome}
                          {profissional ? ` · ${profissional.nome}` : ""}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                      <AcoesDoAtendimento
                        atendimento={atendimento}
                        fuso={fuso}
                        nomeDaEmpresa={nomeDaEmpresa}
                        profissional={profissional?.nome}
                        aoFechar={() => setAbertoId(null)}
                      />
                    </PopoverContent>
                  </Popover>
                );
              })}

              {!doDia.length ? (
                <button
                  type="button"
                  onClick={() => aoClicarVazio(profissionais[0]?.id ?? "", "09:00", diaAtual)}
                  className="rounded-md border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-accent"
                >
                  Marcar atendimento
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
