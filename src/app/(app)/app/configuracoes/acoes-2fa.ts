"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

export type FatorDeSeguranca = {
  id: string;
  nome: string;
  criadoEm: string;
  verificado: boolean;
};

/**
 * Verificação em duas etapas por aplicativo autenticador (TOTP), do próprio
 * Supabase Auth. É opcional, e vale principalmente para quem tem acesso a
 * dinheiro e a dados de terceiros: dono e contador.
 */
export async function listarFatores(): Promise<Resposta<FatorDeSeguranca[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { erro: error.message };

  const fatores = (data?.all ?? []).map((fator) => ({
    id: fator.id,
    nome: fator.friendly_name ?? "Aplicativo autenticador",
    criadoEm: fator.created_at,
    verificado: fator.status === "verified",
  }));
  return { dados: fatores };
}

/** Começa o cadastro: devolve o QR Code e o segredo para digitar na mão. */
export async function comecarCadastroDe2FA(
  nome: string,
): Promise<Resposta<{ fatorId: string; qrCode: string; segredo: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: nome.trim().slice(0, 40) || "Aplicativo autenticador",
  });
  if (error || !data) return { erro: error?.message ?? "Não conseguimos começar o cadastro." };

  return {
    dados: {
      fatorId: data.id,
      qrCode: data.totp.qr_code,
      segredo: data.totp.secret,
    },
  };
}

/** Confere o primeiro código e liga a verificação em duas etapas. */
export async function confirmarCadastroDe2FA(
  fatorId: string,
  codigo: string,
): Promise<Resposta> {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length !== 6) return { erro: "O código tem seis números." };

  const supabase = await createClient();
  const { data: desafio, error: erroDoDesafio } = await supabase.auth.mfa.challenge({
    factorId: fatorId,
  });
  if (erroDoDesafio || !desafio) {
    return { erro: erroDoDesafio?.message ?? "Não conseguimos conferir o código." };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: fatorId,
    challengeId: desafio.id,
    code: limpo,
  });
  if (error) return { erro: "Código não confere. Confira o horário do celular e tente de novo." };

  revalidatePath("/app/configuracoes");
  return { aviso: "Verificação em duas etapas ligada." };
}

/** Desliga a verificação em duas etapas. */
export async function removerFatorDe2FA(fatorId: string): Promise<Resposta> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });
  if (error) return { erro: error.message };

  revalidatePath("/app/configuracoes");
  return { aviso: "Verificação em duas etapas desligada." };
}
