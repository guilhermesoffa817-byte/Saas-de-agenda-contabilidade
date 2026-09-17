import { z } from "zod";

import { normalizarTelefone } from "@/lib/telefone";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esquemaTelefone = z
  .string()
  .trim()
  .transform((valor) => normalizarTelefone(valor))
  .refine((valor): valor is string => valor !== null, {
    message: "Digite o WhatsApp com DDD, por exemplo (66) 99999-9999.",
  });

export const esquemaNovoAtendimento = z
  .object({
    clienteId: z.uuid().optional(),
    clienteNome: z.string().trim().min(2, "Digite o nome do cliente.").max(80).optional(),
    clienteTelefone: z.string().trim().optional(),
    servicoId: z.uuid({ message: "Escolha o serviço." }),
    profissionalId: z.uuid({ message: "Escolha o profissional." }),
    dia: z.string().regex(DIA, "Escolha o dia."),
    hora: z.string().regex(HORA, "Escolha o horário."),
    precoCents: z.number().int().min(0).optional(),
  })
  .refine((dados) => Boolean(dados.clienteId) || Boolean(dados.clienteNome), {
    message: "Escolha um cliente ou cadastre um novo.",
    path: ["clienteNome"],
  });

export const esquemaRemarcacao = z.object({
  atendimentoId: z.uuid(),
  profissionalId: z.uuid(),
  dia: z.string().regex(DIA),
  hora: z.string().regex(HORA),
});

export const esquemaStatus = z.object({
  atendimentoId: z.uuid(),
  status: z.enum(["agendado", "confirmado", "concluido", "cancelado"]),
  motivo: z.string().trim().max(200).optional(),
});

export const esquemaBloqueio = z
  .object({
    profissionalId: z.uuid({ message: "Escolha o profissional." }),
    dia: z.string().regex(DIA, "Escolha o dia."),
    inicio: z.string().regex(HORA, "Horário inválido."),
    fim: z.string().regex(HORA, "Horário inválido."),
    motivo: z.string().trim().max(120).optional(),
  })
  .refine((dados) => dados.fim > dados.inicio, {
    message: "O fim precisa ser depois do início.",
    path: ["fim"],
  });

export const esquemaCliente = z.object({
  nome: z.string().trim().min(2, "Digite o nome do cliente.").max(80),
  telefone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  documento: z.string().trim().optional(),
  tipoPagador: z.enum(["pf", "pj"]),
  aceitaWhatsApp: z.boolean(),
  anotacoes: z.string().trim().max(2000).optional(),
});

export const esquemaServicoCadastro = z.object({
  nome: z.string().trim().min(2, "Digite o nome do serviço.").max(80),
  duracao: z.number().int().min(5, "Mínimo de 5 minutos.").max(600, "Máximo de 10 horas."),
  buffer: z.number().int().min(0).max(120),
  preco: z.number().int().min(0),
  online: z.boolean(),
  ativo: z.boolean(),
});

export type NovoAtendimentoInput = z.infer<typeof esquemaNovoAtendimento>;
export type RemarcacaoInput = z.infer<typeof esquemaRemarcacao>;
export type StatusInput = z.infer<typeof esquemaStatus>;
export type BloqueioInput = z.infer<typeof esquemaBloqueio>;
export type ClienteInput = z.infer<typeof esquemaCliente>;
export type ServicoCadastroInput = z.infer<typeof esquemaServicoCadastro>;
