import "server-only";

import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { aceitouOAviso, conversaDoUsuario, listarConversas, mensagensDaConversa } from "./dados";
import { AvisoDeConsentimento } from "@/components/app/assistente/aviso-consentimento";
import { ChatDoAssistente } from "@/components/app/assistente/chat";
import type { CotaDoAssistente, MensagemDaTela } from "@/components/app/assistente/protocolo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iaConfigurada } from "@/lib/ia/cliente";
import { cotaDeIa } from "@/lib/ia/cota";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Assistente" };
/** O envio das perguntas vai pela rota /api/assistente; a página só lê. */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Cabecalho() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Pergunte sobre o seu negócio. O assistente lê os números do Bossa — financeiro, agenda, serviços e
        equipe — e responde com sugestões.
      </p>
    </div>
  );
}

export default async function PaginaAssistente({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");
  const empresa = vinculo.empresa;

  if (!iaConfigurada()) {
    return (
      <div className="flex flex-col gap-8">
        <Cabecalho />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" aria-hidden />O assistente ainda não foi ativado neste servidor
            </CardTitle>
            <CardDescription>
              Falta configurar a chave de acesso ao serviço de IA (a variável <code>ANTHROPIC_API_KEY</code>) nas
              variáveis de ambiente do servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Quem cuida da instalação do Bossa faz isso uma vez só. Depois, basta recarregar esta página. O restante do
            sistema funciona normalmente enquanto isso.
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const bloqueio = garantirEscrita(vinculo);
  const aceitou = await aceitouOAviso(supabase, empresa.id, user.id).catch(() => false);

  if (!aceitou) {
    return (
      <div className="flex flex-col gap-8">
        <Cabecalho />
        {bloqueio ? (
          <Alert>
            <AlertTitle>Modo somente leitura</AlertTitle>
            <AlertDescription>{bloqueio}</AlertDescription>
          </Alert>
        ) : (
          <AvisoDeConsentimento />
        )}
      </div>
    );
  }

  const { c } = await searchParams;
  const pedida = c && UUID.test(c) ? c : null;

  const [conversas, cota, conversa] = await Promise.all([
    listarConversas(supabase, empresa.id, user.id),
    cotaDeIa({ supabase, empresa, recurso: "assistente" })
      .then((v): CotaDoAssistente => ({ usados: v.usados, limite: v.limite }))
      .catch(() => null),
    pedida ? conversaDoUsuario(supabase, empresa.id, user.id, pedida) : Promise.resolve(null),
  ]);
  const mensagens: MensagemDaTela[] = conversa
    ? await mensagensDaConversa(supabase, empresa.id, conversa.id).catch(() => [])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho />
      <ChatDoAssistente
        key={conversa?.id ?? "nova"}
        conversaInicial={conversa ? { id: conversa.id, mensagens } : null}
        conversas={conversas}
        cota={cota}
        bloqueio={bloqueio}
        fuso={empresa.timezone}
      />
    </div>
  );
}
