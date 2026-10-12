import "server-only";

import { addDays } from "date-fns";

import { DIAS_SEMANA, naEmpresa } from "@/lib/dates";

import {
  AVISO_CORTADO,
  buscarTodas,
  dataParaDia,
  diaParaData,
  esquemaPeriodo,
  ferramenta,
  instantesDoPeriodo,
  percentual,
  primeirosNomes,
  type Periodo,
} from "./base";
import { minutosEntre } from "./servicos";

type Status = "agendado" | "confirmado" | "concluido" | "faltou" | "cancelado";

export type AtendimentoDaAgenda = {
  profissionalId: string;
  status: Status;
  inicio: string; // ISO
  fim: string; // ISO
};

export type Jornada = {
  profissionalId: string;
  diaDaSemana: number; // 0 = domingo
  inicio: string; // "09:00" ou "09:00:00"
  fim: string;
};

const ROTULO_STATUS: Record<Status, string> = {
  agendado: "Agendados (ainda sem confirmação)",
  confirmado: "Confirmados (ainda não atendidos)",
  concluido: "Concluídos",
  faltou: "Faltas",
  cancelado: "Cancelados",
};

const FAIXAS = [
  { rotulo: "Manhã (antes das 12h)", ate: 12 },
  { rotulo: "Tarde (12h às 18h)", ate: 18 },
  { rotulo: "Noite (a partir das 18h)", ate: 24 },
];

const minutosDoDia = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Quantas vezes cada dia da semana aparece no período. */
export function diasDaSemanaNoPeriodo(periodo: Periodo) {
  const contagem = Array(7).fill(0) as number[];
  for (let d = diaParaData(periodo.inicio); dataParaDia(d) <= periodo.fim; d = addDays(d, 1)) {
    contagem[d.getUTCDay()] += 1;
  }
  return contagem;
}

/** A agenda "ocupa" o horário em tudo que não foi cancelado (a falta também ocupou). */
const ocupa = (s: Status) => s !== "cancelado";

export function analisarAgenda(params: {
  atendimentos: AtendimentoDaAgenda[];
  jornadas: Jornada[];
  profissionais: { id: string; name: string; active: boolean }[];
  periodo: Periodo;
  fuso: string;
}) {
  const { atendimentos, jornadas, periodo, fuso } = params;
  const nomes = primeirosNomes(params.profissionais);
  const ocorrencias = diasDaSemanaNoPeriodo(periodo);

  const porStatus = new Map<Status, number>();
  for (const a of atendimentos) porStatus.set(a.status, (porStatus.get(a.status) ?? 0) + 1);
  const total = atendimentos.length;
  const concluidos = porStatus.get("concluido") ?? 0;
  const faltas = porStatus.get("faltou") ?? 0;
  const cancelados = porStatus.get("cancelado") ?? 0;

  // Minutos de jornada cadastrada por dia da semana (por profissional ativo).
  const ativos = new Set(params.profissionais.filter((p) => p.active).map((p) => p.id));
  const jornadaDia = Array(7).fill(0) as number[];
  const jornadaProf = new Map<string, number>();
  for (const j of jornadas) {
    if (!ativos.has(j.profissionalId)) continue;
    const minutos = Math.max(0, minutosDoDia(j.fim) - minutosDoDia(j.inicio)) * ocorrencias[j.diaDaSemana];
    jornadaDia[j.diaDaSemana] += minutos;
    jornadaProf.set(j.profissionalId, (jornadaProf.get(j.profissionalId) ?? 0) + minutos);
  }

  const dias = DIAS_SEMANA.map((d) => ({ nome: d.nome, atendimentos: 0, faltas: 0, cancelados: 0, minutos: 0 }));
  const faixas = FAIXAS.map((f) => ({ faixa: f.rotulo, atendimentos: 0 }));
  type Prof = { atendimentos: number; concluidos: number; faltas: number; cancelados: number; minutos: number };
  const profs = new Map<string, Prof>();

  for (const a of atendimentos) {
    const local = naEmpresa(a.inicio, fuso);
    const dia = dias[local.getDay()];
    const prof = profs.get(a.profissionalId) ?? { atendimentos: 0, concluidos: 0, faltas: 0, cancelados: 0, minutos: 0 };
    if (a.status === "cancelado") {
      dia.cancelados += 1;
      prof.cancelados += 1;
    } else {
      const minutos = minutosEntre(a.inicio, a.fim);
      dia.atendimentos += 1;
      dia.minutos += minutos;
      prof.atendimentos += 1;
      prof.minutos += minutos;
      const faixa = FAIXAS.findIndex((f) => local.getHours() < f.ate);
      faixas[faixa].atendimentos += 1;
    }
    if (a.status === "faltou") {
      dia.faltas += 1;
      prof.faltas += 1;
    }
    if (a.status === "concluido") prof.concluidos += 1;
    profs.set(a.profissionalId, prof);
  }

  const horas = (minutos: number) => Math.round(minutos / 6) / 10; // uma casa

  return {
    periodo,
    base: "Atendimentos com início no período, no fuso da empresa. Ocupação = horas marcadas (sem cancelados) sobre as horas de atendimento cadastradas; ausências e bloqueios não são descontados.",
    total_de_atendimentos: total,
    por_situacao: (Object.keys(ROTULO_STATUS) as Status[]).map((s) => ({
      situacao: ROTULO_STATUS[s],
      quantidade: porStatus.get(s) ?? 0,
    })),
    taxa_de_faltas: percentual(faltas, concluidos + faltas),
    taxa_de_cancelamento: percentual(cancelados, total),
    por_dia_da_semana: dias.map((d, i) => ({
      dia: d.nome,
      vezes_no_periodo: ocorrencias[i],
      atendimentos: d.atendimentos,
      faltas: d.faltas,
      cancelados: d.cancelados,
      horas_marcadas: horas(d.minutos),
      horas_de_atendimento_cadastradas: horas(jornadaDia[i]),
      ocupacao: percentual(d.minutos, jornadaDia[i]),
    })),
    por_faixa_de_horario: faixas,
    por_profissional: [...profs.entries()]
      .map(([id, p]) => ({
        profissional: nomes.get(id) ?? "Profissional",
        atendimentos: p.atendimentos,
        concluidos: p.concluidos,
        faltas: p.faltas,
        cancelados: p.cancelados,
        horas_marcadas: horas(p.minutos),
        ocupacao: percentual(p.minutos, jornadaProf.get(id) ?? 0),
      }))
      .sort((a, b) => b.atendimentos - a.atendimentos),
  };
}

type LinhaDoBanco = { professional_id: string; status: Status; starts_at: string; ends_at: string };

export const agendaEOcupacao = ferramenta({
  nome: "agenda_e_ocupacao",
  descricao:
    "Agenda do período: atendimentos por situação, taxa de faltas e de cancelamentos, distribuição por dia da semana e por faixa de horário (no fuso da empresa), ocupação sobre as horas de atendimento cadastradas e números por profissional (só o primeiro nome). Use para perguntas sobre dias e horários vazios, faltas e ocupação.",
  status: "Olhando a agenda…",
  esquema: esquemaPeriodo,
  async executar(periodo, ctx) {
    const { de, ate } = instantesDoPeriodo(periodo, ctx.empresa.timezone);
    const [atendimentos, jornadas, profissionais] = await Promise.all([
      buscarTodas<LinhaDoBanco>((inicio, fim) =>
        ctx.supabase
          .from("appointments")
          .select("professional_id, status, starts_at, ends_at")
          .eq("organization_id", ctx.empresa.id)
          .gte("starts_at", de)
          .lt("starts_at", ate)
          .order("id")
          .range(inicio, fim),
      ),
      ctx.supabase
        .from("working_hours")
        .select("professional_id, weekday, start_time, end_time")
        .eq("organization_id", ctx.empresa.id),
      ctx.supabase.from("professionals").select("id, name, active").eq("organization_id", ctx.empresa.id),
    ]);
    if (jornadas.error) throw new Error(jornadas.error.message);
    if (profissionais.error) throw new Error(profissionais.error.message);

    const resultado = analisarAgenda({
      atendimentos: atendimentos.linhas.map((a) => ({
        profissionalId: a.professional_id,
        status: a.status,
        inicio: a.starts_at,
        fim: a.ends_at,
      })),
      jornadas: (jornadas.data ?? []).map((j) => ({
        profissionalId: j.professional_id,
        diaDaSemana: j.weekday,
        inicio: j.start_time,
        fim: j.end_time,
      })),
      profissionais: profissionais.data ?? [],
      periodo,
      fuso: ctx.empresa.timezone,
    });
    return atendimentos.cortado ? { ...resultado, aviso: AVISO_CORTADO } : resultado;
  },
});
