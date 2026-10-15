import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversaDaLista } from "@/components/app/assistente/protocolo";
import { mensagensParaTela, textoVisivel, type LinhaDeMensagem } from "@/lib/ia/assistente";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Leitura e gravação das conversas do assistente. Sempre com o cliente da
 * sessão (RLS: só o dono, só as próprias conversas) e sempre filtrando pela
 * empresa e pelo usuário também no código. O conteúdo bruto das mensagens (com
 * o raciocínio do modelo) só sai do banco por public.historico_de_ia e só
 * entra por public.acrescentar_mensagens_de_ia — o navegador não lê nem grava
 * a coluna content.
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
    .select("id, title, system_snapshot")
    .eq("id", conversaId)
    .eq("organization_id", empresaId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * As linhas da conversa, na ordem em que foram gravadas, com o content como
 * foi enviado à API (coluna json: mesma ordem de chaves). Só no servidor.
 */
export async function linhasDaConversa(supabase: Cliente, conversaId: string) {
  const { data, error } = await supabase.rpc("historico_de_ia", { p_conversa: conversaId });
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
export async function mensagensDaConversa(supabase: Cliente, conversaId: string) {
  return mensagensParaTela(await linhasDaConversa(supabase, conversaId));
}

/** Para a API: o histórico exatamente como foi gravado (com o raciocínio). */
export function historicoParaApi(linhas: LinhaDeMensagem[]): BetaMessageParam[] {
  return linhas.map((l) => ({ role: l.role, content: l.content }));
}

export function perguntasNaConversa(linhas: LinhaDeMensagem[]) {
  return linhas.filter((l) => l.role === "user" && l.display_text.trim()).length;
}

/** Recusas de public.acrescentar_mensagens_de_ia que a pessoa precisa ler como vieram. */
const RECUSAS_DA_GRAVACAO = [
  "A conversa foi atualizada em outra aba. Recarregue a página.",
  "A resposta ficou grande demais para guardar. Comece uma nova conversa.",
  "Esta conversa ficou longa demais. Comece uma nova conversa.",
  "Mensagem em formato inválido.",
  "Conversa não encontrada.",
];
export const RECUSA_POR_OUTRA_ABA = RECUSAS_DA_GRAVACAO[0];

/** Erro ao gravar, com a mensagem já pronta para a tela. */
export class ErroAoGravar extends Error {
  constructor(
    mensagem: string,
    readonly codigo: "outra_aba" | "gravar",
  ) {
    super(mensagem);
  }
}

/**
 * Acrescenta as mensagens de uma pergunta, só por acréscimo e com o content
 * exatamente como foi à API (sem converter string em bloco: os bytes do
 * próximo pedido precisam ser os mesmos). `apos` é o id da última linha lida
 * antes de chamar a API (null numa conversa nova): se outra aba gravou depois,
 * o banco recusa, porque o histórico intercalado quebraria a conversa.
 * Devolve o id da última linha gravada.
 */
export async function gravarMensagens(
  supabase: Cliente,
  params: {
    conversaId: string;
    apos: number | null;
    pergunta: { mensagem: BetaMessageParam; texto: string };
    novas: BetaMessageParam[];
  },
) {
  const mensagens = [
    { mensagem: params.pergunta.mensagem, texto: params.pergunta.texto },
    ...params.novas.map((m) => ({ mensagem: m, texto: m.role === "assistant" ? textoVisivel(m.content) : "" })),
  ].map(({ mensagem, texto }) => ({ role: mensagem.role, content: mensagem.content, display_text: texto }));

  const { data, error } = await supabase.rpc("acrescentar_mensagens_de_ia", {
    p_conversa: params.conversaId,
    p_apos: params.apos,
    p_mensagens: mensagens as unknown as Json,
  });
  if (error) {
    const conhecida = RECUSAS_DA_GRAVACAO.find((m) => error.message?.includes(m));
    throw new ErroAoGravar(
      conhecida ?? "A resposta não pôde ser gravada. Tente de novo.",
      conhecida === RECUSA_POR_OUTRA_ABA ? "outra_aba" : "gravar",
    );
  }
  return data;
}

/**
 * Cria a conversa e congela nela o prompt de sistema usado: o raciocínio
 * preservado exige o mesmo system em toda a conversa, mesmo que o plano, a
 * cidade ou o segmento mudem depois.
 */
export async function criarConversa(
  supabase: Cliente,
  params: { empresaId: string; userId: string; titulo: string; sistema: string },
) {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      organization_id: params.empresaId,
      user_id: params.userId,
      title: params.titulo,
      system_snapshot: params.sistema,
    })
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
