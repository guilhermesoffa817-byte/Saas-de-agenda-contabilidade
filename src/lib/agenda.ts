import type { Enums } from "@/lib/supabase/database.types";

export type StatusAtendimento = Enums<"appointment_status">;

export type AtendimentoNaAgenda = {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAtendimento;
  precoCents: number;
  origem: string;
  confirmadoEm: string | null;
  lembreteEnviadoEm: string | null;
  profissionalId: string;
  cliente: { id: string; nome: string; telefone: string | null; faltas: number };
  servico: { id: string; nome: string; duracaoMin: number };
};

export type BloqueioNaAgenda = {
  id: string;
  profissionalId: string;
  inicio: string;
  fim: string;
  motivo: string | null;
};

export type ProfissionalDaAgenda = { id: string; nome: string; cor: string };

/** O que a agenda precisa saber do financeiro para registrar o pagamento na hora. */
export type ContextoFinanceiro = {
  contas: { id: string; nome: string }[];
  chavePix: string | null;
  cidade: string | null;
};

export type ServicoDaAgenda = {
  id: string;
  nome: string;
  duracaoMin: number;
  bufferMin: number;
  precoCents: number;
};

export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

/** Cor com significado: verde é atendimento de pé, terracota é problema. */
export const CLASSES_STATUS: Record<StatusAtendimento, string> = {
  agendado: "border-border bg-secondary text-secondary-foreground",
  confirmado: "border-primary/40 bg-primary/10 text-foreground",
  concluido: "border-primary bg-primary text-primary-foreground",
  faltou: "border-destructive/50 bg-destructive/10 text-destructive",
  cancelado: "border-border bg-muted text-muted-foreground line-through",
};

export const PIXELS_POR_MINUTO = 1;
export const PASSO_MINUTOS = 15;

/** Minutos desde a meia-noite, no fuso da empresa. */
export function minutosDoDia(instante: string, fuso: string) {
  const formatador = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [hora, minuto] = formatador.format(new Date(instante)).split(":").map(Number);
  return hora * 60 + minuto;
}

export function minutosParaHora(minutos: number) {
  const hora = Math.floor(minutos / 60) % 24;
  const minuto = minutos % 60;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/**
 * Faixa de horas que a grade mostra: o expediente do dia, esticado quando existe
 * atendimento fora dele. Sempre em horas cheias, para a régua ficar legível.
 */
export function faixaDaGrade(params: {
  expediente: { inicio: number; fim: number }[];
  atendimentos: { inicioMin: number; fimMin: number }[];
  bloqueios: { inicioMin: number; fimMin: number }[];
}) {
  const inicios = [
    ...params.expediente.map((faixa) => faixa.inicio),
    ...params.atendimentos.map((item) => item.inicioMin),
    ...params.bloqueios.map((item) => item.inicioMin),
  ];
  const fins = [
    ...params.expediente.map((faixa) => faixa.fim),
    ...params.atendimentos.map((item) => item.fimMin),
    ...params.bloqueios.map((item) => item.fimMin),
  ];

  const inicio = inicios.length ? Math.min(...inicios) : 8 * 60;
  const fim = fins.length ? Math.max(...fins) : 18 * 60;

  return {
    inicio: Math.max(0, Math.floor(inicio / 60) * 60),
    fim: Math.min(24 * 60, Math.ceil(fim / 60) * 60),
  };
}
