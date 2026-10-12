import { z } from "zod";

import { CONTRATOS, TIPOS_DE_AUSENCIA, TIPOS_DE_PAGAMENTO, textoParaBps } from "@/lib/equipe";
import { normalizarTelefone } from "@/lib/telefone";
import { esquemaFormaDePagamento } from "@/lib/validacao/financeiro";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const opcional = <T extends z.ZodType>(esquema: T) => esquema.optional().or(z.literal(""));

export const esquemaContrato = z.enum(CONTRATOS, { message: "Escolha o vínculo." });

/** CPF ou CNPJ, guardado só com os dígitos. Vazio é permitido (o campo é opcional). */
export const esquemaDocumento = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => valor === "" || valor.length === 11 || valor.length === 14, {
    message: "Digite um CPF (11 dígitos) ou CNPJ (14 dígitos).",
  });

/** Percentual digitado ("40", "40,5", "12,25%") convertido em pontos-base inteiros. */
export const esquemaPercentual = z
  .string()
  .transform((texto, contexto) => {
    const bps = textoParaBps(texto);
    if (bps === null) {
      contexto.addIssue({
        code: "custom",
        message: "Digite um percentual de 0 a 100, com até duas casas (ex.: 40 ou 40,5).",
      });
      return z.NEVER;
    }
    return bps;
  });

export const esquemaDadosPessoais = z.object({
  documento: esquemaDocumento.default(""),
  pix: z.string().trim().max(140, "Chave Pix muito longa.").default(""),
  telefone: z
    .string()
    .trim()
    .refine((valor) => valor === "" || normalizarTelefone(valor) !== null, {
      message: "Digite o telefone com DDD, como (11) 98765-4321.",
    })
    .transform((valor) => (valor === "" ? "" : (normalizarTelefone(valor) ?? "")))
    .default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((valor) => valor === "" || z.email().safeParse(valor).success, {
      message: "Digite um e-mail válido.",
    })
    .max(254, "E-mail muito longo.")
    .default(""),
  observacoes: z.string().trim().max(1000, "Use até 1.000 caracteres nas observações.").default(""),
});

export const esquemaColaborador = z
  .object({
    colaboradorId: z.uuid().optional(),
    nome: z.string().trim().min(2, "Digite o nome do colaborador.").max(120, "Nome muito longo."),
    cargo: z.string().trim().max(80, "Use até 80 caracteres no cargo.").default(""),
    contrato: esquemaContrato,
    inicio: z.string().regex(DIA, "Escolha a data de início."),
    fim: opcional(z.string().regex(DIA, "Data de término inválida.")),
    profissionalId: opcional(z.uuid()),
    fixoCents: z.number().int().min(0, "O valor não pode ser negativo.").default(0),
    percentual: esquemaPercentual.default(0),
    porAtendimentoCents: z.number().int().min(0, "O valor não pode ser negativo.").default(0),
    dadosPessoais: esquemaDadosPessoais.default({
      documento: "",
      pix: "",
      telefone: "",
      email: "",
      observacoes: "",
    }),
  })
  .refine((dados) => !dados.fim || dados.fim >= dados.inicio, {
    message: "A data de término não pode ser antes do início.",
    path: ["fim"],
  });

export const esquemaDesligamento = z.object({
  colaboradorId: z.uuid(),
  fim: z.string().regex(DIA, "Escolha o último dia de trabalho."),
});

export const esquemaAusencia = z
  .object({
    colaboradorId: z.uuid({ message: "Escolha o colaborador." }),
    tipo: z.enum(TIPOS_DE_AUSENCIA, { message: "Escolha o tipo." }),
    inicio: z.string().regex(DIA, "Escolha o primeiro dia."),
    fim: z.string().regex(DIA, "Escolha o último dia."),
  })
  .refine((dados) => dados.fim >= dados.inicio, {
    message: "O último dia não pode ser antes do primeiro.",
    path: ["fim"],
  });

export const esquemaPagamentoEquipe = z.object({
  colaboradorId: z.uuid({ message: "Escolha o colaborador." }),
  tipo: z.enum(TIPOS_DE_PAGAMENTO, { message: "Escolha o tipo de pagamento." }),
  mes: z.string().regex(MES, "Escolha o mês de referência."),
  valorCents: z.number().int().positive("O valor precisa ser maior que zero."),
  pagoEm: z.string().regex(DIA, "Escolha a data do pagamento."),
  contaId: opcional(z.uuid()),
  forma: esquemaFormaDePagamento.optional(),
});

export type ColaboradorInput = z.input<typeof esquemaColaborador>;
export type DesligamentoInput = z.input<typeof esquemaDesligamento>;
export type AusenciaInput = z.input<typeof esquemaAusencia>;
export type PagamentoEquipeInput = z.input<typeof esquemaPagamentoEquipe>;
