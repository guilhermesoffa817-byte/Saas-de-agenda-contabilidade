import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  carregarAtendimentos,
  carregarBloqueios,
  carregarExpediente,
  carregarProfissionais,
  carregarServicos,
} from "./dados";
import { PainelDaAgenda } from "@/components/app/agenda/painel-agenda";
import type { Visao } from "@/components/app/agenda/barra";
import { formatarDiaLongo, formatarMesAno, hojeNaEmpresa, instanteNaEmpresa } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Agenda — Alicerce" };

const VISOES: Visao[] = ["dia", "semana", "lista"];

/** Segunda-feira da semana do dia escolhido (a semana brasileira começa no domingo). */
function inicioDaSemana(dia: string) {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - data.getUTCDay());
  return data.toISOString().slice(0, 10);
}

export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; visao?: string; profissional?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");

  const empresa = vinculo.empresa;
  const parametros = await searchParams;

  const visao: Visao = VISOES.includes(parametros.visao as Visao)
    ? (parametros.visao as Visao)
    : "dia";
  const diaValido = parametros.dia && /^\d{4}-\d{2}-\d{2}$/.test(parametros.dia);
  const dia = diaValido ? parametros.dia! : hojeNaEmpresa(empresa.timezone);
  const profissionalId = parametros.profissional;

  const diaInicial = visao === "dia" ? dia : visao === "semana" ? inicioDaSemana(dia) : dia;
  const quantidadeDeDias = visao === "dia" ? 1 : visao === "semana" ? 7 : 30;

  const supabase = await createClient();

  const [profissionais, servicos, atendimentos, bloqueios, expediente, { data: clientes }] =
    await Promise.all([
      carregarProfissionais(empresa.id),
      carregarServicos(empresa.id),
      carregarAtendimentos({
        empresaId: empresa.id,
        fuso: empresa.timezone,
        diaInicial,
        dias: quantidadeDeDias,
        profissionalId,
      }),
      carregarBloqueios({
        empresaId: empresa.id,
        fuso: empresa.timezone,
        diaInicial,
        dias: quantidadeDeDias,
      }),
      carregarExpediente(empresa.id),
      supabase
        .from("clients")
        .select("id, name, phone_e164")
        .eq("organization_id", empresa.id)
        .is("deleted_at", null)
        .order("name")
        .limit(300),
    ]);

  const titulo =
    visao === "dia"
      ? formatarDiaLongo(instanteNaEmpresa(dia, "12:00", empresa.timezone), empresa.timezone)
      : visao === "semana"
        ? `Semana de ${diaInicial.slice(8, 10)}/${diaInicial.slice(5, 7)}`
        : `Próximos 30 dias · ${formatarMesAno(instanteNaEmpresa(dia, "12:00", empresa.timezone), empresa.timezone)}`;

  return (
    <PainelDaAgenda
      dia={visao === "semana" ? diaInicial : dia}
      visao={visao}
      titulo={titulo}
      fuso={empresa.timezone}
      nomeDaEmpresa={empresa.name}
      profissionalId={profissionalId}
      profissionais={profissionais}
      servicos={servicos}
      clientes={(clientes ?? []).map((cliente) => ({
        id: cliente.id,
        nome: cliente.name,
        telefone: cliente.phone_e164,
      }))}
      atendimentos={atendimentos}
      bloqueios={bloqueios}
      expediente={expediente}
    />
  );
}
