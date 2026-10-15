import { z } from "zod";

/**
 * Protocolo entre a tela do assistente e POST /api/assistente: o corpo do
 * pedido e os eventos NDJSON (um JSON por linha) da resposta. Serve aos dois
 * lados, por isso não importa nada do servidor.
 */

export const TAMANHO_MAXIMO_DA_PERGUNTA = 2000;

export const esquemaPedidoAoAssistente = z.object({
  conversaId: z.uuid("Conversa inválida.").optional(),
  pergunta: z
    .string("Escreva a sua pergunta.")
    .trim()
    .min(1, "Escreva a sua pergunta.")
    .max(TAMANHO_MAXIMO_DA_PERGUNTA, `A pergunta pode ter até ${TAMANHO_MAXIMO_DA_PERGUNTA} caracteres.`),
});

export type PedidoAoAssistente = z.infer<typeof esquemaPedidoAoAssistente>;

/**
 * A pergunta que chega pelo link (/app/assistente?pergunta=…, usado pelo
 * painel): só texto, sem espaços sobrando e no tamanho que a rota aceita. Ela
 * só preenche o campo; enviar continua sendo decisão de quem lê (gasta franquia).
 */
export function perguntaDoLink(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpa = valor.trim().slice(0, TAMANHO_MAXIMO_DA_PERGUNTA).trim();
  return limpa || null;
}

export type FonteDaResposta = { url: string; titulo: string | null };

/** O que a tela recebe de uma conversa gravada: só o texto visível, nunca o conteúdo bruto da API. */
export type MensagemDaTela = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  fontes: FonteDaResposta[];
};

export type ConversaDaLista = { id: string; titulo: string; atualizadaEm: string };

export type CotaDoAssistente = { usados: number; limite: number };

export type EventoAssistente =
  | { tipo: "inicio"; conversaId: string; titulo: string; nova: boolean }
  | { tipo: "status"; mensagem: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "fonte"; url: string; titulo: string | null }
  | { tipo: "recusa"; mensagem: string }
  | { tipo: "aviso"; mensagem: string }
  | { tipo: "erro"; codigo: string; mensagem: string }
  | { tipo: "fim"; salvo: boolean; cota: CotaDoAssistente | null };

export function codificarEvento(evento: EventoAssistente) {
  return `${JSON.stringify(evento)}\n`;
}

const TIPOS = new Set(["inicio", "status", "texto", "fonte", "recusa", "aviso", "erro", "fim"]);

function interpretarLinha(linha: string): EventoAssistente | null {
  if (!linha.trim()) return null;
  try {
    const valor = JSON.parse(linha) as { tipo?: unknown };
    return typeof valor?.tipo === "string" && TIPOS.has(valor.tipo) ? (valor as EventoAssistente) : null;
  } catch {
    return null;
  }
}

/**
 * Separa os eventos de um fluxo NDJSON que chega em pedaços quebrados em
 * qualquer ponto. Devolve os eventos completos e o resto (linha incompleta).
 */
export function separarEventos(acumulado: string): { eventos: EventoAssistente[]; resto: string } {
  const linhas = acumulado.split("\n");
  const resto = linhas.pop() ?? "";
  const eventos = linhas.map(interpretarLinha).filter((e): e is EventoAssistente => e !== null);
  return { eventos, resto };
}

/** Lê o corpo da resposta e chama `aoReceber` a cada evento, na ordem. */
export async function lerEventos(corpo: ReadableStream<Uint8Array>, aoReceber: (evento: EventoAssistente) => void) {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    const separado = separarEventos(resto + decodificador.decode(value, { stream: true }));
    resto = separado.resto;
    separado.eventos.forEach(aoReceber);
  }
  const ultimo = interpretarLinha(resto + decodificador.decode());
  if (ultimo) aoReceber(ultimo);
}
