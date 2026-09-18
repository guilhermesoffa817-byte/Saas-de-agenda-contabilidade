"use client";

import { CalendarSync, Copy, Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { gerarNovoLinkDaAgenda } from "./acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AgendaDeProfissional = {
  id: string;
  nome: string;
  token: string;
};

/**
 * O link é um segredo: quem tiver o endereço lê a agenda daquele profissional.
 * Por isso ele nunca aparece numa página pública e pode ser trocado a qualquer
 * momento.
 */
export function AgendaNoCelular({
  empresaId,
  site,
  profissionais,
}: {
  empresaId: string;
  site: string;
  profissionais: AgendaDeProfissional[];
}) {
  const [tokens, setTokens] = useState(
    () => new Map(profissionais.map((item) => [item.id, item.token])),
  );
  const [trocando, setTrocando] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  const enderecoDe = (id: string) => `${site}/api/ical/${tokens.get(id) ?? ""}`;

  function copiar(id: string) {
    void navigator.clipboard.writeText(enderecoDe(id));
    toast.success("Link copiado. Cole no seu calendário.");
  }

  function trocar(id: string) {
    setTrocando(id);
    comecar(async () => {
      const resposta = await gerarNovoLinkDaAgenda(empresaId, id);
      setTrocando(null);
      if (resposta.erro) {
        toast.error(resposta.erro);
        return;
      }
      if (resposta.dados?.token) {
        setTokens((atual) => new Map(atual).set(id, resposta.dados!.token));
      }
      toast.success(resposta.aviso ?? "Link novo gerado.");
    });
  }

  if (profissionais.length === 0) {
    return (
      <Alert>
        <CalendarSync className="size-4" aria-hidden />
        <AlertDescription>
          Cadastre um profissional para gerar o link da agenda no celular.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Agenda no celular</h2>
        <p className="text-sm text-muted-foreground">
          Assine o link no Google Agenda ou no calendário do iPhone e os atendimentos aparecem lá,
          atualizados sozinhos. O calendário relê a cada 15 minutos, mais ou menos — quem manda no
          intervalo é o aplicativo, não o Alicerce.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          O link é a chave: quem tiver o endereço enxerga essa agenda, sem precisar de senha. Se ele
          vazar, gere um novo — o antigo para de funcionar na hora.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-5">
        {profissionais.map((profissional) => (
          <div key={profissional.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <Label htmlFor={`ical-${profissional.id}`} className="text-sm font-medium">
              {profissional.nome}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`ical-${profissional.id}`}
                readOnly
                value={enderecoDe(profissional.id)}
                className="font-mono text-xs tabular"
                onFocus={(evento) => evento.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => copiar(profissional.id)}>
                  <Copy aria-hidden />
                  Copiar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendente && trocando === profissional.id}
                  onClick={() => trocar(profissional.id)}
                >
                  {pendente && trocando === profissional.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  Gerar novo link
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Como assinar</p>
        <p className="mt-1">
          No Google Agenda: Outras agendas → Inscrever-se em agenda → Do URL. No iPhone: Ajustes →
          Aplicativos → Calendário → Contas → Adicionar conta → Outra → Adicionar calendário
          assinado.
        </p>
      </div>
    </div>
  );
}
