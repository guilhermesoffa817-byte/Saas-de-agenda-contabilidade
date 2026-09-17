"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { assinar, cancelarAssinatura } from "@/app/(app)/app/assinatura/acoes";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatarBRL } from "@/lib/money";
import {
  INCLUSO_EM_TODOS,
  mesesGratisNoAnual,
  ORDEM_DOS_PLANOS,
  PLANOS,
  PLANO_DESTACADO,
  precoDoCiclo,
  type ChaveDePlano,
} from "@/lib/planos";
import { cn } from "@/lib/utils";

export function PlanosEAssinatura({
  planoAtual,
  cicloAtual,
  planoPendente,
  temAssinatura,
  cobrancaConfigurada,
}: {
  planoAtual: string;
  cicloAtual: "mensal" | "anual" | null;
  planoPendente: string | null;
  temAssinatura: boolean;
  cobrancaConfigurada: boolean;
}) {
  const [anual, setAnual] = useState(cicloAtual === "anual");
  const [processando, setProcessando] = useState<ChaveDePlano | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const ciclo = anual ? ("anual" as const) : ("mensal" as const);

  async function escolher(plano: ChaveDePlano) {
    setProcessando(plano);
    const resposta = await assinar({ plano, ciclo });
    setProcessando(null);

    if (resposta.erro) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Assinatura criada.");
    if (resposta.dados?.linkDePagamento) setLink(resposta.dados.linkDePagamento);
  }

  return (
    <div className="flex flex-col gap-6">
      {!cobrancaConfigurada ? (
        <Alert>
          <AlertDescription>
            A cobrança ainda não está ligada. Crie a conta sandbox do Asaas e preencha
            ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no .env.local para testar a assinatura de ponta a
            ponta.
          </AlertDescription>
        </Alert>
      ) : null}

      {link ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Sua cobrança está pronta.
            <Button asChild size="xs" variant="outline">
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Pagar agora (Pix, boleto ou cartão)
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Switch id="ciclo-anual" checked={anual} onCheckedChange={setAnual} />
        <Label htmlFor="ciclo-anual" className="font-normal">
          Pagar o ano de uma vez
        </Label>
        <Badge variant="outline" className="border-gold text-gold-ink">
          {mesesGratisNoAnual(PLANO_DESTACADO)} meses grátis
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ORDEM_DOS_PLANOS.map((chave) => {
          const plano = PLANOS[chave];
          const atual = planoAtual === chave;
          const pendente = planoPendente === chave;
          const destacado = chave === PLANO_DESTACADO;

          return (
            <div
              key={chave}
              className={cn(
                "flex flex-col gap-4 rounded-lg border p-5",
                destacado ? "border-gold bg-card shadow-lg shadow-black/5" : "border-border bg-card",
              )}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-semibold">{plano.nome}</span>
                  {destacado ? (
                    <Badge className="bg-gold text-gold-foreground hover:bg-gold">
                      Mais escolhido
                    </Badge>
                  ) : null}
                </div>
                <span className="text-sm text-muted-foreground">{plano.resumo}</span>
              </div>

              <div className="flex flex-col">
                <span className="font-mono text-3xl tabular">
                  {formatarBRL(anual ? Math.round(precoDoCiclo(chave, "anual") / 12) : plano.mensalCents)}
                </span>
                <span className="text-xs text-muted-foreground">
                  por mês{anual ? `, cobrado ${formatarBRL(precoDoCiclo(chave, "anual"))} por ano` : ""}
                </span>
              </div>

              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {plano.maxProfissionais === Infinity
                    ? "Profissionais sem limite"
                    : `${plano.maxProfissionais} ${plano.maxProfissionais === 1 ? "profissional" : "profissionais"}`}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {plano.lembretesAutomaticosMes === 0
                    ? "Lembrete pelo seu WhatsApp (sem custo)"
                    : `${plano.lembretesAutomaticosMes} lembretes automáticos por mês`}
                </li>
                {plano.nfse ? (
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    Emissão de NFS-e
                  </li>
                ) : null}
              </ul>

              {atual ? (
                <Button disabled variant="secondary" className="w-full">
                  Seu plano atual
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant={destacado ? "default" : "outline"}
                  disabled={processando !== null}
                  onClick={() => escolher(chave)}
                >
                  {processando === chave ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {pendente
                    ? "Aguardando pagamento"
                    : temAssinatura
                      ? "Trocar para este plano"
                      : "Assinar"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <span className="text-sm font-medium">Em todos os planos</span>
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {INCLUSO_EM_TODOS.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          7 dias grátis, sem cartão · Cancele quando quiser · Valores de exemplo, a revisar antes do
          lançamento
        </p>
      </div>

      {temAssinatura ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
          <span className="text-sm text-muted-foreground">
            Cancelar não apaga nada: seus dados ficam guardados e a exportação continua liberada.
          </span>
          <Button variant="outline" size="sm" onClick={() => setConfirmandoCancelamento(true)}>
            Cancelar assinatura
          </Button>
        </div>
      ) : null}

      {confirmandoCancelamento ? (
        <Dialog open onOpenChange={setConfirmandoCancelamento}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar a assinatura</DialogTitle>
              <DialogDescription>
                A cobrança para na hora. A conta passa para somente leitura: você continua vendo e
                exportando tudo, mas não lança novos atendimentos.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmandoCancelamento(false)}>
                Manter assinatura
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const resposta = await cancelarAssinatura();
                  if (resposta.erro) {
                    toast.error(resposta.erro);
                    return;
                  }
                  toast.success(resposta.aviso ?? "Assinatura cancelada.");
                  setConfirmandoCancelamento(false);
                }}
              >
                Cancelar mesmo assim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
