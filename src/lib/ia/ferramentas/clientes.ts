import "server-only";

import { subDays } from "date-fns";

import { naEmpresa } from "@/lib/dates";

import {
  AVISO_CORTADO,
  brl,
  buscarTodas,
  dataParaDia,
  diaParaData,
  esquemaPeriodo,
  ferramenta,
  instantesDoPeriodo,
  media,
  percentual,
  type Periodo,
} from "./base";
import { recebidoDoAtendimento } from "./servicos";

export const DIAS_PARA_INATIVO = 60;

/** Um atendimento concluído. O id do cliente só serve para contar; nunca sai daqui. */
export type VisitaConcluida = { clienteId: string; dia: string; recebidoCents: number };

/**
 * Só contagens. Nenhum nome, telefone, e-mail, documento, anotação ou
 * histórico individual vai para a IA — em clínica e terapia, o histórico de
 * uma pessoa já é dado de saúde.
 */
export function contarClientes(visitas: VisitaConcluida[], periodo: Periodo, hoje: string) {
  const referencia = periodo.fim < hoje ? periodo.fim : hoje;
  const corteInativo = dataParaDia(subDays(diaParaData(referencia), DIAS_PARA_INATIVO));

  type Cliente = { primeira: string; ultima: string; noPeriodo: number; recebidoNoPeriodo: number; antes: boolean };
  const clientes = new Map<string, Cliente>();
  for (const v of visitas) {
    if (v.dia > periodo.fim) continue;
    const c = clientes.get(v.clienteId) ?? { primeira: v.dia, ultima: v.dia, noPeriodo: 0, recebidoNoPeriodo: 0, antes: false };
    if (v.dia < c.primeira) c.primeira = v.dia;
    if (v.dia > c.ultima) c.ultima = v.dia;
    if (v.dia >= periodo.inicio) {
      c.noPeriodo += 1;
      c.recebidoNoPeriodo += v.recebidoCents;
    } else {
      c.antes = true;
    }
    clientes.set(v.clienteId, c);
  }

  const todos = [...clientes.values()];
  const atendidos = todos.filter((c) => c.noPeriodo > 0);
  const novos = atendidos.filter((c) => !c.antes);
  const voltaram = atendidos.filter((c) => c.antes);
  const visitasNoPeriodo = atendidos.reduce((t, c) => t + c.noPeriodo, 0);
  const recebido = atendidos.reduce((t, c) => t + c.recebidoNoPeriodo, 0);
  const inativos = todos.filter((c) => c.ultima < corteInativo).length;

  return {
    periodo,
    base: "Só contagens de clientes com atendimento concluído; nenhum dado pessoal.",
    clientes_atendidos_no_periodo: atendidos.length,
    clientes_novos: novos.length,
    clientes_que_voltaram: voltaram.length,
    novos_que_voltaram_dentro_do_periodo: novos.filter((c) => c.noPeriodo > 1).length,
    atendimentos_concluidos_no_periodo: visitasNoPeriodo,
    frequencia_media_por_cliente:
      atendidos.length > 0 ? Math.round((visitasNoPeriodo * 10) / atendidos.length) / 10 : null,
    ticket_medio_por_cliente: brl(media(recebido, atendidos.length)),
    receita_recebida_dos_atendimentos: brl(recebido),
    inativos: {
      criterio: `Último atendimento concluído há mais de ${DIAS_PARA_INATIVO} dias (em relação a ${referencia}).`,
      quantidade: inativos,
      participacao_na_base: percentual(inativos, todos.length),
    },
    clientes_com_historico: todos.length,
  };
}

type LinhaDoBanco = {
  client_id: string;
  starts_at: string;
  transactions:
    | { amount_cents: number; kind: string; status: string }
    | { amount_cents: number; kind: string; status: string }[]
    | null;
};

export const clientesEmNumeros = ferramenta({
  nome: "clientes_em_numeros",
  descricao: `Só contagens de clientes no período: atendidos, novos, que voltaram, inativos há mais de ${DIAS_PARA_INATIVO} dias, frequência média e ticket médio por cliente. Nunca traz nome nem contato. Use para perguntas sobre retenção, recorrência e base de clientes.`,
  status: "Contando os clientes…",
  esquema: esquemaPeriodo,
  async executar(periodo, ctx) {
    const { ate } = instantesDoPeriodo(periodo, ctx.empresa.timezone);
    // Todo o histórico até o fim do período: é ele que diz quem é novo e quem sumiu.
    const { linhas, cortado } = await buscarTodas<LinhaDoBanco>((de, fim) =>
      ctx.supabase
        .from("appointments")
        .select("client_id, starts_at, transactions ( amount_cents, kind, status )")
        .eq("organization_id", ctx.empresa.id)
        .eq("status", "concluido")
        .lt("starts_at", ate)
        .order("starts_at", { ascending: false })
        .order("id")
        .range(de, fim)
        .overrideTypes<LinhaDoBanco[], { merge: false }>(),
    );

    const visitas = linhas.map((l) => ({
      clienteId: l.client_id,
      dia: dataParaDia(naEmpresa(l.starts_at, ctx.empresa.timezone)),
      recebidoCents: recebidoDoAtendimento(l.transactions),
    }));
    const resultado = contarClientes(visitas, periodo, ctx.hoje);
    return cortado ? { ...resultado, aviso: AVISO_CORTADO } : resultado;
  },
});
