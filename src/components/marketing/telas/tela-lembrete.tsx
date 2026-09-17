"use client";

import { Check, CheckCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EMPRESA_DEMO } from "@/lib/demo-data";
import { mensagemLembrete } from "@/lib/whatsapp";

/**
 * Prévia da mensagem de lembrete. Não é captura de tela do WhatsApp: é o texto
 * que o Alicerce monta, desenhado com os tokens da marca.
 */
export function TelaLembrete() {
  const mensagem = mensagemLembrete({
    cliente: "Marina",
    servico: "Escova + hidratação",
    data: "05/10/2026",
    hora: "11:30",
    empresa: EMPRESA_DEMO.nome,
  });

  return (
    <div className="flex max-h-[460px] flex-col gap-4 overflow-hidden bg-secondary/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Marina Alves</span>
        <Badge variant="outline">Lembrete de utilidade</Badge>
      </div>

      <div className="ml-auto flex max-w-[85%] flex-col gap-1 rounded-lg rounded-br-sm bg-primary/10 p-3">
        <p className="text-sm leading-relaxed">{mensagem}</p>
        <span className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          11:02
          <CheckCheck className="size-3" aria-hidden />
        </span>
      </div>

      <div className="mr-auto flex max-w-[70%] flex-col gap-1 rounded-lg rounded-bl-sm border border-border bg-card p-3">
        <p className="text-sm">Confirmado! 😊</p>
        <span className="text-right text-[10px] text-muted-foreground">11:04</span>
      </div>

      <div className="mt-auto flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
        <Check className="size-4 text-primary" aria-hidden />
        Atendimento marcado como confirmado na agenda.
      </div>
    </div>
  );
}
