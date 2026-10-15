"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { aceitarAvisoDoAssistente } from "@/app/(app)/app/assistente/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** Aviso do primeiro uso: o dono lê e aceita antes da primeira pergunta. */
export function AvisoDeConsentimento() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [aceitando, iniciar] = useTransition();

  function aceitar() {
    setErro(null);
    iniciar(async () => {
      const resposta = await aceitarAvisoDoAssistente();
      if (resposta.erro) {
        setErro(resposta.erro);
        return;
      }
      toast.success(resposta.aviso ?? "Aviso aceito.");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          Antes da primeira pergunta
        </CardTitle>
        <CardDescription>Como o assistente usa os dados do seu negócio.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}
        <p>
          O assistente usa a inteligência artificial Claude, da Anthropic. Para responder, ele lê totais e indicadores
          do seu negócio — nunca nome, telefone, CPF ou anotações dos seus clientes — e pode pesquisar na internet
          usando só o seu segmento e a sua cidade. O processamento acontece fora do Brasil.{" "}
          <Link href="/privacidade" className="text-primary underline underline-offset-2">
            Política de privacidade
          </Link>
        </p>
        <p className="text-muted-foreground">
          As respostas são sugestões e podem conter erros. Decisões sobre impostos, regime e folha continuam com o seu
          contador.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={aceitar} disabled={aceitando}>
          {aceitando ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Li e quero usar o assistente
        </Button>
      </CardFooter>
    </Card>
  );
}
