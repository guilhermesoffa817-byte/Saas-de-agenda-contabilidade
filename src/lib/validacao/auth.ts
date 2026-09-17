import { z } from "zod";

export const esquemaEmail = z.email({ message: "Digite um e-mail válido." });
export const esquemaSenhaNova = z
  .string()
  .min(8, "A senha precisa de pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const esquemaEntrar = z.object({
  email: esquemaEmail,
  senha: z.string().min(1, "Digite sua senha."),
});

export const esquemaCadastro = z.object({
  nome: z.string().trim().min(2, "Digite seu nome."),
  email: esquemaEmail,
  senha: esquemaSenhaNova,
});

export const esquemaSoEmail = z.object({ email: esquemaEmail });

export const esquemaNovaSenha = z
  .object({ senha: esquemaSenhaNova, confirmacao: z.string() })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: "As duas senhas precisam ser iguais.",
    path: ["confirmacao"],
  });

export type EntrarInput = z.infer<typeof esquemaEntrar>;
export type CadastroInput = z.infer<typeof esquemaCadastro>;
export type SoEmailInput = z.infer<typeof esquemaSoEmail>;
export type NovaSenhaInput = z.infer<typeof esquemaNovaSenha>;
