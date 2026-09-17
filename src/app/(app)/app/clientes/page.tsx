import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TabelaDeClientes, type ClienteDaTabela } from "./tabela";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";
import { normalizarTelefone } from "@/lib/telefone";

export const metadata: Metadata = { title: "Clientes — Alicerce" };

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");

  const { q } = await searchParams;
  const busca = q?.trim() ?? "";
  const supabase = await createClient();

  let consulta = supabase
    .from("clients")
    .select(
      "id, name, phone_e164, email, document, payer_type, whatsapp_opt_in, notes, no_show_count, created_at",
    )
    .eq("organization_id", vinculo.empresa.id)
    .is("deleted_at", null)
    .order("name")
    .limit(200);

  if (busca) {
    const telefone = normalizarTelefone(busca);
    consulta = telefone
      ? consulta.or(`name.ilike.%${busca}%,phone_e164.eq.${telefone}`)
      : consulta.ilike("name", `%${busca}%`);
  }

  const { data } = await consulta;

  const clientes: ClienteDaTabela[] = (data ?? []).map((cliente) => ({
    id: cliente.id,
    nome: cliente.name,
    telefone: cliente.phone_e164,
    email: cliente.email,
    documento: cliente.document,
    tipoPagador: cliente.payer_type === "pj" ? "pj" : "pf",
    aceitaWhatsApp: cliente.whatsapp_opt_in,
    anotacoes: cliente.notes,
    faltas: cliente.no_show_count,
    criadoEm: cliente.created_at,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Quem já passou por aqui, com histórico de faltas e autorização de lembretes.
        </p>
      </div>

      <TabelaDeClientes clientes={clientes} fuso={vinculo.empresa.timezone} busca={busca} />
    </div>
  );
}
