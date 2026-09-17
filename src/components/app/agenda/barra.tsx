"use client";

import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfissionalDaAgenda } from "@/lib/agenda";

export type Visao = "dia" | "semana" | "lista";

export function BarraDaAgenda({
  dia,
  visao,
  profissionalId,
  profissionais,
  titulo,
  onNovo,
  onBloquear,
}: {
  dia: string;
  visao: Visao;
  profissionalId?: string;
  profissionais: ProfissionalDaAgenda[];
  titulo: string;
  onNovo: () => void;
  onBloquear: () => void;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  function irPara(mudanca: Record<string, string | undefined>) {
    const novos = new URLSearchParams(parametros.toString());
    for (const [chave, valor] of Object.entries(mudanca)) {
      if (valor === undefined || valor === "") novos.delete(chave);
      else novos.set(chave, valor);
    }
    router.push(`${caminho}?${novos.toString()}`);
  }

  function mover(passos: number) {
    const dias = visao === "semana" ? 7 : 1;
    const base = new Date(`${dia}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + passos * dias);
    irPara({ dia: base.toISOString().slice(0, 10) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Período anterior" onClick={() => mover(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon" aria-label="Próximo período" onClick={() => mover(1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => irPara({ dia: undefined })}>
            Hoje
          </Button>
          <h1 className="ml-2 text-lg font-semibold tracking-tight first-letter:uppercase">
            {titulo}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBloquear}>
            <CalendarOff aria-hidden />
            Bloquear horário
          </Button>
          <Button size="sm" onClick={onNovo}>
            <Plus aria-hidden />
            Novo atendimento
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={visao} onValueChange={(valor) => irPara({ visao: valor })}>
          <TabsList>
            <TabsTrigger value="dia">Dia</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
          </TabsList>
        </Tabs>

        {profissionais.length > 1 ? (
          <Select
            value={profissionalId ?? "todos"}
            onValueChange={(valor) => irPara({ profissional: valor === "todos" ? undefined : valor })}
          >
            <SelectTrigger className="w-52" aria-label="Filtrar por profissional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os profissionais</SelectItem>
              {profissionais.map((profissional) => (
                <SelectItem key={profissional.id} value={profissional.id}>
                  {profissional.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <input
          type="date"
          aria-label="Escolher dia"
          value={dia}
          onChange={(evento) => irPara({ dia: evento.target.value })}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-mono tabular"
        />
      </div>
    </div>
  );
}
