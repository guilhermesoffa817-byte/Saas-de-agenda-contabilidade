import "server-only";

import { addDays } from "date-fns";

import { instanteNaEmpresa } from "@/lib/dates";
import type {
  AtendimentoNaAgenda,
  BloqueioNaAgenda,
  ProfissionalDaAgenda,
  ServicoDaAgenda,
} from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";

type ClienteDoBanco = { id: string; name: string; phone_e164: string | null; no_show_count: number };
type ServicoDoBanco = { id: string; name: string; duration_min: number };

/** Início do dia local da empresa, em instante absoluto. */
export function inicioDoDia(dia: string, fuso: string) {
  return new Date(instanteNaEmpresa(dia, "00:00", fuso).getTime());
}

export async function carregarProfissionais(empresaId: string): Promise<ProfissionalDaAgenda[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("professionals")
    .select("id, name, color")
    .eq("organization_id", empresaId)
    .eq("active", true)
    .order("name");

  return (data ?? []).map((item) => ({ id: item.id, nome: item.name, cor: item.color }));
}

export async function carregarServicos(empresaId: string): Promise<ServicoDaAgenda[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_min, buffer_min, price_cents")
    .eq("organization_id", empresaId)
    .eq("active", true)
    .order("name");

  return (data ?? []).map((item) => ({
    id: item.id,
    nome: item.name,
    duracaoMin: item.duration_min,
    bufferMin: item.buffer_min,
    precoCents: item.price_cents,
  }));
}

export async function carregarAtendimentos(params: {
  empresaId: string;
  fuso: string;
  diaInicial: string;
  dias: number;
  profissionalId?: string;
}): Promise<AtendimentoNaAgenda[]> {
  const supabase = await createClient();
  const de = inicioDoDia(params.diaInicial, params.fuso);
  const ate = addDays(de, params.dias);

  let consulta = supabase
    .from("appointments")
    .select(
      `id, starts_at, ends_at, status, price_cents, source, confirmed_at, reminder_sent_at, professional_id,
       clients ( id, name, phone_e164, no_show_count ),
       services ( id, name, duration_min )`,
    )
    .eq("organization_id", params.empresaId)
    .gte("starts_at", de.toISOString())
    .lt("starts_at", ate.toISOString())
    .order("starts_at");

  if (params.profissionalId) consulta = consulta.eq("professional_id", params.profissionalId);

  const { data } = await consulta;

  return (data ?? []).map((item) => {
    const cliente = item.clients as unknown as ClienteDoBanco | null;
    const servico = item.services as unknown as ServicoDoBanco | null;
    return {
      id: item.id,
      inicio: item.starts_at,
      fim: item.ends_at,
      status: item.status,
      precoCents: item.price_cents,
      origem: item.source,
      confirmadoEm: item.confirmed_at,
      lembreteEnviadoEm: item.reminder_sent_at,
      profissionalId: item.professional_id,
      cliente: {
        id: cliente?.id ?? "",
        nome: cliente?.name ?? "Cliente",
        telefone: cliente?.phone_e164 ?? null,
        faltas: cliente?.no_show_count ?? 0,
      },
      servico: {
        id: servico?.id ?? "",
        nome: servico?.name ?? "Atendimento",
        duracaoMin: servico?.duration_min ?? 0,
      },
    };
  });
}

export async function carregarBloqueios(params: {
  empresaId: string;
  fuso: string;
  diaInicial: string;
  dias: number;
}): Promise<BloqueioNaAgenda[]> {
  const supabase = await createClient();
  const de = inicioDoDia(params.diaInicial, params.fuso);
  const ate = addDays(de, params.dias);

  const { data } = await supabase
    .from("time_off")
    .select("id, professional_id, starts_at, ends_at, reason")
    .eq("organization_id", params.empresaId)
    .lt("starts_at", ate.toISOString())
    .gt("ends_at", de.toISOString())
    .order("starts_at");

  return (data ?? []).map((item) => ({
    id: item.id,
    profissionalId: item.professional_id,
    inicio: item.starts_at,
    fim: item.ends_at,
    motivo: item.reason,
  }));
}

/** Expediente cadastrado, por profissional e dia da semana. */
export async function carregarExpediente(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("working_hours")
    .select("professional_id, weekday, start_time, end_time")
    .eq("organization_id", empresaId);

  return (data ?? []).map((item) => ({
    profissionalId: item.professional_id,
    diaSemana: item.weekday,
    inicio: item.start_time.slice(0, 5),
    fim: item.end_time.slice(0, 5),
  }));
}
