"use client";

import { useState } from "react";

import { AcoesDoAtendimento } from "./acoes-atendimento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROTULO_STATUS,
  type AtendimentoNaAgenda,
  type ContextoFinanceiro,
  type ProfissionalDaAgenda,
} from "@/lib/agenda";
import { formatarData, formatarHora } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { formatarTelefone } from "@/lib/telefone";

const VARIANTE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  agendado: "secondary",
  confirmado: "outline",
  concluido: "default",
  faltou: "destructive",
  cancelado: "outline",
};

export function VisaoLista({
  atendimentos,
  profissionais,
  fuso,
  nomeDaEmpresa,
  financeiro,
}: {
  atendimentos: AtendimentoNaAgenda[];
  profissionais: ProfissionalDaAgenda[];
  fuso: string;
  nomeDaEmpresa: string;
  financeiro: ContextoFinanceiro;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);

  if (!atendimentos.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum atendimento nesse período.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Serviço</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {atendimentos.map((atendimento) => {
            const profissional = profissionais.find((item) => item.id === atendimento.profissionalId);
            return (
              <TableRow key={atendimento.id}>
                <TableCell className="font-mono text-xs tabular whitespace-nowrap">
                  {formatarData(atendimento.inicio, fuso)} · {formatarHora(atendimento.inicio, fuso)}
                </TableCell>
                <TableCell>
                  <span className="block">{atendimento.cliente.nome}</span>
                  {atendimento.cliente.telefone ? (
                    <span className="text-xs text-muted-foreground">
                      {formatarTelefone(atendimento.cliente.telefone)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{atendimento.servico.nome}</TableCell>
                <TableCell>{profissional?.nome ?? "—"}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {formatarBRL(atendimento.precoCents)}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE[atendimento.status] ?? "secondary"}>
                    {ROTULO_STATUS[atendimento.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Popover
                    open={abertoId === atendimento.id}
                    onOpenChange={(aberto) => setAbertoId(aberto ? atendimento.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Abrir
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                      <AcoesDoAtendimento
                        atendimento={atendimento}
                        fuso={fuso}
                        nomeDaEmpresa={nomeDaEmpresa}
          financeiro={financeiro}
                        profissional={profissional?.nome}
                        aoFechar={() => setAbertoId(null)}
                      />
                    </PopoverContent>
                  </Popover>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
