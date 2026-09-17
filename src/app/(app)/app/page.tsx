import { CalendarPlus, CheckCircle2, Circle, Scissors, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkDeAgendamento } from "@/components/app/link-de-agendamento";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/money";
import { nomeDoSegmento } from "@/lib/segmentos";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";
import { enderecoDoSite } from "@/lib/url";

export const metadata: Metadata = { title: "Painel — Alicerce" };

export default async function PaginaPainel() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return null;

  const empresa = vinculo.empresa;
  const supabase = await createClient();

  const [{ data: servicos }, { data: profissionais }, { count: totalClientes }, { count: totalEquipe }] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, duration_min, price_cents, bookable_online")
        .eq("organization_id", empresa.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("professionals")
        .select("id, name")
        .eq("organization_id", empresa.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", empresa.id)
        .is("deleted_at", null),
      supabase
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", empresa.id),
    ]);

  const link = `${await enderecoDoSite()}/agendar/${empresa.slug}`;

  const passos = [
    { feito: (profissionais?.length ?? 0) > 0, texto: "Cadastrar quem atende" },
    { feito: (servicos?.length ?? 0) > 0, texto: "Cadastrar seus serviços" },
    { feito: (totalEquipe ?? 0) > 1, texto: "Convidar o contador ou a equipe" },
    { feito: (totalClientes ?? 0) > 0, texto: "Receber o primeiro agendamento" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{empresa.name}</h1>
        <p className="text-sm text-muted-foreground">
          {nomeDoSegmento(empresa.segment)} · {empresa.city ? `${empresa.city} · ` : ""}
          {empresa.timezone.replace("America/", "").replace("_", " ")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seu link de agendamento</CardTitle>
          <CardDescription>
            Mande para os clientes e eles marcam sozinhos, sem você responder mensagem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LinkDeAgendamento link={link} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Users className="size-4" aria-hidden />
              Quem atende
            </CardDescription>
            <CardTitle className="font-mono text-3xl tabular">{profissionais?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Scissors className="size-4" aria-hidden />
              Serviços ativos
            </CardDescription>
            <CardTitle className="font-mono text-3xl tabular">{servicos?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <UserPlus className="size-4" aria-hidden />
              Clientes cadastrados
            </CardDescription>
            <CardTitle className="font-mono text-3xl tabular">{totalClientes ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Para deixar tudo pronto</CardTitle>
            <CardDescription>Quatro coisas e seu negócio está rodando no Alicerce.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {passos.map((passo) => (
              <div key={passo.texto} className="flex items-center gap-3 text-sm">
                {passo.feito ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className={passo.feito ? "text-muted-foreground line-through" : ""}>
                  {passo.texto}
                </span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm">
                <Link href="/app/agenda">
                  <CalendarPlus aria-hidden />
                  Abrir a agenda
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/configuracoes">Configurações</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seus serviços</CardTitle>
            <CardDescription>Duração e preço que aparecem no agendamento.</CardDescription>
          </CardHeader>
          <CardContent>
            {servicos?.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {servicos.slice(0, 6).map((servico) => (
                  <li key={servico.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{servico.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {servico.duration_min} min
                        {servico.bookable_online ? "" : " · só interno"}
                      </span>
                    </span>
                    <span className="font-mono tabular">{formatarBRL(servico.price_cents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum serviço cadastrado ainda.{" "}
                <Link href="/app/servicos" className="underline underline-offset-4">
                  Cadastrar agora
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
