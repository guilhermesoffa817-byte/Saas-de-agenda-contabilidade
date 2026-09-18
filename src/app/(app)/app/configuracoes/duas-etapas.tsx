"use client";

import { Check, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  comecarCadastroDe2FA,
  confirmarCadastroDe2FA,
  removerFatorDe2FA,
  type FatorDeSeguranca,
} from "./acoes-2fa";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/dates";

type Cadastro = { fatorId: string; qrCode: string; segredo: string };

/**
 * Verificação em duas etapas por aplicativo autenticador. Opcional, e a gente
 * diz com todas as letras para quem ela mais importa: quem mexe em dinheiro e
 * quem enxerga dado de cliente.
 */
export function DuasEtapas({ fuso, fatores }: { fuso: string; fatores: FatorDeSeguranca[] }) {
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [codigo, setCodigo] = useState("");
  const [pendente, comecar] = useTransition();

  const ativos = fatores.filter((fator) => fator.verificado);

  function iniciar() {
    comecar(async () => {
      const resposta = await comecarCadastroDe2FA("Aplicativo autenticador");
      if (resposta.erro) {
        toast.error(resposta.erro);
        return;
      }
      setCadastro(resposta.dados ?? null);
      setCodigo("");
    });
  }

  function confirmar() {
    if (!cadastro) return;
    comecar(async () => {
      const resposta = await confirmarCadastroDe2FA(cadastro.fatorId, codigo);
      if (resposta.erro) {
        toast.error(resposta.erro);
        return;
      }
      toast.success(resposta.aviso ?? "Pronto.");
      setCadastro(null);
      setCodigo("");
    });
  }

  function remover(fatorId: string) {
    comecar(async () => {
      const resposta = await removerFatorDe2FA(fatorId);
      if (resposta.erro) toast.error(resposta.erro);
      else toast.success(resposta.aviso ?? "Desligada.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Verificação em duas etapas</h2>
        <p className="text-sm text-muted-foreground">
          Além da senha, um código de seis números que muda a cada 30 segundos no seu celular. Vale
          a pena para quem mexe no financeiro e para o contador, que enxerga dado de vários clientes.
        </p>
      </div>

      {ativos.length > 0 ? (
        <div className="flex flex-col gap-3">
          {ativos.map((fator) => (
            <div
              key={fator.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  {fator.nome}
                  <Badge variant="secondary">Ligada</Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  Desde {formatarData(fator.criadoEm, fuso)}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendente}
                onClick={() => remover(fator.id)}
              >
                <ShieldOff aria-hidden />
                Desligar
              </Button>
            </div>
          ))}
        </div>
      ) : cadastro ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <p className="text-sm">
            Abra o aplicativo autenticador (Google Authenticator, 1Password, Authy) e leia o código
            abaixo. Depois digite os seis números que aparecerem.
          </p>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Image
              src={cadastro.qrCode}
              alt="Código para ler no aplicativo autenticador"
              width={180}
              height={180}
              unoptimized
              className="rounded-lg border border-border bg-white p-2"
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="segredo-2fa" className="text-xs">
                Ou digite este código no aplicativo
              </Label>
              <Input
                id="segredo-2fa"
                readOnly
                value={cadastro.segredo}
                className="font-mono text-xs tabular"
                onFocus={(evento) => evento.currentTarget.select()}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo-2fa">Código do aplicativo</Label>
            <Input
              id="codigo-2fa"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              className="w-40 font-mono text-lg tabular"
              onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" disabled={pendente || codigo.length !== 6} onClick={confirmar}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              Confirmar
            </Button>
            <Button type="button" variant="ghost" disabled={pendente} onClick={() => setCadastro(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert>
            <AlertDescription>
              Guarde o código de recuperação do seu aplicativo autenticador. Sem o celular e sem ele,
              a única saída é pedir ajuda ao suporte, e isso leva tempo.
            </AlertDescription>
          </Alert>
          <div>
            <Button type="button" disabled={pendente} onClick={iniciar}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
              Ligar verificação em duas etapas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
