"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { pedirComprovante } from "@/app/contador/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Pedido de comprovante: chega por e-mail para o dono, sem WhatsApp no meio. */
export function PedirComprovante({ empresaId }: { empresaId: string }) {
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Pedir comprovante</h2>
        <p className="text-xs text-muted-foreground">
          O dono recebe por e-mail e anexa a foto no próprio lançamento.
        </p>
      </div>

      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <Label htmlFor="pedido-mensagem" className="sr-only">
        O que está faltando
      </Label>
      <Textarea
        id="pedido-mensagem"
        rows={3}
        value={mensagem}
        placeholder="Falta o comprovante do aluguel de setembro e a nota do fornecedor de materiais."
        onChange={(evento) => setMensagem(evento.target.value)}
      />

      <Button
        className="w-fit"
        size="sm"
        disabled={enviando || mensagem.trim().length < 5}
        onClick={async () => {
          setErro(null);
          setEnviando(true);
          const resposta = await pedirComprovante({ empresaId, mensagem });
          setEnviando(false);
          if (resposta.erro) {
            setErro(resposta.erro);
            return;
          }
          toast.success(resposta.aviso ?? "Pedido enviado.");
          setMensagem("");
        }}
      >
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Enviar pedido
      </Button>
    </div>
  );
}
