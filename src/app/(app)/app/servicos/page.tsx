import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GestaoDeServicos, type ProfissionalDaTabela, type ServicoDaTabela } from "./gestao";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Serviços — Alicerce" };

export default async function PaginaServicos() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const supabase = await createClient();
  const [{ data: servicos }, { data: profissionais }, { data: expediente }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_min, buffer_min, price_cents, bookable_online, active")
      .eq("organization_id", vinculo.empresa.id)
      .order("name"),
    supabase
      .from("professionals")
      .select("id, name, color, active")
      .eq("organization_id", vinculo.empresa.id)
      .order("name"),
    supabase
      .from("working_hours")
      .select("professional_id, weekday, start_time, end_time")
      .eq("organization_id", vinculo.empresa.id),
  ]);

  const lista: ServicoDaTabela[] = (servicos ?? []).map((servico) => ({
    id: servico.id,
    nome: servico.name,
    duracao: servico.duration_min,
    buffer: servico.buffer_min,
    preco: servico.price_cents,
    online: servico.bookable_online,
    ativo: servico.active,
  }));

  const equipe: ProfissionalDaTabela[] = (profissionais ?? []).map((profissional) => ({
    id: profissional.id,
    nome: profissional.name,
    cor: profissional.color,
    ativo: profissional.active,
    faixas: (expediente ?? [])
      .filter((faixa) => faixa.professional_id === profissional.id)
      .map((faixa) => ({
        dia: faixa.weekday,
        inicio: faixa.start_time.slice(0, 5),
        fim: faixa.end_time.slice(0, 5),
      })),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Serviços e equipe</h1>
        <p className="text-sm text-muted-foreground">
          O que você oferece, por quanto, quem atende e em quais horários.
        </p>
      </div>

      <GestaoDeServicos servicos={lista} profissionais={equipe} />
    </div>
  );
}
