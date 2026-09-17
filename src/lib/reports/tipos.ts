/**
 * Um relatório é sempre uma tabela com totais e avisos. PDF, Excel e CSV saem
 * todos desta mesma forma, então os três nunca discordam entre si.
 */
export type TipoDeColuna = "texto" | "dinheiro" | "data" | "numero";

export type Coluna = { chave: string; rotulo: string; tipo: TipoDeColuna; alinhamento?: "direita" };

export type Celula = string | number | null;

export type Linha = Record<string, Celula>;

export type Tabela = {
  titulo: string;
  subtitulo?: string;
  colunas: Coluna[];
  linhas: Linha[];
  /** Somas por coluna, para o rodapé da tabela. */
  totais?: Record<string, number>;
  /** Blocos de resumo mostrados antes da tabela (DRE, por exemplo). */
  resumo?: { rotulo: string; valorCents: number; destaque?: boolean; negativo?: boolean }[];
  avisos?: string[];
};

/** Lançamento como os relatórios precisam dele: já com categoria, conta e pagador. */
export type LancamentoParaRelatorio = {
  id: string;
  tipo: "receita" | "despesa";
  situacao: "pendente" | "pago" | "cancelado";
  descricao: string;
  valorCents: number;
  competencia: string;
  pagoEm: string | null;
  vencimento: string | null;
  categoria: string | null;
  grupo: "operacional" | "imposto" | "financeiro" | "retirada" | null;
  dedutivelSugerido: boolean;
  codigoDaCategoria: string | null;
  conta: string | null;
  codigoDaConta: string | null;
  formaDePagamento: string | null;
  pagador: "pf" | "pj" | null;
  cliente: string | null;
  documentoDoCliente: string | null;
  tipoDeReceita: "servico" | "revenda" | "industrializado";
  notaFiscalEmitida: boolean;
  reciboSaudeEmitido: boolean;
  comprovante: string | null;
};

export const ROTULO_DO_GRUPO: Record<string, string> = {
  operacional: "Operacional",
  imposto: "Impostos",
  financeiro: "Financeiro",
  retirada: "Retirada do dono",
};
