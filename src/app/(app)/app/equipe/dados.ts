import "server-only";

import type {
  AusenciaDaTela,
  BaseDoMes,
  ColaboradorDaTela,
  PagamentoDaTela,
  ProfissionalDaAgenda,
} from "@/components/app/equipe/tipos";
import { limitesDoMes } from "@/lib/equipe";
import { createClient } from "@/lib/supabase/server";

/** Todo o cadastro da equipe (inclusive desligados e ex-colaboradores), sem dados pessoais. */
export async function carregarColaboradores(empresaId: string): Promise<ColaboradorDaTela[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select(
      "id, name, job_title, contract, started_on, ended_on, professional_id, base_pay_cents, commission_bps, per_service_cents, anonymized_at",
    )
    .eq("organization_id", empresaId)
    .order("name");

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.name,
    cargo: linha.job_title,
    contrato: linha.contract,
    inicio: linha.started_on,
    fim: linha.ended_on,
    profissionalId: linha.professional_id,
    fixoCents: linha.base_pay_cents,
    percentualBps: linha.commission_bps,
    porAtendimentoCents: linha.per_service_cents,
    removido: linha.anonymized_at !== null,
  }));
}

export async function carregarProfissionais(empresaId: string): Promise<ProfissionalDaAgenda[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("professionals")
    .select("id, name, active")
    .eq("organization_id", empresaId)
    .order("name");
  return (data ?? []).map((p) => ({ id: p.id, nome: p.name, ativo: p.active }));
}

/** Ausências que tocam algum dia do mês "aaaa-mm". */
export async function carregarAusenciasDoMes(
  empresaId: string,
  mes: string,
): Promise<AusenciaDaTela[]> {
  const { de, ate } = limitesDoMes(mes);
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_absences")
    .select("id, staff_id, kind, starts_on, ends_on, time_off_id")
    .eq("organization_id", empresaId)
    .lte("starts_on", ate)
    .gte("ends_on", de)
    .order("starts_on");

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.staff_id,
    tipo: linha.kind,
    inicio: linha.starts_on,
    fim: linha.ends_on,
    bloqueouAgenda: linha.time_off_id !== null,
  }));
}

/** Pagamentos cujo mês de referência é "aaaa-mm". */
export async function carregarPagamentosDoMes(
  empresaId: string,
  mes: string,
): Promise<PagamentoDaTela[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_payments")
    .select("id, staff_id, kind, amount_cents, paid_on, reference_month")
    .eq("organization_id", empresaId)
    .eq("reference_month", `${mes}-01`)
    .order("paid_on")
    .order("created_at");

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.staff_id,
    tipo: linha.kind,
    valorCents: linha.amount_cents,
    pagoEm: linha.paid_on,
  }));
}

/**
 * Base da comissão (o que entrou de fato pelos atendimentos do profissional
 * ligado, via public.base_de_comissao) e, para quem tem valor por atendimento,
 * quantos atendimentos foram recebidos no mês.
 */
export async function basesDoMes(
  empresaId: string,
  colaboradores: ColaboradorDaTela[],
  mes: string,
): Promise<Record<string, BaseDoMes>> {
  const { de, ate } = limitesDoMes(mes);
  const supabase = await createClient();

  const entradas = await Promise.all(
    colaboradores.map(async (colaborador): Promise<[string, BaseDoMes]> => {
      if (!colaborador.profissionalId) {
        return [colaborador.id, { baseCents: 0, atendimentos: null }];
      }

      const [base, atendimentos] = await Promise.all([
        colaborador.percentualBps > 0
          ? supabase.rpc("base_de_comissao", { p_staff: colaborador.id, p_mes: `${mes}-01` })
          : Promise.resolve({ data: 0 }),
        colaborador.porAtendimentoCents > 0
          ? supabase
              .from("transactions")
              .select("appointment_id, appointments!inner(professional_id)")
              .eq("organization_id", empresaId)
              .eq("kind", "receita")
              .eq("status", "pago")
              .not("appointment_id", "is", null)
              .gte("paid_at", de)
              .lte("paid_at", ate)
              .eq("appointments.professional_id", colaborador.profissionalId)
          : Promise.resolve({ data: null }),
      ]);

      const quantidade = atendimentos.data
        ? new Set(atendimentos.data.map((linha) => linha.appointment_id)).size
        : null;
      return [colaborador.id, { baseCents: Number(base.data ?? 0), atendimentos: quantidade }];
    }),
  );

  return Object.fromEntries(entradas);
}
