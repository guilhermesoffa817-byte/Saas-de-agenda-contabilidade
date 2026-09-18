import { ArrowRight, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BotaoAceitarConvite } from "./botao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { jaPassou } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { usuarioAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Convite — Alicerce" };

export const dynamic = "force-dynamic";

const PAPEIS: Record<string, string> = {
  dono: "dono do negócio",
  profissional: "profissional",
  recepcao: "recepção",
  contador: "contador",
};

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!supabaseConfigurado) {
    // Também é uma página inteira: precisa do próprio título.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Configuração pendente</h1>
        <Alert>
          <MailWarning aria-hidden />
          <AlertTitle>Faltam as chaves do Supabase</AlertTitle>
          <AlertDescription>
            Elas ainda não estão no arquivo .env.local, então não é possível abrir convites.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // O convite é lido pelo servidor: quem recebeu o link ainda não é membro da empresa.
  const admin = createAdminClient();
  const { data: convite } = await admin
    .from("organization_invites")
    .select("email, role, expires_at, accepted_at, organizations(name)")
    .eq("token", token)
    .maybeSingle();

  const empresa = (convite?.organizations as { name: string } | null)?.name;
  const expirado = convite ? jaPassou(convite.expires_at) : false;
  const usuario = await usuarioAtual();

  if (!convite || expirado || convite.accepted_at) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Convite indisponível</h1>
        <Alert variant="destructive">
          <AlertDescription>
            {convite?.accepted_at
              ? "Esse convite já foi aceito. Entre com a sua conta."
              : "Esse convite não existe mais ou passou do prazo de 7 dias. Peça um novo para o dono do negócio."}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/entrar">
            Ir para o login <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Você foi convidado</h1>
        <p className="text-sm text-muted-foreground">
          {empresa ? <strong className="text-foreground">{empresa}</strong> : "Um negócio"} quer te
          dar acesso como <strong className="text-foreground">{PAPEIS[convite.role] ?? convite.role}</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">Convite enviado para</p>
        <p className="font-medium">{convite.email}</p>
      </div>

      {usuario ? (
        usuario.email?.toLowerCase() === convite.email.toLowerCase() ? (
          <BotaoAceitarConvite token={token} />
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Você está em outra conta</AlertTitle>
            <AlertDescription>
              Este convite é para {convite.email}, mas você está logado como {usuario.email}. Saia da
              conta atual e entre com o e-mail convidado.
            </AlertDescription>
          </Alert>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Para aceitar, entre ou crie sua conta com o e-mail {convite.email}.
          </p>
          <Button asChild>
            <Link href={`/entrar?voltar=/convite/${token}`}>Entrar e aceitar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/cadastro?voltar=/convite/${token}`}>Criar conta e aceitar</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
