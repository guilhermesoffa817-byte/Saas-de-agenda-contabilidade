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
});

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
