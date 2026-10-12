#!/usr/bin/env node
/**
 * Servidor FALSO da API da Anthropic, só para testes de ponta a ponta. Nunca
 * chama a API de verdade e responde sempre a mesma coisa para o mesmo pedido.
 *
 *   PORTA=4010 node scripts/anthropic-falso.mjs
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=chave-falsa npm run dev
 *
 * POST /v1/messages
 *   - sem "stream" (classificação de custos, `beta.messages.parse`): devolve uma
 *     Message com um bloco de texto JSON no formato pedido em
 *     output_config.format ({ itens: [{ id, natureza, motivo }] }), classificando
 *     cada despesa por palavras-chave da descrição/categoria.
 *   - com "stream": true (assistente): SSE no formato real do Messages API
 *     (message_start, content_block_start/delta/stop, ping, message_delta com
 *     stop_reason e usage, message_stop).
 *       1ª volta: um bloco de texto curto e um tool_use de uma ferramenta nossa
 *                 (resumo_financeiro, com o mês corrente), stop_reason tool_use.
 *       2ª volta (a última mensagem traz tool_result): texto em vários pedaços,
 *                 citando o que a ferramenta devolveu, stop_reason end_turn.
 *     Palavras na pergunta mudam o roteiro: "[recusa]" → stop_reason refusal;
 *     "[sobrecarga]" → HTTP 529 overloaded_error; "[direto]" → só texto, sem ferramenta.
 *
 * Também:
 *   GET  /__saude    → { ok: true }
 *   GET  /__pedidos  → os últimos pedidos recebidos (para os testes conferirem)
 *   POST /__limpar   → esquece os pedidos
 *
 * Variáveis: PORTA (4010), HOST (127.0.0.1), ATRASO_MS (40, entre pedaços do SSE).
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORTA = Number(process.env.PORTA ?? 4010);
const HOST = process.env.HOST ?? "127.0.0.1";
const ATRASO_MS = Number(process.env.ATRASO_MS ?? 40);
const FUSO = "America/Sao_Paulo";

/** Texto da resposta final do assistente (os testes procuram por ele). */
export const MARCA_DA_RESPOSTA = "Resposta de teste do assistente";

const pedidos = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const idDe = (prefixo) => `${prefixo}_falso_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

function cabecalhosPadrao(extra = {}) {
  return { "request-id": idDe("req"), "anthropic-organization-id": "org-falsa", ...extra };
}

function json(res, status, corpo) {
  res.writeHead(status, cabecalhosPadrao({ "content-type": "application/json" }));
  res.end(JSON.stringify(corpo));
}

function erroApi(res, status, tipo, mensagem) {
  json(res, status, { type: "error", error: { type: tipo, message: mensagem }, request_id: idDe("req") });
}

function hojeNoFuso() {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

function usoBase(entrada) {
  return {
    input_tokens: entrada,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 1,
    server_tool_use: null,
    service_tier: "standard",
  };
}

function tokensAproximados(corpo) {
  return Math.max(1, Math.round(JSON.stringify(corpo).length / 4));
}

// ---------- classificação (não-streaming) -----------------------------------

const REGRAS = [
  { natureza: "nao_operacional", termos: ["juros", "multa", "iof", "emprestimo", "financiamento", "equipamento", "carne-leao", "carne leao", "imposto de renda", "pessoal", "investimento"] },
  { natureza: "variavel", termos: ["produto", "insumo", "material", "descartavel", "comissao", "repasse", "cota-parte", "maquininha", "taxa", "das", "iss", "frete", "embalagem", "esmalte", "shampoo", "tintura"] },
  { natureza: "fixo", termos: ["aluguel", "condominio", "internet", "energia", "luz", "agua", "salario", "pro-labore", "contador", "contabilidade", "sistema", "seguro", "anuidade", "marketing", "tarifa", "telefone"] },
];

function semAcento(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function classificar(item) {
  const texto = semAcento(`${item.descricao ?? ""} ${item.categoria ?? ""}`);
  for (const regra of REGRAS) {
    const termo = regra.termos.find((t) => new RegExp(`\\b${t}\\b`).test(texto));
    if (termo) return { natureza: regra.natureza, motivo: `Classificação de teste: contém "${termo}".` };
  }
  if (item.repete_em_meses_anteriores) {
    return { natureza: "fixo", motivo: "Classificação de teste: repete em meses anteriores." };
  }
  return { natureza: "variavel", motivo: "Classificação de teste: sem pista, tratado como variável." };
}

function textoDaUltimaMensagem(corpo) {
  const ultima = corpo.messages?.at(-1);
  if (!ultima) return "";
  if (typeof ultima.content === "string") return ultima.content;
  return ultima.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function responderClassificacao(res, corpo) {
  let despesas = [];
  try {
    despesas = JSON.parse(textoDaUltimaMensagem(corpo)).despesas ?? [];
  } catch {
    return erroApi(res, 400, "invalid_request_error", "O conteúdo do usuário não é o JSON esperado ({ despesas: [...] }).");
  }
  const itens = despesas.map((d) => ({ id: String(d.id), ...classificar(d) }));
  const texto = JSON.stringify({ itens });
  json(res, 200, {
    id: idDe("msg"),
    type: "message",
    role: "assistant",
    model: corpo.model,
    content: [{ type: "text", text: texto, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: { ...usoBase(tokensAproximados(corpo)), output_tokens: Math.max(1, Math.round(texto.length / 4)) },
  });
}

// ---------- assistente (streaming) ------------------------------------------

function enviarEvento(res, tipo, dados) {
  res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`);
}

function pedacos(texto, tamanho = 18) {
  const lista = [];
  for (let i = 0; i < texto.length; i += tamanho) lista.push(texto.slice(i, i + tamanho));
  return lista;
}

async function blocoDeTexto(res, indice, texto) {
  enviarEvento(res, "content_block_start", { index: indice, content_block: { type: "text", text: "", citations: null } });
  for (const pedaco of pedacos(texto)) {
    enviarEvento(res, "content_block_delta", { index: indice, delta: { type: "text_delta", text: pedaco } });
    await espera(ATRASO_MS);
  }
  enviarEvento(res, "content_block_stop", { index: indice });
}

async function blocoDeFerramenta(res, indice, nome, entrada) {
  const id = idDe("toolu");
  enviarEvento(res, "content_block_start", {
    index: indice,
    content_block: { type: "tool_use", id, name: nome, input: {}, caller: { type: "direct" } },
  });
  enviarEvento(res, "content_block_delta", { index: indice, delta: { type: "input_json_delta", partial_json: "" } });
  for (const pedaco of pedacos(JSON.stringify(entrada), 12)) {
    enviarEvento(res, "content_block_delta", { index: indice, delta: { type: "input_json_delta", partial_json: pedaco } });
    await espera(ATRASO_MS / 2);
  }
  enviarEvento(res, "content_block_stop", { index: indice });
}

function resultadosDeFerramenta(corpo) {
  const ultima = corpo.messages?.at(-1);
  if (!ultima || ultima.role !== "user" || typeof ultima.content === "string") return [];
  return ultima.content.filter((b) => b.type === "tool_result");
}

function resumoDoResultado(resultado) {
  const conteudo = Array.isArray(resultado.content)
    ? resultado.content.map((c) => (c.type === "text" ? c.text : "")).join(" ")
    : String(resultado.content ?? "");
  return conteudo.replace(/\s+/g, " ").slice(0, 160);
}

async function responderAssistente(res, corpo) {
  const pergunta = textoDaUltimaMensagem(corpo);
  if (pergunta.includes("[sobrecarga]")) return erroApi(res, 529, "overloaded_error", "Overloaded");

  res.writeHead(200, cabecalhosPadrao({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" }));
  const entrada = tokensAproximados(corpo);
  enviarEvento(res, "message_start", {
    message: {
      id: idDe("msg"),
      type: "message",
      role: "assistant",
      model: corpo.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      container: null,
      context_management: null,
      usage: usoBase(entrada),
    },
  });
  enviarEvento(res, "ping", {});

  let stopReason = "end_turn";
  let saida = 0;
  const resultados = resultadosDeFerramenta(corpo);
  const nomesDasFerramentas = new Set((corpo.tools ?? []).map((t) => t.name));

  if (pergunta.includes("[recusa]")) {
    stopReason = "refusal";
  } else if (resultados.length > 0) {
    const algumErro = resultados.some((r) => r.is_error);
    const texto =
      `${MARCA_DA_RESPOSTA}: consultei os números da empresa${algumErro ? " (a ferramenta devolveu erro)" : ""}. ` +
      `Resumo recebido: ${resumoDoResultado(resultados[0])}… ` +
      "Isto é uma resposta simulada, só para testes.";
    await blocoDeTexto(res, 0, texto);
    saida = Math.round(texto.length / 4);
  } else if (!pergunta.includes("[direto]") && nomesDasFerramentas.has("resumo_financeiro")) {
    const hoje = hojeNoFuso();
    const intro = "Vou consultar o resumo financeiro do mês.";
    await blocoDeTexto(res, 0, intro);
    await blocoDeFerramenta(res, 1, "resumo_financeiro", { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje });
    stopReason = "tool_use";
    saida = 40;
  } else {
    const texto = `${MARCA_DA_RESPOSTA}: sem consultar ferramentas. Isto é uma resposta simulada, só para testes.`;
    await blocoDeTexto(res, 0, texto);
    saida = Math.round(texto.length / 4);
  }

  enviarEvento(res, "message_delta", {
    delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null, container: null },
    usage: {
      input_tokens: entrada,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: Math.max(1, saida),
      server_tool_use: null,
    },
  });
  enviarEvento(res, "message_stop", {});
  res.end();
}

// ---------- servidor --------------------------------------------------------

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://falso");
  if (req.method === "GET" && url.pathname === "/__saude") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/__pedidos") return json(res, 200, pedidos);
  if (req.method === "POST" && url.pathname === "/__limpar") {
    pedidos.length = 0;
    return json(res, 200, { ok: true });
  }
  if (req.method !== "POST" || url.pathname !== "/v1/messages") {
    return erroApi(res, 404, "not_found_error", `Rota ${req.method} ${url.pathname} não existe no servidor falso.`);
  }
  if (!req.headers["x-api-key"] && !req.headers.authorization) {
    return erroApi(res, 401, "authentication_error", "x-api-key header is required");
  }

  let bruto = "";
  for await (const pedaco of req) bruto += pedaco;
  let corpo;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return erroApi(res, 400, "invalid_request_error", "Corpo não é JSON.");
  }
  if (!corpo.model || !Array.isArray(corpo.messages) || corpo.messages.length === 0 || !corpo.max_tokens) {
    return erroApi(res, 400, "invalid_request_error", "model, max_tokens e messages são obrigatórios.");
  }

  pedidos.push({
    em: new Date().toISOString(),
    stream: Boolean(corpo.stream),
    beta: req.headers["anthropic-beta"] ?? null,
    model: corpo.model,
    ferramentas: (corpo.tools ?? []).map((t) => t.name),
    formato: corpo.output_config?.format?.type ?? null,
    mensagens: corpo.messages.length,
    ultima: corpo.messages.at(-1),
  });
  if (pedidos.length > 200) pedidos.shift();

  try {
    if (corpo.stream) await responderAssistente(res, corpo);
    else responderClassificacao(res, corpo);
  } catch (erro) {
    if (!res.headersSent) erroApi(res, 500, "api_error", String(erro));
    else res.end();
  }
});

servidor.listen(PORTA, HOST, () => console.log(`API falsa da Anthropic em http://${HOST}:${PORTA}`));
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => servidor.close(() => process.exit(0)));
