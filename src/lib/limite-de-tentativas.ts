import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigurado } from "@/lib/supabase/config";

/**
 * Limite de tentativas nas telas de conta.
 *
 * O Supabase Auth já tem um limite próprio, por projeto. Este é nosso e é por
 * pessoa: segura ataque de força bruta em uma conta específica sem travar o
 * projeto inteiro. O e-mail e o IP entram embaralhados — nunca em texto puro.
 */

export type TipoDeTentativa = "entrar" | "cadastro" | "recuperar";

export const MUITAS_TENTATIVAS =
  "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";

function embaralhar(valor: string) {
  const sal = process.env.SUPABASE_SECRET_KEY ?? "alicerce";
  return createHash("sha256").update(`${valor}|${sal}`).digest("hex").slice(0, 32);
}

async function ipEmbaralhado() {
  const cabecalhos = await headers();
  const bruto =
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    cabecalhos.get("x-real-ip") ??
    "desconhecido";
  return embaralhar(bruto);
}

/**
 * Registra a tentativa e diz se ainda pode seguir. Quando o Supabase não está
 * configurado, deixa passar: aí nem login existe para proteger.
 */
export async function podeTentar(tipo: TipoDeTentativa, email: string) {
  if (!supabaseConfigurado || !process.env.SUPABASE_SECRET_KEY) return true;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("registrar_tentativa", {
      p_kind: tipo,
      p_email_hash: embaralhar(email.trim().toLowerCase()),
      p_ip_hash: await ipEmbaralhado(),
    });
    // Falha ao contar não pode virar porta fechada para quem é de casa.
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
