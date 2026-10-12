import { z } from "zod";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaFormaDePagamento = z.enum([
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "transferencia",
  "outro",
]);

export const esquemaLancamento = z
  .object({
    lancamentoId: z.uuid().optional(),
    tipo: z.enum(["receita", "despesa"]),
    descricao: z.string().trim().min(2, "Descreva o lançamento.").max(120),
    valor: z.number().int().positive("O valor precisa ser maior que zero."),
    pago: z.boolean(),
    dataPagamento: z.string().regex(DIA, "Escolha a data do pagamento.").optional().or(z.literal("")),
    dataVencimento: z.string().regex(DIA, "Data inválida.").optional().or(z.literal("")),
    competencia: z.string().regex(DIA, "Escolha o mês de competência."),
    formaDePagamento: esquemaFormaDePagamento.optional(),
    categoriaId: z.uuid().optional().or(z.literal("")),
    contaId: z.uuid().optional().or(z.literal("")),
    clienteId: z.uuid().optional().or(z.literal("")),
    comprovante: z.string().trim().max(400).optional().or(z.literal("")),
    repetirMeses: z.number().int().min(1).max(24).default(1),
  })
  .refine((dados) => !dados.pago || Boolean(dados.dataPagamento), {
    message: "Lançamento pago precisa da data do pagamento.",
    path: ["dataPagamento"],
  })
  .refine((dados) => dados.pago || Boolean(dados.dataVencimento), {
    message: "Lançamento a pagar ou a receber precisa da data de vencimento.",
    path: ["dataVencimento"],
  });

export const esquemaBaixa = z.object({
  lancamentoId: z.uuid(),
  dataPagamento: z.string().regex(DIA, "Escolha a data do pagamento."),
  formaDePagamento: esquemaFormaDePagamento,
  contaId: z.uuid().optional().or(z.literal("")),
});

export const esquemaConclusaoComPagamento = z.object({
  atendimentoId: z.uuid(),
  valor: z.number().int().positive("O valor precisa ser maior que zero."),
  formaDePagamento: esquemaFormaDePagamento,
  contaId: z.uuid().optional().or(z.literal("")),
});

export const esquemaCategoria = z.object({
  categoriaId: z.uuid().optional(),
  nome: z.string().trim().min(2, "Digite o nome da categoria.").max(60),
  tipo: z.enum(["receita", "despesa"]),
  grupo: z.enum(["operacional", "imposto", "financeiro", "retirada"]),
  sugestaoDedutivel: z.boolean(),
  codigoContabil: z.string().trim().max(30).optional().or(z.literal("")),
  /**
   * Comportamento do custo (custos operacionais). Só vai junto quando o dono
   * mexeu no seletor: ausente, a categoria mantém o que tinha (e a origem dela).
   */
  comportamento: z.enum(["fixo", "variavel", "nao_operacional", "sem"]).optional(),
});

/**
 * As colunas `cost_behavior` e `cost_behavior_source` que acompanham o save da
 * categoria. Entrada e retirada do dono nunca têm comportamento de custo.
 */
export function colunasDoComportamento(dados: Pick<CategoriaInput, "tipo" | "grupo" | "comportamento">):
  | { cost_behavior: null }
  | { cost_behavior: "fixo" | "variavel" | "nao_operacional" | null; cost_behavior_source: "dono" }
  | Record<string, never> {
  if (dados.tipo === "receita" || dados.grupo === "retirada") return { cost_behavior: null };
  if (dados.comportamento === undefined) return {};
  return {
    cost_behavior: dados.comportamento === "sem" ? null : dados.comportamento,
    cost_behavior_source: "dono",
  };
}

export const ROTULO_COMPORTAMENTO_DO_CUSTO: Record<"fixo" | "variavel" | "nao_operacional" | "sem", string> = {
  fixo: "Custo fixo",
  variavel: "Custo variável",
  nao_operacional: "Fora da operação",
  sem: "Sem classificação",
};

export const AJUDA_COMPORTAMENTO_DO_CUSTO: Record<"fixo" | "variavel" | "nao_operacional" | "sem", string> = {
  fixo: "Você paga mesmo num mês sem nenhum atendimento.",
  variavel: "Sobe e desce junto com os atendimentos.",
  nao_operacional: "Não tem a ver com atender clientes.",
  sem: "Cada lançamento é classificado um a um, na tela de custos.",
};

export const esquemaConta = z.object({
  contaId: z.uuid().optional(),
  nome: z.string().trim().min(2, "Digite o nome da conta.").max(60),
  tipo: z.enum(["caixa", "banco", "maquininha"]),
  codigoContabil: z.string().trim().max(30).optional().or(z.literal("")),
  ativa: z.boolean(),
});

export type LancamentoInput = z.infer<typeof esquemaLancamento>;
export type BaixaInput = z.infer<typeof esquemaBaixa>;
export type ConclusaoComPagamentoInput = z.infer<typeof esquemaConclusaoComPagamento>;
export type CategoriaInput = z.infer<typeof esquemaCategoria>;
export type ContaInput = z.infer<typeof esquemaConta>;

export const ROTULO_FORMA_DE_PAGAMENTO: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

export const ROTULO_GRUPO: Record<string, string> = {
  operacional: "Operacional",
  imposto: "Imposto",
  financeiro: "Financeiro",
  retirada: "Retirada do dono",
};
