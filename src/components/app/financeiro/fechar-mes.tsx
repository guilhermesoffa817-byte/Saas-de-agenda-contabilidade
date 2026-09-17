"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, Lock, LockOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { fecharMes, linkDoPacote, reabrirMes } from "@/app/(app)/app/financeiro/fechamento/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarData } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";

export type PendenciaNaTela = {
  chave: string;
  titulo: string;
  explicacao: string;
  quantidade: number;
  grave: boolean;
  link?: string;
};

export type FechamentoNaTela = {
  mes: string;
  fechadoEm: string;
  reabertoEm: string | null;
  receitasCents: number;
  despesasCents: number;
  lancamentos: number;
  pacote: string | null;
};

export function FecharMes({
  mes,
  rotuloDoMes,
  fuso,
  pendencias,
  fechamento,
  temContador,
}: {
  mes: string;
  rotuloDoMes: string;
  fuso: string;
  pendencias: PendenciaNaTela[];
  fechamento: FechamentoNaTela | null;
  temContador: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const fechado = Boolean(fechamento && !fechamento.reabertoEm);
  const aResolver = pendencias.filter((item) => item.quantidade > 0);

  async function baixar(caminho: string, arquivo: string) {
    const resposta = await linkDoPacote(`${caminho}/${arquivo}`);
    if (resposta.erro || !resposta.dados) {
      toast.error(resposta.erro ?? "Não conseguimos abrir o arquivo.");
      return;
    }
    window.open(resposta.dados.url, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-medium first-letter:uppercase">
            {rotuloDoMes}
            {fechado ? (
              <Badge variant="outline" className="border-gold text-gold-ink">
                <Lock className="size-3" aria-hidden />
                Fechado
              </Badge>
            ) : (
              <Badge variant="secondary">Aberto</Badge>
            )}
          </span>
          {fechamento ? (
            <span className="text-xs text-muted-foreground">
              {fechado
                ? `Fechado em ${formatarData(fechamento.fechadoEm, fuso)} · ${fechamento.lancamentos} lançamentos`
                : `Reaberto em ${formatarData(fechamento.reabertoEm!, fuso)}`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Ainda não fechado. Confira a lista abaixo antes de fechar.
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {fechado ? (
            <>
              {fechamento?.pacote ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => baixar(fechamento.pacote!, `resumo-${mes}.pdf`)}
                  >
                    <Download aria-hidden />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => baixar(fechamento.pacote!, `resumo-${mes}.xlsx`)}
                  >
                    <Download aria-hidden />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => baixar(fechamento.pacote!, `resumo-${mes}.csv`)}
                  >
                    <Download aria-hidden />
                    CSV
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={processando}
                onClick={async () => {
                  setProcessando(true);
                  const resposta = await reabrirMes(mes);
                  setProcessando(false);
                  if (resposta.erro) toast.error(resposta.erro);
                  else toast.success(resposta.aviso ?? "Mês reaberto.");
                }}
              >
                {processando ? <Loader2 className="animate-spin" aria-hidden /> : <LockOpen aria-hidden />}
                Reabrir mês
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setConfirmando(true)}>
              <Lock aria-hidden />
              Fechar {rotuloDoMes.split(" ")[0]}
            </Button>
          )}
        </div>
      </div>

      {fechamento && fechado ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">Receitas do mês</span>
            <p className="font-mono text-lg tabular text-success">
              {formatarBRL(fechamento.receitasCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">Despesas do mês</span>
            <p className="font-mono text-lg tabular text-destructive">
              {formatarBRL(fechamento.despesasCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">Resultado</span>
            <p className="font-mono text-lg tabular">
              {formatarBRL(fechamento.receitasCents - fechamento.despesasCents)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Antes de fechar, confira</h2>
        {pendencias.map((pendencia) => (
          <div
            key={pendencia.chave}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <span className="flex min-w-0 items-start gap-2">
              {pendencia.quantidade === 0 ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangle
                  className={`mt-0.5 size-4 shrink-0 ${pendencia.grave ? "text-destructive" : "text-warning"}`}
                  aria-hidden
                />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">
                  {pendencia.titulo}
                  {pendencia.quantidade > 0 ? ` · ${pendencia.quantidade}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{pendencia.explicacao}</span>
              </span>
            </span>
            {pendencia.quantidade > 0 && pendencia.link ? (
              <Button asChild variant="outline" size="xs">
                <Link href={pendencia.link}>Resolver</Link>
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {!temContador ? (
        <Alert>
          <AlertDescription>
            Nenhum contador convidado ainda. Convide em{" "}
            <Link href="/app/configuracoes" className="underline underline-offset-4">
              Configurações
            </Link>{" "}
            para ele receber o fechamento por e-mail — o acesso dele é gratuito.
          </AlertDescription>
        </Alert>
      ) : null}

      {confirmando ? (
        <Dialog open onOpenChange={setConfirmando}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="first-letter:uppercase">Fechar {rotuloDoMes}</DialogTitle>
              <DialogDescription>
                Depois de fechado, o mês não aceita novos lançamentos nem alterações até você
                reabrir. Reabrir fica registrado.
              </DialogDescription>
            </DialogHeader>

            {aResolver.length ? (
              <Alert variant={aResolver.some((item) => item.grave) ? "destructive" : "default"}>
                <AlertDescription>
                  Ainda faltam: {aResolver.map((item) => `${item.titulo.toLowerCase()} (${item.quantidade})`).join(", ")}.
                  Dá para fechar assim mesmo, mas o contador pode voltar pedindo.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 aria-hidden />
                <AlertDescription>Tudo conferido. Pode fechar com tranquilidade.</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={processando}>
                Cancelar
              </Button>
              <Button
                disabled={processando}
                onClick={async () => {
                  setProcessando(true);
                  const resposta = await fecharMes(mes);
                  setProcessando(false);
                  if (resposta.erro) {
                    toast.error(resposta.erro);
                    return;
                  }
                  toast.success(resposta.aviso ?? "Mês fechado.");
                  setConfirmando(false);
                }}
              >
                {processando ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
                Fechar o mês e avisar o contador
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
