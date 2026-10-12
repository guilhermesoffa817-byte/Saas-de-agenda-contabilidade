"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";

import { apagarConversaDoUsuario } from "./dados";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

async function exigirDono() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." as const, vinculo: null, userId: null };
  if (vinculo.papel !== "dono") return { erro: "Só o dono usa o assistente." as const, vinculo: null, userId: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Entre na sua conta para continuar." as const, vinculo: null, userId: null };
  return { erro: undefined, vinculo, userId: user.id, supabase };
}

/** Primeiro uso: o dono leu o aviso (Anthropic, dados agregados, fora do Brasil) e aceitou. */
export async function aceitarAvisoDoAssistente(): Promise<Resposta> {
  const { erro, vinculo, userId, supabase } = await exigirDono();
  if (erro || !vinculo || !userId || !supabase) return { erro };
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio) return { erro: bloqueio };

  const { error } = await supabase
    .from("ai_consents")
    .insert({ organization_id: vinculo.empresa.id, user_id: userId });
  // 23505: já tinha aceitado (dois cliques, duas abas) — é o mesmo resultado.
  if (error && error.code !== "23505") return { erro: "Não foi possível registrar o aceite. Tente de novo." };

  try {
    // A auditoria não aceita escrita de quem está logado: quem grava é o servidor.
    await createAdminClient().from("audit_logs").insert({
      organization_id: vinculo.empresa.id,
      user_id: userId,
      action: "ia.aviso_aceito",
      metadata: { recurso: "assistente" },
    });
  } catch {
    // Sem a chave do servidor, o aceite continua valendo (fica em ai_consents).
  }

  revalidatePath("/app/assistente");
  return { aviso: "Aviso aceito. O assistente está liberado." };
}

const esquemaId = z.uuid("Conversa inválida.");

/**
 * Apagar a própria conversa é direito do titular (LGPD, art. 18) e continua
 * liberado mesmo com a assinatura em modo somente leitura.
 */
export async function apagarConversa(conversaId: string): Promise<Resposta> {
  const validado = esquemaId.safeParse(conversaId);
  if (!validado.success) return { erro: "Conversa inválida." };
  const { erro, vinculo, userId, supabase } = await exigirDono();
  if (erro || !vinculo || !userId || !supabase) return { erro };

  try {
    const apagou = await apagarConversaDoUsuario(supabase, vinculo.empresa.id, userId, validado.data);
    if (!apagou) return { erro: "Conversa não encontrada." };
  } catch {
    return { erro: "Não foi possível apagar a conversa. Tente de novo." };
  }
  revalidatePath("/app/assistente");
  return { aviso: "Conversa apagada." };
}
