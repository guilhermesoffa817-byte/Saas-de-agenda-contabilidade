"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarOff, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { AcoesDoAtendimento } from "./acoes-atendimento";
import { remarcarAtendimento, removerBloqueio } from "@/app/(app)/app/agenda/acoes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CLASSES_STATUS,
  PASSO_MINUTOS,
  PIXELS_POR_MINUTO,
  faixaDaGrade,
  minutosDoDia,
  minutosParaHora,
  type AtendimentoNaAgenda,
  type BloqueioNaAgenda,
  type ProfissionalDaAgenda,
} from "@/lib/agenda";
import { formatarHora } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export type FaixaDeExpediente = { profissionalId: string; diaSemana: number; inicio: string; fim: string };

function paraMinutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function Celula({
  id,
  topo,
  altura,
  aoClicar,
  foraDoExpediente,
}: {
  id: string;
  topo: number;
  altura: number;
  aoClicar: () => void;
  foraDoExpediente: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={aoClicar}
      aria-label={`Marcar às ${id.split("|")[1]}`}
      className={cn(
        "absolute inset-x-0 border-t border-border/40 transition-colors",
        foraDoExpediente ? "bg-muted/40" : "hover:bg-accent/60",
        isOver ? "bg-primary/15" : "",
      )}
      style={{ top: topo, height: altura }}
    />
  );
}

function CartaoAtendimento({
  atendimento,
  fuso,
  nomeDaEmpresa,
  profissional,
  topo,
  altura,
}: {
  atendimento: AtendimentoNaAgenda;
  fuso: string;
  nomeDaEmpresa: string;
  profissional?: string;
  topo: number;
  altura: number;
}) {
  const [aberto, setAberto] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: atendimento.id,
    data: { tipo: "atendimento" },
  });

  const arrastavel = atendimento.status !== "concluido";

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <div
          ref={arrastavel ? setNodeRef : undefined}
          {...(arrastavel ? listeners : {})}
          {...(arrastavel ? attributes : {})}
          role="button"
          tabIndex={0}
          aria-label={`${atendimento.cliente.nome}, ${atendimento.servico.nome}, ${formatarHora(atendimento.inicio, fuso)}`}
          className={cn(
            "absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm",
            CLASSES_STATUS[atendimento.status],
            arrastavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            isDragging ? "z-30 opacity-90 shadow-lg" : "z-10",
          )}
          style={{
            top: topo,
            height: Math.max(altura, 22),
            transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          }}
        >
          <span className="block truncate font-medium">{atendimento.cliente.nome}</span>
          {altura > 34 ? (
            <span className="block truncate opacity-80">
              {formatarHora(atendimento.inicio, fuso)} · {atendimento.servico.nome}
            </span>
          ) : null}
          {altura > 58 ? (
            <span className="block font-mono tabular opacity-80">
              {formatarBRL(atendimento.precoCents)}
            </span>
          ) : null}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <AcoesDoAtendimento
          atendimento={atendimento}
          fuso={fuso}
          nomeDaEmpresa={nomeDaEmpresa}
          profissional={profissional}
          aoFechar={() => setAberto(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function BlocoDeBloqueio({
  bloqueio,
  fuso,
  topo,
  altura,
}: {
  bloqueio: BloqueioNaAgenda;
  fuso: string;
  topo: number;
  altura: number;
}) {
  const [removendo, iniciar] = useTransition();

  return (
    <div
      className="absolute inset-x-1 z-10 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--muted)_6px,var(--muted)_12px)] px-2 py-1 text-xs text-muted-foreground"
      style={{ top: topo, height: Math.max(altura, 20) }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <CalendarOff className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{bloqueio.motivo || "Bloqueado"}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remover bloqueio"
          disabled={removendo}
          onClick={() =>
            iniciar(async () => {
              const resposta = await removerBloqueio(bloqueio.id);
              if (resposta.erro) toast.error(resposta.erro);
            })
          }
        >
          <X aria-hidden />
        </Button>
      </div>
      {altura > 34 ? (
        <span className="block opacity-80">
          {formatarHora(bloqueio.inicio, fuso)} às {formatarHora(bloqueio.fim, fuso)}
        </span>
      ) : null}
    </div>
  );
}

export function GradeDoDia({
  dia,
  fuso,
  nomeDaEmpresa,
  profissionais,
  atendimentos,
  bloqueios,
  expediente,
  aoClicarVazio,
}: {
  dia: string;
  fuso: string;
  nomeDaEmpresa: string;
  profissionais: ProfissionalDaAgenda[];
  atendimentos: AtendimentoNaAgenda[];
  bloqueios: BloqueioNaAgenda[];
  expediente: FaixaDeExpediente[];
  aoClicarVazio: (profissionalId: string, hora: string) => void;
}) {
  const [remarcando, iniciar] = useTransition();
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [agoraMin, setAgoraMin] = useState<number | null>(null);

  const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const faixasDoDia = expediente.filter((faixa) => faixa.diaSemana === diaSemana);

  const faixa = faixaDaGrade({
    expediente: faixasDoDia.map((item) => ({
      inicio: paraMinutos(item.inicio),
      fim: paraMinutos(item.fim),
    })),
    atendimentos: atendimentos.map((item) => ({
      inicioMin: minutosDoDia(item.inicio, fuso),
      fimMin: minutosDoDia(item.fim, fuso),
    })),
    bloqueios: bloqueios.map((item) => ({
      inicioMin: minutosDoDia(item.inicio, fuso),
      fimMin: minutosDoDia(item.fim, fuso),
    })),
  });

  const alturaTotal = (faixa.fim - faixa.inicio) * PIXELS_POR_MINUTO;
  const horas = Array.from(
    { length: Math.floor((faixa.fim - faixa.inicio) / 60) + 1 },
    (_, indice) => faixa.inicio + indice * 60,
  );

  useEffect(() => {
    function atualizar() {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
      if (hoje !== dia) {
        setAgoraMin(null);
        return;
      }
      setAgoraMin(minutosDoDia(new Date().toISOString(), fuso));
    }
    atualizar();
    const intervalo = setInterval(atualizar, 60_000);
    return () => clearInterval(intervalo);
  }, [dia, fuso]);

  function aoSoltar(evento: DragEndEvent) {
    const destino = evento.over?.id;
    if (!destino || typeof destino !== "string") return;

    const [profissionalId, hora] = destino.split("|");
    const atendimento = atendimentos.find((item) => item.id === evento.active.id);
    if (!atendimento) return;
    if (
      atendimento.profissionalId === profissionalId &&
      formatarHora(atendimento.inicio, fuso) === hora
    ) {
      return;
    }

    iniciar(async () => {
      const resposta = await remarcarAtendimento({
        atendimentoId: atendimento.id,
        profissionalId,
        dia,
        hora,
      });
      if (resposta.erro) toast.error(resposta.erro);
      else if (resposta.aviso) toast.success(resposta.aviso);
    });
  }

  if (!profissionais.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum profissional cadastrado ainda.
      </p>
    );
  }

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-card",
          remarcando ? "opacity-70" : "",
        )}
      >
        <div className="flex min-w-fit">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-border bg-card">
            <div className="h-10 border-b border-border" />
            <div className="relative" style={{ height: alturaTotal }}>
              {horas.map((minuto) => (
                <span
                  key={minuto}
                  className={cn(
                    "absolute right-2 font-mono text-[11px] tabular text-muted-foreground",
                    minuto === faixa.inicio ? "" : "-translate-y-1/2",
                  )}
                  style={{ top: (minuto - faixa.inicio) * PIXELS_POR_MINUTO }}
                >
                  {minutosParaHora(minuto)}
                </span>
              ))}
            </div>
          </div>

          {profissionais.map((profissional) => {
            const doProfissional = atendimentos.filter(
              (item) => item.profissionalId === profissional.id,
            );
            const bloqueiosDele = bloqueios.filter(
              (item) => item.profissionalId === profissional.id,
            );
            const faixasDele = faixasDoDia.filter(
              (item) => item.profissionalId === profissional.id,
            );

            const celulas = Math.floor((faixa.fim - faixa.inicio) / PASSO_MINUTOS);

            return (
              <div
                key={profissional.id}
                className="min-w-44 flex-1 border-r border-border last:border-r-0"
              >
                <div className="flex h-10 items-center gap-2 border-b border-border px-3">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: profissional.cor }}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium">{profissional.nome}</span>
                </div>

                <div className="relative" style={{ height: alturaTotal }}>
                  {Array.from({ length: celulas }, (_, indice) => {
                    const minuto = faixa.inicio + indice * PASSO_MINUTOS;
                    const dentro = faixasDele.some(
                      (item) => minuto >= paraMinutos(item.inicio) && minuto < paraMinutos(item.fim),
                    );
                    return (
                      <Celula
                        key={minuto}
                        id={`${profissional.id}|${minutosParaHora(minuto)}`}
                        topo={(minuto - faixa.inicio) * PIXELS_POR_MINUTO}
                        altura={PASSO_MINUTOS * PIXELS_POR_MINUTO}
                        foraDoExpediente={!dentro}
                        aoClicar={() => aoClicarVazio(profissional.id, minutosParaHora(minuto))}
                      />
                    );
                  })}

                  {bloqueiosDele.map((bloqueio) => (
                    <BlocoDeBloqueio
                      key={bloqueio.id}
                      bloqueio={bloqueio}
                      fuso={fuso}
                      topo={(minutosDoDia(bloqueio.inicio, fuso) - faixa.inicio) * PIXELS_POR_MINUTO}
                      altura={
                        (minutosDoDia(bloqueio.fim, fuso) - minutosDoDia(bloqueio.inicio, fuso)) *
                        PIXELS_POR_MINUTO
                      }
                    />
                  ))}

                  {doProfissional.map((atendimento) => (
                    <CartaoAtendimento
                      key={atendimento.id}
                      atendimento={atendimento}
                      fuso={fuso}
                      nomeDaEmpresa={nomeDaEmpresa}
                      profissional={profissional.nome}
                      topo={
                        (minutosDoDia(atendimento.inicio, fuso) - faixa.inicio) * PIXELS_POR_MINUTO
                      }
                      altura={
                        (minutosDoDia(atendimento.fim, fuso) -
                          minutosDoDia(atendimento.inicio, fuso)) *
                        PIXELS_POR_MINUTO
                      }
                    />
                  ))}

                  {agoraMin !== null && agoraMin >= faixa.inicio && agoraMin <= faixa.fim ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                      style={{ top: (agoraMin - faixa.inicio) * PIXELS_POR_MINUTO }}
                      aria-hidden
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
