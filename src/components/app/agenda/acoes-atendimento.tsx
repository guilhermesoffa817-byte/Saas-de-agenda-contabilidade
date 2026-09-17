"use client";

import { AlertTriangle, Check, CheckCheck, MessageCircle, Trash2, UserX } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  alterarStatus,
  marcarFalta,
  registrarLembreteEnviado,
} from "@/app/(app)/app/agenda/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData, formatarHora } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { formatarTelefone } from "@/lib/telefone";
import { linkWhatsApp, mensagemLembrete } from "@/lib/whatsapp";
import { ROTULO_STATUS, type AtendimentoNaAgenda } from "@/lib/agenda";

/** Detalhes e ações de um atendimento: o que a recepção faz no dia a dia. */
export function AcoesDoAtendimento({
  atendimento,
  fuso,
  nomeDaEmpresa,
  profissional,
  aoFechar,
}: {
  atendimento: AtendimentoNaAgenda;
  fuso: string;
  nomeDaEmpresa: string;
  profissional?: string;
  aoFechar?: () => void;
}) {
  const [processando, iniciar] = useTransition();

  function rodar(acao: () => Promise<{ erro?: string; aviso?: string }>) {
    iniciar(async () => {
      const resposta = await acao();
      if (resposta.erro) toast.error(resposta.erro);
      else if (resposta.aviso) toast.success(resposta.aviso);
      if (!resposta.erro) aoFechar?.();
    });
  }

  function enviarLembrete() {
    if (!atendimento.cliente.telefone) {
      toast.error("Esse cliente não tem WhatsApp cadastrado.");
      return;
    }
    const mensagem = mensagemLembrete({
      cliente: atendimento.cliente.nome.split(" ")[0],
      servico: atendimento.servico.nome,
      data: formatarData(atendimento.inicio, fuso),
      hora: formatarHora(atendimento.inicio, fuso),
      empresa: nomeDaEmpresa,
    });
    window.open(linkWhatsApp(atendimento.cliente.telefone, mensagem), "_blank", "noopener");
    iniciar(async () => {
      await registrarLembreteEnviado(atendimento.id);
    });
  }

  const encerrado = atendimento.status === "concluido" || atendimento.status === "cancelado";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{atendimento.cliente.nome}</span>
          <Badge variant="secondary">{ROTULO_STATUS[atendimento.status]}</Badge>
          {atendimento.origem === "link_publico" ? (
            <Badge variant="outline">Pelo link</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {atendimento.servico.nome} · {formatarHora(atendimento.inicio, fuso)} às{" "}
          {formatarHora(atendimento.fim, fuso)}
          {profissional ? ` · ${profissional}` : ""}
        </p>
        <p className="font-mono text-sm tabular">{formatarBRL(atendimento.precoCents)}</p>
        {atendimento.cliente.telefone ? (
          <p className="text-sm text-muted-foreground">
            {formatarTelefone(atendimento.cliente.telefone)}
          </p>
        ) : null}
        {atendimento.cliente.faltas > 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            Já faltou {atendimento.cliente.faltas}{" "}
            {atendimento.cliente.faltas === 1 ? "vez" : "vezes"}
          </p>
        ) : null}
        {atendimento.lembreteEnviadoEm ? (
          <p className="text-xs text-muted-foreground">
            Lembrete enviado em {formatarData(atendimento.lembreteEnviadoEm, fuso)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {!encerrado ? (
          <>
            {atendimento.status !== "confirmado" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={processando}
                onClick={() =>
                  rodar(() => alterarStatus({ atendimentoId: atendimento.id, status: "confirmado" }))
                }
              >
                <Check aria-hidden />
                Confirmar
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={processando}
              onClick={() =>
                rodar(() => alterarStatus({ atendimentoId: atendimento.id, status: "concluido" }))
              }
            >
              <CheckCheck aria-hidden />
              Concluir
            </Button>
            <Button size="sm" variant="outline" disabled={processando} onClick={enviarLembrete}>
              <MessageCircle aria-hidden />
              Enviar lembrete
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={processando}
              onClick={() => rodar(() => marcarFalta(atendimento.id))}
            >
              <UserX aria-hidden />
              Faltou
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={processando}
              onClick={() =>
                rodar(() => alterarStatus({ atendimentoId: atendimento.id, status: "cancelado" }))
              }
            >
              <Trash2 aria-hidden />
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={processando}
            onClick={() =>
              rodar(() => alterarStatus({ atendimentoId: atendimento.id, status: "agendado" }))
            }
          >
            Reabrir atendimento
          </Button>
        )}
      </div>
    </div>
  );
}
