"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Mostra o link público de agendamento com botão de copiar. */
export function LinkDeAgendamento({ link }: { link: string }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Cole na bio do Instagram ou no WhatsApp.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
        {link}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={copiar}>
        <Copy aria-hidden />
        Copiar
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={link} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          Abrir
        </a>
      </Button>
    </div>
  );
}
