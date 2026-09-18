"use client";

import { Check, Loader2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { marcarReciboSaude } from "@/app/(app)/app/financeiro/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";

export type ReciboDoMes = {
  id: string;
  paciente: string;
  documento: string | null;
  valorCents: number;
  pagoEm: string | null;
  emitido: boolean;
};

/**
 * Controle dos recibos do Receita Saúde.
 *
 * Quem emite o recibo é o profissional, no aplicativo da Receita Federal — o
 * Alicerce não emite nada. O que ele faz é não deixar nenhum ficar para trás:
 * lista quem falta e guarda quais já saíram. Funciona com o mês fechado, porque
 * emitir recibo acontece depois e não mexe em número nenhum do fechamento.
 */
export function RecibosDoReceitaSaude({
  fuso,
  recibos,
}: {
  fuso: string;
  recibos: ReciboDoMes[];
}) {
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  const faltando = recibos.filter((recibo) => !recibo.emitido);
  const prontos = recibos.filter((recibo) => recibo.emitido);

  function alternar(recibo: ReciboDoMes) {
    setEmAndamento(recibo.id);
    comecar(async () => {
      const resposta = await marcarReciboSaude(recibo.id, !recibo.emitido);
      setEmAndamento(null);
      if (resposta.erro) toast.error(resposta.erro);
      else toast.success(resposta.aviso ?? "Pronto.");
    });
  }

  if (recibos.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nenhum recebimento de pessoa física no período. O recibo do Receita Saúde só vale para
          paciente pessoa física.
        </AlertDescription>
      </Alert>
    );
  }

  function Linha({ recibo }: { recibo: ReciboDoMes }) {
    const trabalhando = pendente && emAndamento === recibo.id;
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 truncate font-medium">
            {recibo.paciente}
            {recibo.emitido ? <Badge variant="secondary">Emitido</Badge> : null}
          </span>
          <span className="font-mono text-xs tabular text-muted-foreground">
            {recibo.pagoEm ? formatarData(`${recibo.pagoEm}T12:00:00Z`, fuso) : "sem data"} ·{" "}
            {formatarBRL(recibo.valorCents)}
            {recibo.documento ? ` · CPF ${recibo.documento}` : " · sem CPF"}
          </span>
        </span>
        <Button
          type="button"
          size="xs"
          variant={recibo.emitido ? "ghost" : "outline"}
          disabled={trabalhando}
          onClick={() => alternar(recibo)}
        >
          {trabalhando ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : recibo.emitido ? (
            <Undo2 aria-hidden />
          ) : (
            <Check aria-hidden />
          )}
          {recibo.emitido ? "Desmarcar" : "Já emiti"}
        </Button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <AlertDescription>
          O Alicerce não emite o recibo do Receita Saúde. Você emite no aplicativo da Receita
          Federal e marca aqui, para nenhum ficar para trás na declaração.
        </AlertDescription>
      </Alert>

      {faltando.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            Faltam emitir ({faltando.length})
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {faltando.map((recibo) => (
              <Linha key={recibo.id} recibo={recibo} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum recibo pendente no período. Tudo em dia.
        </p>
      )}

      {prontos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Já emitidos ({prontos.length})
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {prontos.map((recibo) => (
              <Linha key={recibo.id} recibo={recibo} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
