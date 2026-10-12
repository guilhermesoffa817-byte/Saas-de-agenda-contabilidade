import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { carregarContas } from "../dados";
import { GestaoDeCategorias } from "@/components/app/financeiro/gestao-categorias";
import { Button } from "@/components/ui/button";
import { eNatureza } from "@/lib/custos/calculo";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

/** Como `carregarCategorias`, mais o comportamento do custo. */
async function categoriasComComportamento(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, report_group, deductible_hint, accounting_code, cost_behavior")
    .eq("organization_id", empresaId)
    .order("kind")
    .order("name");
  return data ?? [];
}

export const metadata: Metadata = { title: "Categorias e contas — Bossa" };

export default async function PaginaCategorias() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const [categorias, contas] = await Promise.all([
    categoriasComComportamento(vinculo.empresa.id),
    carregarContas(vinculo.empresa.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Categorias e contas</h1>
          <p className="text-sm text-muted-foreground">
            Organizam seus relatórios e a exportação para o contador.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/financeiro">
            <ArrowLeft aria-hidden />
            Voltar ao painel
          </Link>
        </Button>
      </div>

      <GestaoDeCategorias
        categorias={categorias.map((categoria) => ({
          id: categoria.id,
          nome: categoria.name,
          tipo: categoria.kind,
          grupo: categoria.report_group as "operacional",
          dedutivel: categoria.deductible_hint,
          codigoContabil: categoria.accounting_code,
          comportamento: eNatureza(categoria.cost_behavior) ? categoria.cost_behavior : null,
        }))}
        contas={contas.map((conta) => ({
          id: conta.id,
          nome: conta.name,
          tipo: conta.type as "banco",
          codigoContabil: conta.accounting_code,
          ativa: conta.active,
        }))}
      />
    </div>
  );
}
