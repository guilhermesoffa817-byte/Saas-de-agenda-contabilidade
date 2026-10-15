import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import type {
  EventoAssistente,
  FonteDaResposta,
  MensagemDaTela,
} from "@/components/app/assistente/protocolo";

import { anthropic, BETA_FALLBACK, MODELO_IA, traduzirErroIA, type ErroIA } from "./cliente";
import type { UsoDaApi } from "./cota";
import { sanitizarParaIA } from "./sanitizar";

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlock = Anthropic.Beta.BetaContentBlock;
type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;

/** Chamadas à API por pergunta, contando as retomadas de pause_turn. */
export const MAX_VOLTAS = 8;
/** Cabe o raciocínio e a resposta. */
export const MAX_TOKENS = 32_000;
/** Perguntas por conversa: depois disso o contexto fica caro e a conversa pede recomeço. */
export const MAX_PERGUNTAS_POR_CONVERSA = 20;
export const TAMANHO_DO_TITULO = 80;

export const MENSAGEM_DE_RECUSA =
  "O assistente não pode ajudar com esse pedido. Reformule a pergunta com foco nos números do negócio ou, se for sobre impostos, fale com seu contador.";
export const AVISO_DE_VOLTAS =
  "A análise ficou longa demais e foi interrompida antes do fim. Tente uma pergunta mais específica, com um período menor.";
export const AVISO_DE_CORTE = "A resposta foi cortada por tamanho. Peça a continuação ou faça uma pergunta mais específica.";
export const AVISO_DE_PRAZO =
  "A análise passou do tempo máximo e foi encerrada antes do fim. O que ficou pronto foi guardado; tente uma pergunta mais específica, com um período menor.";

/** Título da conversa: a primeira pergunta, limpa de dados pessoais e curta. */
export function tituloDaConversa(pergunta: string) {
  const limpo = sanitizarParaIA(pergunta.replace(/\s+/g, " ").trim());
  if (!limpo) return "Nova conversa";
  if (limpo.length <= TAMANHO_DO_TITULO) return limpo;
  return `${limpo.slice(0, TAMANHO_DO_TITULO - 1).trimEnd()}…`;
}

/**
 * Depois de um fallback no meio da resposta: antes do último bloco `fallback`,
 * tira thinking/redacted_thinking/tool_use e server_tool_use sem resultado.
 */
export function prepararParaReenvio(content: BetaContentBlock[]): BetaContentBlock[] {
  const corte = content.findLastIndex((b) => b.type === "fallback");
  if (corte < 0) return content;
  const antes = content.slice(0, corte);
  // Todo bloco de resultado do servidor (pesquisa, leitura de página, execução
  // de código da filtragem dinâmica…) tem tool_use_id: o par fica inteiro.
  const comResultado = new Set(antes.flatMap((b) => ("tool_use_id" in b ? [b.tool_use_id] : [])));
  const limpos = antes.filter((b) => {
    if (b.type === "thinking" || b.type === "redacted_thinking" || b.type === "tool_use") return false;
    if (b.type === "server_tool_use") return comResultado.has(b.id);
    return true;
  });
  return [...limpos, ...content.slice(corte)];
}

type BlocoDaMensagem = Exclude<BetaMessageParam["content"], string>[number];

const ehRaciocinio = (b: BlocoDaMensagem) => b.type === "thinking" || b.type === "redacted_thinking";

/**
 * Fecha o histórico de uma pergunta interrompida (corte por tamanho, prazo):
 * na sequência final de mensagens do assistente, tira os `tool_use` (sem
 * resultado, porque nenhuma mensagem do usuário vem depois) e os
 * `server_tool_use` sem o resultado. Sem isso, toda pergunta seguinte da
 * conversa daria 400. O texto que a pessoa já leu fica. Mensagens sem nada
 * pendente não mudam (os bytes enviados à API se mantêm).
 */
export function fecharTurno(novas: BetaMessageParam[]): BetaMessageParam[] {
  let inicio = novas.length;
  while (inicio > 0 && novas[inicio - 1].role === "assistant") inicio--;
  if (inicio === novas.length) return novas;

  const cauda = novas.slice(inicio);
  const comResultado = new Set(
    cauda.flatMap((m) =>
      typeof m.content === "string" ? [] : m.content.flatMap((b) => ("tool_use_id" in b ? [b.tool_use_id] : [])),
    ),
  );
  const pendente = (b: BlocoDaMensagem) =>
    b.type === "tool_use" || (b.type === "server_tool_use" && !comResultado.has(b.id));

  const fechada = cauda.flatMap((m): BetaMessageParam[] => {
    if (typeof m.content === "string" || !m.content.some(pendente)) return [m];
    const content = m.content.filter((b) => !pendente(b));
    return content.some((b) => !ehRaciocinio(b)) ? [{ ...m, content }] : [];
  });
  return [...novas.slice(0, inicio), ...fechada];
}

export type Fonte = FonteDaResposta;

/** O texto que a tela mostra de uma mensagem do assistente (nunca o raciocínio). */
export function textoVisivel(content: BetaMessageParam["content"]) {
  if (typeof content === "string") return content;
  return content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
}

/** Só links https: a tela não mostra outro tipo de endereço vindo do modelo. */
function urlSegura(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Fontes citadas nos blocos de texto, sem repetir endereço. */
export function fontesDoConteudo(content: BetaMessageParam["content"]): Fonte[] {
  if (typeof content === "string") return [];
  const vistas = new Map<string, Fonte>();
  for (const bloco of content) {
    if (bloco.type !== "text" || !bloco.citations) continue;
    for (const c of bloco.citations) {
      if (c.type === "web_search_result_location" && urlSegura(c.url) && !vistas.has(c.url)) {
        vistas.set(c.url, { url: c.url, titulo: c.title ?? null });
      }
    }
  }
  return [...vistas.values()];
}

/** Uma linha de public.ai_messages, como vem do banco. */
export type LinhaDeMensagem = {
  id: number;
  role: "user" | "assistant";
  content: BetaMessageParam["content"];
  display_text: string;
};

/**
 * Agrupa as linhas gravadas no que a tela mostra: cada pergunta do usuário e a
 * resposta inteira do assistente (todas as voltas juntas). Resultados de
 * ferramenta e raciocínio ficam de fora.
 */
export function mensagensParaTela(linhas: LinhaDeMensagem[]): MensagemDaTela[] {
  const tela: MensagemDaTela[] = [];
  let resposta: MensagemDaTela | null = null;
  for (const linha of linhas) {
    if (linha.role === "user") {
      if (!linha.display_text.trim()) continue; // resultado de ferramenta
      resposta = null;
      tela.push({ id: `m${linha.id}`, papel: "usuario", texto: linha.display_text, fontes: [] });
      continue;
    }
    const texto = linha.display_text.trim();
    const fontes = fontesDoConteudo(linha.content);
    if (!texto && fontes.length === 0) continue;
    if (!resposta) {
      resposta = { id: `m${linha.id}`, papel: "assistente", texto: "", fontes: [] };
      tela.push(resposta);
    }
    if (texto) resposta.texto = resposta.texto ? `${resposta.texto}\n\n${texto}` : texto;
    for (const f of fontes) if (!resposta.fontes.some((g) => g.url === f.url)) resposta.fontes.push(f);
  }
  return tela;
}

export type Desfecho = "concluido" | "cortado" | "prazo" | "recusa" | "voltas" | "erro" | "cancelado";

export type ResultadoDoLaco = {
  desfecho: Desfecho;
  /** Mensagens novas depois do histórico (assistente e resultados de ferramenta). */
  novas: BetaMessageParam[];
  /** `usage` de cada chamada que terminou. */
  usos: UsoDaApi[];
  /** Quantos pedidos foram enviados à API (inclusive o que falhou ou foi cancelado). */
  chamadas: number;
  erro?: ErroIA;
};

/** Só os desfechos que deixam o histórico consistente (depois de `fecharTurno`) são gravados. */
export function deveGravar(desfecho: Desfecho) {
  return desfecho === "concluido" || desfecho === "cortado" || desfecho === "prazo";
}

export type OpcoesDoLaco = {
  /** Estável entre pedidos (cache e raciocínio preservado). */
  sistema: string;
  /** Idênticas entre pedidos, pelo mesmo motivo. */
  ferramentas: Anthropic.Beta.BetaToolUnion[];
  /** Histórico vindo do banco, terminado na mensagem nova do usuário. */
  historico: BetaMessageParam[];
  executar: (bloco: BetaToolUseBlock) => Promise<BetaToolResultBlockParam>;
  /** Texto curto para a tela enquanto uma ferramenta roda. */
  statusDe: (nome: string) => string | null;
  emitir: (evento: EventoAssistente) => void;
  /** Cancelamento pelo navegador: nada desta pergunta é gravado. */
  signal?: AbortSignal;
  /**
   * Prazo total da pergunta, abaixo do maxDuration da rota. Quando vence, o laço
   * para, avisa e devolve o que já ficou completo (desfecho "prazo"), para quem
   * chamou gravar antes de a hospedagem matar a função.
   */
  prazo?: AbortSignal;
  /** Chamado ao fim de cada volta com o uso ACUMULADO da pergunta (para gravar os tokens já gastos). */
  aoConcluirVolta?: (usos: UsoDaApi[]) => Promise<void> | void;
  /** Para testes: um cliente com `fetch` falso. */
  cliente?: Anthropic;
};

/**
 * O laço do agente: chama a API em streaming, roda as ferramentas pedidas,
 * retoma pause_turn sem mensagem extra e para em end_turn, recusa, corte por
 * tamanho, erro, cancelamento ou excesso de voltas. Não grava nada: devolve as
 * mensagens novas para quem chamou decidir.
 */
export async function rodarAssistente(opcoes: OpcoesDoLaco): Promise<ResultadoDoLaco> {
  const cliente = opcoes.cliente ?? anthropic();
  const mensagens: BetaMessageParam[] = [...opcoes.historico];
  const usos: UsoDaApi[] = [];
  let chamadas = 0;
  let houveTexto = false;
  const fontesEnviadas = new Set<string>();

  const sinais = [opcoes.signal, opcoes.prazo].filter((s): s is AbortSignal => Boolean(s));
  const sinal = sinais.length > 1 ? AbortSignal.any(sinais) : sinais[0];
  const venceuOPrazo = () => Boolean(opcoes.prazo?.aborted) && !opcoes.signal?.aborted;

  const resultado = (desfecho: Desfecho, erro?: ErroIA): ResultadoDoLaco => ({
    desfecho,
    novas: fecharTurno(mensagens.slice(opcoes.historico.length)),
    usos,
    chamadas,
    ...(erro ? { erro } : {}),
  });
  const encerrarNoPrazo = () => {
    opcoes.emitir({ tipo: "aviso", mensagem: AVISO_DE_PRAZO });
    return resultado("prazo");
  };

  try {
    for (let volta = 0; ; volta++) {
      if (venceuOPrazo()) return encerrarNoPrazo();
      if (opcoes.signal?.aborted) return resultado("cancelado");
      if (volta >= MAX_VOLTAS) {
        opcoes.emitir({ tipo: "aviso", mensagem: AVISO_DE_VOLTAS });
        return resultado("voltas");
      }

      chamadas += 1;
      let textoNestaVolta = false;
      const stream = cliente.beta.messages.stream(
        {
          model: MODELO_IA,
          max_tokens: MAX_TOKENS,
          betas: [BETA_FALLBACK],
          fallbacks: "default",
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          system: opcoes.sistema,
          tools: opcoes.ferramentas,
          messages: mensagens,
        },
        { signal: sinal },
      );

      stream.on("text", (delta) => {
        if (delta) opcoes.emitir({ tipo: "texto", delta });
      });
      stream.on("citation", (c) => {
        if (c.type !== "web_search_result_location" || !urlSegura(c.url) || fontesEnviadas.has(c.url)) return;
        fontesEnviadas.add(c.url);
        opcoes.emitir({ tipo: "fonte", url: c.url, titulo: c.title ?? null });
      });
      stream.on("streamEvent", (evento) => {
        if (evento.type !== "content_block_start") return;
        const bloco = evento.content_block;
        if (bloco.type === "text" && !textoNestaVolta) {
          // Texto de uma volta nova começa em parágrafo novo. Dentro da mesma volta,
          // os blocos são pedaços da mesma frase (as citações quebram o texto).
          if (houveTexto) opcoes.emitir({ tipo: "texto", delta: "\n\n" });
          textoNestaVolta = true;
          houveTexto = true;
        }
        if (bloco.type === "tool_use" || bloco.type === "server_tool_use") {
          const mensagem = opcoes.statusDe(bloco.name);
          if (mensagem) opcoes.emitir({ tipo: "status", mensagem });
        }
      });

      const resposta = await stream.finalMessage();
      usos.push(resposta.usage);
      await opcoes.aoConcluirVolta?.([...usos]);
      const conteudo = prepararParaReenvio(resposta.content);

      if (resposta.stop_reason === "refusal") {
        // A cadeia de fallback inteira recusou: nada desta pergunta é gravado.
        opcoes.emitir({ tipo: "recusa", mensagem: MENSAGEM_DE_RECUSA });
        return resultado("recusa");
      }
      if (resposta.stop_reason === "pause_turn") {
        mensagens.push({ role: "assistant", content: conteudo });
        continue; // retoma sem mensagem do usuário
      }

      const pedidos = conteudo.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      if (resposta.stop_reason === "max_tokens" || resposta.stop_reason === "model_context_window_exceeded") {
        // Nunca executa um tool_use cortado no meio. O texto que a tela já
        // mostrou fica; fecharTurno tira o que ficou sem par.
        mensagens.push({ role: "assistant", content: conteudo });
        opcoes.emitir({ tipo: "aviso", mensagem: AVISO_DE_CORTE });
        return resultado("cortado");
      }

      mensagens.push({ role: "assistant", content: conteudo });
      if (resposta.stop_reason !== "tool_use" || pedidos.length === 0) return resultado("concluido");

      const resultados = await Promise.all(pedidos.map((u) => opcoes.executar(u)));
      mensagens.push({ role: "user", content: resultados });
    }
  } catch (err) {
    if (venceuOPrazo()) return encerrarNoPrazo();
    const erro = traduzirErroIA(err);
    if (erro.codigo === "cancelado" || opcoes.signal?.aborted) return resultado("cancelado");
    // 400 numa conversa com histórico: em geral o system ou as ferramentas mudaram
    // (dados da empresa editados) e a API não aceita mais o raciocínio guardado.
    const continuacao = erro.codigo === "pedido" && opcoes.historico.length > 1;
    const final = continuacao
      ? { ...erro, mensagem: "Não foi possível continuar esta conversa. Comece uma nova conversa e refaça a pergunta." }
      : erro;
    opcoes.emitir({ tipo: "erro", codigo: final.codigo, mensagem: final.mensagem });
    return resultado("erro", final);
  }
}
