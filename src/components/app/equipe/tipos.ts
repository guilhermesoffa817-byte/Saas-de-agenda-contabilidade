import type { Contrato, TipoDeAusencia, TipoDePagamento } from "@/lib/equipe";

/** Cadastro do colaborador como a tela usa. Dados pessoais (CPF, Pix…) não vêm aqui. */
export type ColaboradorDaTela = {
  id: string;
  nome: string;
  cargo: string | null;
  contrato: Contrato;
  inicio: string;
  fim: string | null;
  profissionalId: string | null;
  fixoCents: number;
  percentualBps: number;
  porAtendimentoCents: number;
  /** Removido com pagamentos no histórico: virou "Ex-colaborador" e não se edita mais. */
  removido: boolean;
};

export type DadosPessoaisDaTela = {
  documento: string;
  pix: string;
  telefone: string;
  email: string;
  observacoes: string;
};

export const DADOS_PESSOAIS_VAZIOS: DadosPessoaisDaTela = {
  documento: "",
  pix: "",
  telefone: "",
  email: "",
  observacoes: "",
};

export type ProfissionalDaAgenda = { id: string; nome: string; ativo: boolean };

export type AusenciaDaTela = {
  id: string;
  colaboradorId: string;
  tipo: TipoDeAusencia;
  inicio: string;
  fim: string;
  bloqueouAgenda: boolean;
};

export type PagamentoDaTela = {
  id: string;
  colaboradorId: string;
  tipo: TipoDePagamento;
  valorCents: number;
  pagoEm: string;
};

export type BaseDoMes = {
  /** O que entrou dos atendimentos do profissional ligado, no mês. */
  baseCents: number;
  /** Atendimentos recebidos no mês; null quando não se aplica. */
  atendimentos: number | null;
};

export type ContaSimples = { id: string; nome: string };
