import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Building2, Lock, LockOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkDeIndicacao } from "@/components/app/contador/link-de-indicacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/money";
import { nomeDoSegmento } from "@/lib/segmentos";
import { createClient } from "@/lib/supabase/server";
import { exigirUsuario, vinculosDoUsuario } from "@/lib/supabase/sessao";
import { enderecoDoSite } from "@/lib/url";
import { listarFatores } from "@/app/(app)/app/configuracoes/acoes-2fa";
import { DuasEtapas } from "@/app/(app)/app/configuracoes/duas-etapas";

export const metadata: Metadata = { title: "Portal do contador — Alicerce" };

const REGIMES: Record<string, string> = {
  pf_autonomo: "Autônomo (pessoa física)",
  mei: "MEI",
  simples_nacional: "Simples Nacional",
  outro: "Outro",
};

export default async function PaginaContador() {
  const usuario = await exigirUsuario();
  const vinculos = await vinculosDoUsuario();
  const empresas = vinculos.filter((vinculo) => vinculo.papel === "contador");

  const supabase = await createClient();
  const mesPassado = format(subMonths(new Date(), 1), "yyyy-MM");

  const situacoes = await Promise.all(
    empresas.map(async (vinculo) => {
      const [{ data: fechamentos }, { count: pedidosAbertos }] = await Promise.all([
        supabase
          .from("monthly_closings")
          .select("month, closed_at, reopened_at, totals, package_path")
          .eq("organization_id", vinculo.empresa.id)
          .order("month", { ascending: false })
          .limit(3),
        supabase
          .from("document_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", vinculo.empresa.id)
          .is("resolved_at", null),
      ]);

      const ultimo = fechamentos?.[0];
      const totais = (ultimo?.totals ?? {}) as { receitas_cents?: number; despesas_cents?: number };

      return {
        vinculo,
        ultimoMes: ultimo?.month?.slice(0, 7) ?? null,
        fechado: Boolean(ultimo && !ultimo.reopened_at),
        receitasCents: Number(totais.receitas_cents ?? 0),
        despesasCents: Number(totais.despesas_cents ?? 0),
        pedidosAbertos: pedidosAbertos ?? 0,
        mesPassadoFechado: (fechamentos ?? []).some(
          (item) => item.month.slice(0, 7) === mesPassado && !item.reopened_at,
        ),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Seus clientes no Alicerce</h1>
        <p className="text-sm text-muted-foreground">
          {empresas.length === 1
            ? "Uma empresa te deu acesso."
            : `${empresas.length} empresas te deram acesso.`}{" "}
          Você vê o financeiro e os relatórios — nunca telefone ou anotação de cliente.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {situacoes.map((situacao) => (
          <Card key={situacao.vinculo.empresa.id}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Building2 className="size-4" aria-hidden />
                {nomeDoSegmento(situacao.vinculo.empresa.segment)} ·{" "}
                {REGIMES[situacao.vinculo.empresa.tax_regime] ?? "Outro"}
              </CardDescription>
              <CardTitle className="text-lg">{situacao.vinculo.empresa.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {situacao.ultimoMes ? (
                  <Badge variant={situacao.fechado ? "outline" : "secondary"}>
                    {situacao.fechado ? (
                      <Lock className="size-3" aria-hidden />
                    ) : (
                      <LockOpen className="size-3" aria-hidden />
                    )}
                    {format(new Date(`${situacao.ultimoMes}-01T12:00:00Z`), "MMM/yyyy", {
                      locale: ptBR,
                    })}
                    {situacao.fechado ? " fechado" : " reaberto"}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Nenhum mês fechado ainda</Badge>
                )}

                {!situacao.mesPassadoFechado ? (
                  <Badge variant="outline" className="border-warning text-warning">
                    {format(new Date(`${mesPassado}-01T12:00:00Z`), "MMMM", { locale: ptBR })} em
                    aberto
                  </Badge>
                ) : null}

                {situacao.pedidosAbertos > 0 ? (
                  <Badge variant="outline">
                    {situacao.pedidosAbertos} pedido{situacao.pedidosAbertos > 1 ? "s" : ""} de
                    comprovante
                  </Badge>
                ) : null}
              </div>

              {situacao.ultimoMes ? (
                <dl className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Receitas do último fechamento</dt>
                    <dd className="font-mono tabular text-success">
                      {formatarBRL(situacao.receitasCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Despesas</dt>
                    <dd className="font-mono tabular text-destructive">
                      {formatarBRL(situacao.despesasCents)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              <Button asChild size="sm" className="w-fit">
                <Link href={`/contador/${situacao.vinculo.empresa.id}`}>
                  Abrir relatórios
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <LinkDeIndicacao link={`${await enderecoDoSite()}/cadastro?indicacao=${usuario.id}`} />

      <div className="rounded-xl border border-border p-6">
        <DuasEtapas
          fuso="America/Sao_Paulo"
          fatores={(await listarFatores()).dados ?? []}
        />
      </div>
    </div>
  );
}
