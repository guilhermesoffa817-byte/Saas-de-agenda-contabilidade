import "server-only";

import type {
  AusenciaDaTela,
  BaseDoMes,
  ColaboradorDaTela,
  PagamentoDaTela,
  ProfissionalDaAgenda,
} from "@/components/app/equipe/tipos";
import { limitesDoMes, type TipoDePagamento } from "@/lib/equipe";
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
  return carregarAusenciasNoPeriodo(empresaId, de, ate);
}

/** Ausências que tocam algum dia entre `de` e `ate` (aaaa-mm-dd). */
async function carregarAusenciasNoPeriodo(
  empresaId: string,
  de: string,
  ate: string,
): Promise<AusenciaDaTela[]> {
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

/**
 * Quais destes lançamentos são pagamentos da equipe, com o mês de referência
 * ("aaaa-mm"). O Financeiro não oferece "Editar" neles: valor, tipo e datas
 * mudam pela Equipe (o banco recusa o resto, 0015). Quem não lê staff_payments
 * (recepção) recebe o mapa vazio.
 */
export async function pagamentosDaEquipeNosLancamentos(
  empresaId: string,
  lancamentoIds: string[],
): Promise<Map<string, string>> {
  if (!lancamentoIds.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_payments")
    .select("transaction_id, reference_month")
    .eq("organization_id", empresaId)
    .in("transaction_id", lancamentoIds);
  return new Map((data ?? []).map((linha) => [linha.transaction_id, linha.reference_month.slice(0, 7)]));
}

// ---------------------------------------------------------------------------
// Portal do contador: o necessário para a folha, só leitura.
// ---------------------------------------------------------------------------

export type PagamentoParaOContador = {
  id: string;
  colaboradorId: string;
  tipo: TipoDePagamento;
  /** "aaaa-mm" */
  mesDeReferencia: string;
  valorCents: number;
  pagoEm: string;
};

export type EquipeParaOContador = {
  colaboradores: ColaboradorDaTela[];
  ausencias: AusenciaDaTela[];
  pagamentos: PagamentoParaOContador[];
};

/**
 * O que o contador vê da equipe do cliente no período: cadastro (nome, cargo,
 * vínculo, datas, combinado), ausências e pagamentos com referência nos meses
 * do período. Nunca toca em staff_private (CPF, Pix, telefone, e-mail,
 * observações), que a RLS nem libera ao contador.
 */
export async function carregarEquipeParaOContador(
  empresaId: string,
  de: string,
  ate: string,
): Promise<EquipeParaOContador> {
  const supabase = await createClient();
  const [todos, ausencias, { data: pagamentos }] = await Promise.all([
    carregarColaboradores(empresaId),
    carregarAusenciasNoPeriodo(empresaId, de, ate),
    supabase
      .from("staff_payments")
      .select("id, staff_id, kind, amount_cents, paid_on, reference_month")
      .eq("organization_id", empresaId)
      .gte("reference_month", `${de.slice(0, 7)}-01`)
      .lte("reference_month", `${ate.slice(0, 7)}-01`)
      .order("reference_month")
      .order("paid_on"),
  ]);

  const comRegistro = new Set([
    ...ausencias.map((a) => a.colaboradorId),
    ...(pagamentos ?? []).map((p) => p.staff_id),
  ]);
  const noPeriodo = (c: ColaboradorDaTela) => c.inicio <= ate && (c.fim === null || c.fim >= de);

  return {
    colaboradores: todos.filter(
      (c) => comRegistro.has(c.id) || (!c.removido && noPeriodo(c)),
    ),
    ausencias,
    pagamentos: (pagamentos ?? []).map((linha) => ({
      id: linha.id,
      colaboradorId: linha.staff_id,
      tipo: linha.kind,
      mesDeReferencia: linha.reference_month.slice(0, 7),
      valorCents: linha.amount_cents,
      pagoEm: linha.paid_on,
    })),
  };
}
