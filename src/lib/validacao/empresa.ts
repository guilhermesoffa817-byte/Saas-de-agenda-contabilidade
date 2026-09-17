import { z } from "zod";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esquemaSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,40}$/, "Use apenas letras minúsculas, números e hífen (de 3 a 40 caracteres).");

export const esquemaSegmento = z.enum([
  "salao",
  "barbearia",
  "clinica",
  "consultorio",
  "personal",
  "terapeuta",
  "outro",
]);

export const esquemaRegime = z.enum(["pf_autonomo", "mei", "simples_nacional", "outro"]);

export const esquemaNovaEmpresa = z.object({
  nome: z.string().trim().min(2, "Digite o nome do seu negócio.").max(80, "Nome muito longo."),
  slug: esquemaSlug,
  segmento: esquemaSegmento,
  regime: esquemaRegime,
  fuso: z.string().trim().min(3, "Escolha o fuso horário."),
});

export const esquemaProfissional = z.object({
  nome: z.string().trim().min(2, "Digite o nome do profissional.").max(60),
});

export const esquemaFaixaDoDia = z
  .object({
    dia: z.number().int().min(0).max(6),
    aberto: z.boolean(),
    inicio: z.string().regex(HORA, "Horário inválido."),
    fim: z.string().regex(HORA, "Horário inválido."),
  })
  .refine((faixa) => !faixa.aberto || faixa.fim > faixa.inicio, {
    message: "O horário de fechar precisa ser depois do de abrir.",
    path: ["fim"],
  });

export const esquemaExpediente = z.object({
  profissionais: z.array(esquemaProfissional).min(1, "Cadastre pelo menos um profissional."),
  dias: z.array(esquemaFaixaDoDia).length(7),
});

export const esquemaServico = z.object({
  nome: z.string().trim().min(2, "Digite o nome do serviço.").max(80),
  duracao: z
    .number()
    .int()
    .min(5, "A duração mínima é de 5 minutos.")
    .max(600, "A duração máxima é de 10 horas."),
  buffer: z.number().int().min(0).max(120).default(0),
  preco: z.number().int().min(0, "O preço não pode ser negativo."),
  online: z.boolean().default(true),
});

export const esquemaServicos = z.object({
  servicos: z.array(esquemaServico).min(1, "Cadastre pelo menos um serviço."),
});

export const esquemaConvite = z.object({
  email: z.email({ message: "Digite um e-mail válido." }),
  papel: z.enum(["dono", "profissional", "recepcao", "contador"]),
});

export const esquemaDadosDaEmpresa = z.object({
  nome: z.string().trim().min(2, "Digite o nome do seu negócio.").max(80),
  slug: esquemaSlug,
  segmento: esquemaSegmento,
  regime: esquemaRegime,
  fuso: z.string().trim().min(3),
  documento: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor === "" || valor.length === 11 || valor.length === 14, {
      message: "Digite um CPF (11 dígitos) ou CNPJ (14 dígitos).",
    })
    .optional(),
  abertura: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato aaaa-mm-dd.")
    .optional()
    .or(z.literal("")),
  cidade: z.string().trim().max(60).optional(),
  estado: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a sigla do estado, com 2 letras.")
    .optional()
    .or(z.literal("")),
  chavePix: z.string().trim().max(80).optional(),
});

/** Transforma "Salão da Ana" em "salao-da-ana". */
export function sugerirSlug(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type NovaEmpresaInput = z.infer<typeof esquemaNovaEmpresa>;
export type ExpedienteInput = z.infer<typeof esquemaExpediente>;
export type ServicosInput = z.infer<typeof esquemaServicos>;
export type ConviteInput = z.infer<typeof esquemaConvite>;
export type DadosDaEmpresaInput = z.infer<typeof esquemaDadosDaEmpresa>;
