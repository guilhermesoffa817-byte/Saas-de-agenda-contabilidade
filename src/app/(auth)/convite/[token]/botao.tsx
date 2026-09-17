"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { aceitarConvite } from "@/app/(auth)/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function BotaoAceitarConvite({ token }: { token: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const resposta = await aceitarConvite(token);
            if (resposta?.erro) setErro(resposta.erro);
          })
        }
      >
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Aceitar convite
      </Button>
    </div>
  );
}
