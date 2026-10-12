import "server-only";

import {
  AVISO_CORTADO,
  brl,
  buscarTodas,
  esquemaPeriodo,
  ferramenta,
  instantesDoPeriodo,
  media,
  percentual,
  type Periodo,
} from "./base";

export type ServicoDoCatalogo = {
  id: string;
  nome: string;
  duracaoMin: number;
  precoCents: number;
  ativo: boolean;
};

export type AtendimentoDoServico = {
  servicoId: string;
  status: "agendado" | "confirmado" | "concluido" | "faltou" | "cancelado";
  minutos: number;
  /** Soma dos recebimentos pagos ligados ao atendimento. */
  recebidoCents: number;
};

export function analisarServicos(
  servicos: ServicoDoCatalogo[],
  atendimentos: AtendimentoDoServico[],
  periodo: Periodo,
) {
  type Soma = { marcados: number; concluidos: number; faltas: number; cancelados: number; minutos: number; recebido: number };
  const somas = new Map<string, Soma>();
  for (const a of atendimentos) {
    const s = somas.get(a.servicoId) ?? { marcados: 0, concluidos: 0, faltas: 0, cancelados: 0, minutos: 0, recebido: 0 };
    s.marcados += 1;
    if (a.status === "concluido") {
      s.concluidos += 1;
      s.minutos += a.minutos;
    }
    if (a.status === "faltou") s.faltas += 1;
    if (a.status === "cancelado") s.cancelados += 1;
    s.recebido += a.recebidoCents;
    somas.set(a.servicoId, s);
  }

  const receitaTotal = [...somas.values()].reduce((t, s) => t + s.recebido, 0);
  const porId = new Map(servicos.map((s) => [s.id, s]));

  const desempenho = [...somas.entries()]
    .map(([id, s]) => {
      const servico = porId.get(id);
      return {
        servico: servico?.nome ?? "Serviço removido",
        atendimentos_concluidos: s.concluidos,
        faltas: s.faltas,
        cancelamentos: s.cancelados,
        receita_recebida: brl(s.recebido),
        participacao_na_receita: percentual(s.recebido, receitaTotal),
        ticket_medio: brl(media(s.recebido, s.concluidos)),
        preco_de_tabela: servico ? brl(servico.precoCents) : null,
        duracao_cadastrada_min: servico?.duracaoMin ?? null,
        duracao_media_na_agenda_min: s.concluidos > 0 ? Math.round(s.minutos / s.concluidos) : null,
        // Quanto cada hora de agenda ocupada por este serviço trouxe de receita.
        receita_por_hora_de_agenda: s.minutos > 0 ? brl(Math.round((s.recebido * 60) / s.minutos)) : null,
      };
    })
    .sort((a, b) => b.receita_recebida.cents - a.receita_recebida.cents);

  const semVenda = servicos
    .filter((s) => s.ativo && !(somas.get(s.id)?.concluidos))
    .map((s) => ({ servico: s.nome, preco_de_tabela: brl(s.precoCents), duracao_min: s.duracaoMin }));

  return {
    periodo,
    base: "Atendimentos com início no período. Receita recebida = recebimentos pagos ligados ao atendimento.",
    receita_recebida_total: brl(receitaTotal),
    atendimentos_concluidos: desempenho.reduce((t, d) => t + d.atendimentos_concluidos, 0),
    por_servico: desempenho,
    servicos_ativos_sem_atendimento_concluido: semVenda,
  };
}

type LinhaDoBanco = {
  service_id: string;
  status: AtendimentoDoServico["status"];
  starts_at: string;
  ends_at: string;
  transactions:
    | { amount_cents: number; kind: string; status: string }
    | { amount_cents: number; kind: string; status: string }[]
    | null;
};

export function recebidoDoAtendimento(transacoes: LinhaDoBanco["transactions"]) {
  const lista = transacoes ? (Array.isArray(transacoes) ? transacoes : [transacoes]) : [];
  return lista
    .filter((t) => t.kind === "receita" && t.status === "pago")
    .reduce((total, t) => total + t.amount_cents, 0);
}

export function minutosEntre(inicio: string, fim: string) {
  return Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000));
}

export const desempenhoDosServicos = ferramenta({
  nome: "desempenho_dos_servicos",
  descricao:
    "Desempenho de cada serviço no período: atendimentos concluídos, faltas, receita recebida, ticket médio, duração e receita por hora de agenda; e os serviços ativos que não tiveram atendimento concluído. Use para perguntas sobre o que mais dá resultado, preço e mix de serviços.",
  status: "Analisando os serviços…",
  esquema: esquemaPeriodo,
  async executar(periodo, ctx) {
    const { de, ate } = instantesDoPeriodo(periodo, ctx.empresa.timezone);
    const [catalogo, atendimentos] = await Promise.all([
      ctx.supabase
        .from("services")
        .select("id, name, duration_min, price_cents, active")
        .eq("organization_id", ctx.empresa.id),
      buscarTodas<LinhaDoBanco>((inicio, fim) =>
        ctx.supabase
          .from("appointments")
          .select("service_id, status, starts_at, ends_at, transactions ( amount_cents, kind, status )")
          .eq("organization_id", ctx.empresa.id)
          .gte("starts_at", de)
          .lt("starts_at", ate)
          .order("id")
          .range(inicio, fim)
          .overrideTypes<LinhaDoBanco[], { merge: false }>(),
      ),
    ]);
    if (catalogo.error) throw new Error(catalogo.error.message);

    const resultado = analisarServicos(
      (catalogo.data ?? []).map((s) => ({
        id: s.id,
        nome: s.name,
        duracaoMin: s.duration_min,
        precoCents: s.price_cents,
        ativo: s.active,
      })),
      atendimentos.linhas.map((a) => ({
        servicoId: a.service_id,
        status: a.status,
        minutos: minutosEntre(a.starts_at, a.ends_at),
        recebidoCents: recebidoDoAtendimento(a.transactions),
      })),
      periodo,
    );
    return atendimentos.cortado ? { ...resultado, aviso: AVISO_CORTADO } : resultado;
  },
});
