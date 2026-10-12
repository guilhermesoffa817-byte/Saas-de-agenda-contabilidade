import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversaDaLista } from "@/components/app/assistente/protocolo";
import { mensagensParaTela, textoVisivel, type LinhaDeMensagem } from "@/lib/ia/assistente";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Leitura e gravação das conversas do assistente. Sempre com o cliente da
 * sessão (RLS: só o dono, só as próprias conversas) e sempre filtrando pela
 * empresa e pelo usuário também no código.
 */
type Cliente = SupabaseClient<Database>;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;

export const CONVERSAS_NA_LISTA = 50;

export async function aceitouOAviso(supabase: Cliente, empresaId: string, userId: string) {
  const { data, error } = await supabase
    .from("ai_consents")
    .select("accepted_at")
    .eq("organization_id", empresaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível conferir o aceite do aviso.");
  return Boolean(data);
}

export async function listarConversas(supabase: Cliente, empresaId: string, userId: string): Promise<ConversaDaLista[]> {
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("organization_id", empresaId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(CONVERSAS_NA_LISTA);
  return (data ?? []).map((c) => ({ id: c.id, titulo: c.title, atualizadaEm: c.updated_at }));
}

export async function conversaDoUsuario(supabase: Cliente, empresaId: string, userId: string, conversaId: string) {
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("id", conversaId)
    .eq("organization_id", empresaId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** As linhas da conversa, na ordem em que foram gravadas. */
export async function linhasDaConversa(supabase: Cliente, empresaId: string, conversaId: string) {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, display_text")
    .eq("organization_id", empresaId)
    .eq("conversation_id", conversaId)
    .order("id", { ascending: true });
  if (error) throw new Error("Não foi possível carregar a conversa.");
  return (data ?? []).map(
    (l): LinhaDeMensagem => ({
      id: l.id,
      role: l.role === "assistant" ? "assistant" : "user",
      content: l.content as unknown as BetaMessageParam["content"],
      display_text: l.display_text,
    }),
  );
}

/** Para a tela: só o texto visível e as fontes. O conteúdo bruto fica no servidor. */
export async function mensagensDaConversa(supabase: Cliente, empresaId: string, conversaId: string) {
  return mensagensParaTela(await linhasDaConversa(supabase, empresaId, conversaId));
}

/** Para a API: o histórico exatamente como foi gravado (com o raciocínio). */
export function historicoParaApi(linhas: LinhaDeMensagem[]): BetaMessageParam[] {
  return linhas.map((l) => ({ role: l.role, content: l.content }));
}

export function perguntasNaConversa(linhas: LinhaDeMensagem[]) {
  return linhas.filter((l) => l.role === "user" && l.display_text.trim()).length;
}

/**
 * Acrescenta as mensagens de uma pergunta concluída. Só por acréscimo: o banco
 * nem aceita update/delete em ai_messages.
 */
export async function gravarMensagens(
  supabase: Cliente,
  params: {
    empresaId: string;
    conversaId: string;
    pergunta: { mensagem: BetaMessageParam; texto: string };
    novas: BetaMessageParam[];
  },
) {
  const linhas = [
    { mensagem: params.pergunta.mensagem, texto: params.pergunta.texto },
    ...params.novas.map((m) => ({ mensagem: m, texto: m.role === "assistant" ? textoVisivel(m.content) : "" })),
  ].map(({ mensagem, texto }) => ({
    conversation_id: params.conversaId,
    organization_id: params.empresaId,
    role: mensagem.role,
    content: (typeof mensagem.content === "string"
      ? [{ type: "text", text: mensagem.content }]
      : mensagem.content) as unknown as Json,
    display_text: texto,
  }));
  const { error } = await supabase.from("ai_messages").insert(linhas);
  if (error) throw new Error("Não foi possível gravar a conversa.");
}

export async function criarConversa(supabase: Cliente, params: { empresaId: string; userId: string; titulo: string }) {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ organization_id: params.empresaId, user_id: params.userId, title: params.titulo })
    .select("id")
    .single();
  if (error) throw new Error("Não foi possível abrir a conversa.");
  return data.id;
}

export async function apagarConversaDoUsuario(supabase: Cliente, empresaId: string, userId: string, conversaId: string) {
  const { error, count } = await supabase
    .from("ai_conversations")
    .delete({ count: "exact" })
    .eq("id", conversaId)
    .eq("organization_id", empresaId)
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível apagar a conversa.");
  return (count ?? 0) > 0;
}
