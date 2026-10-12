import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  aceitouOAviso,
  conversaDoUsuario,
  criarConversa,
  gravarMensagens,
  historicoParaApi,
  linhasDaConversa,
  perguntasNaConversa,
} from "@/app/(app)/app/assistente/dados";
import {
  codificarEvento,
  esquemaPedidoAoAssistente,
  type CotaDoAssistente,
  type EventoAssistente,
} from "@/components/app/assistente/protocolo";
import { DIAS_SEMANA, hojeNaEmpresa, naEmpresa } from "@/lib/dates";
import {
  deveGravar,
  MAX_PERGUNTAS_POR_CONVERSA,
  rodarAssistente,
  tituloDaConversa,
  type ResultadoDoLaco,
} from "@/lib/ia/assistente";
import { iaConfigurada } from "@/lib/ia/cliente";
import { cotaDeIa, registrarUsoDeIa } from "@/lib/ia/cota";
import { executarFerramenta, ferramentasDaApi, statusDaFerramenta } from "@/lib/ia/ferramentas";
import { montarSistema, mensagemDoUsuario } from "@/lib/ia/sistema";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";

export const dynamic = "force-dynamic";
/** Pesquisa na web + várias voltas de ferramenta. O teto real depende do plano da hospedagem. */
export const maxDuration = 300;

function erro(status: number, mensagem: string, codigo?: string) {
  return Response.json({ erro: mensagem, ...(codigo ? { codigo } : {}) }, { status });
}

/** CSRF em profundidade: route handler não tem a checagem de origem das Server Actions. */
function origemConfere(request: Request) {
  const origem = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origem || !host) return false;
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

function mensagemDeCotaEsgotada(limite: number) {
  return `Você já usou as ${limite} perguntas ao assistente que o seu plano inclui neste mês. A franquia renova no dia 1º; para mais perguntas, veja os planos em Assinatura.`;
}

/**
 * POST /api/assistente { conversaId?, pergunta } → NDJSON.
 * Primeiro evento: { tipo: "inicio", conversaId }. Último: { tipo: "fim" }.
 */
export async function POST(request: Request) {
  // Checagens baratas, antes de qualquer acesso a cookies ou banco.
  if (!origemConfere(request)) return erro(403, "Origem não permitida.");
  if (!iaConfigurada()) {
    return erro(503, "O assistente ainda não foi configurado neste servidor (falta a ANTHROPIC_API_KEY).", "config");
  }
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, "Pedido inválido.");
  }
  const validado = esquemaPedidoAoAssistente.safeParse(corpo);
  if (!validado.success) return erro(400, validado.error.issues[0]?.message ?? "Pedido inválido.");
  const { pergunta, conversaId: conversaPedida } = validado.data;

  // Sessão, papel e assinatura.
  const { vinculo } = await empresaAtual();
  if (!vinculo) return erro(401, "Entre na sua conta para usar o assistente.");
  if (vinculo.papel !== "dono") return erro(403, "Só o dono usa o assistente.");
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio) return erro(403, bloqueio, "somente_leitura");

  const empresa = vinculo.empresa;
  const supabase = await createClient(); // RLS do dono, criado fora do stream
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro(401, "Entre na sua conta para usar o assistente.");

  try {
    if (!(await aceitouOAviso(supabase, empresa.id, user.id))) {
      return erro(403, "Leia e aceite o aviso de uso do assistente antes da primeira pergunta.", "consentimento");
    }
  } catch {
    return erro(500, "Não foi possível conferir o aceite do aviso. Tente de novo.");
  }

  let cota: CotaDoAssistente;
  try {
    const atual = await cotaDeIa({ supabase, empresa, recurso: "assistente" });
    if (atual.restantes <= 0) return erro(429, mensagemDeCotaEsgotada(atual.limite), "cota");
    cota = { usados: atual.usados, limite: atual.limite };
  } catch {
    return erro(500, "Não foi possível conferir a franquia de perguntas. Tente de novo.");
  }

  // Histórico SEMPRE do banco, pela conversa do próprio usuário.
  let conversaId: string;
  let titulo: string;
  let nova = false;
  let historico: Anthropic.Beta.BetaMessageParam[] = [];
  try {
    if (conversaPedida) {
      const conversa = await conversaDoUsuario(supabase, empresa.id, user.id, conversaPedida);
      if (!conversa) return erro(404, "Conversa não encontrada. Comece uma nova conversa.");
      const linhas = await linhasDaConversa(supabase, empresa.id, conversa.id);
      if (perguntasNaConversa(linhas) >= MAX_PERGUNTAS_POR_CONVERSA) {
        return erro(409, "Esta conversa ficou longa. Comece uma nova conversa para continuar.", "conversa_longa");
      }
      conversaId = conversa.id;
      titulo = conversa.title;
      historico = historicoParaApi(linhas);
    } else {
      titulo = tituloDaConversa(pergunta);
      conversaId = await criarConversa(supabase, { empresaId: empresa.id, userId: user.id, titulo });
      nova = true;
    }
  } catch {
    return erro(500, "Não foi possível abrir a conversa. Tente de novo.");
  }

  const hoje = hojeNaEmpresa(empresa.timezone);
  const diaDaSemana = DIAS_SEMANA[naEmpresa(new Date(), empresa.timezone).getDay()].nome.toLowerCase();
  const mensagemNova: Anthropic.Beta.BetaMessageParam = {
    role: "user",
    content: [{ type: "text", text: mensagemDoUsuario(pergunta, hoje, diaDaSemana, empresa.timezone) }],
  };
  const ctx = { supabase, empresa, hoje };

  const codificador = new TextEncoder();
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (evento: EventoAssistente) => {
        try {
          controller.enqueue(codificador.encode(codificarEvento(evento)));
        } catch {
          // o navegador já fechou a conexão
        }
      };
      // O primeiro pedaço libera os cabeçalhos: o fetch do navegador destrava aqui.
      emitir({ tipo: "inicio", conversaId, titulo, nova });

      let resultado: ResultadoDoLaco = { desfecho: "erro", novas: [], usos: [], chamadas: 0 };
      let salvo = false;
      try {
        resultado = await rodarAssistente({
          sistema: montarSistema(empresa),
          ferramentas: ferramentasDaApi(empresa),
          historico: [...historico, mensagemNova],
          executar: (bloco) => executarFerramenta(bloco, ctx),
          statusDe: statusDaFerramenta,
          emitir,
          signal: request.signal,
        });

        if (deveGravar(resultado.desfecho)) {
          await gravarMensagens(supabase, {
            empresaId: empresa.id,
            conversaId,
            pergunta: { mensagem: mensagemNova, texto: pergunta },
            novas: resultado.novas,
          });
          salvo = true;
        } else if (nova) {
          // Nada gravado numa conversa recém-criada: ela não fica vazia na lista.
          await supabase.from("ai_conversations").delete().eq("id", conversaId).eq("user_id", user.id);
        }
      } catch {
        emitir({ tipo: "erro", codigo: "gravar", mensagem: "A resposta não pôde ser gravada. Tente de novo." });
      }

      // Conta a pergunta sempre que a API foi acionada e respondeu (ou foi parada no meio).
      const gastou =
        resultado.usos.length > 0 || (resultado.desfecho === "cancelado" && resultado.chamadas > 0);
      let cotaFinal: CotaDoAssistente | null = cota;
      if (gastou) {
        try {
          await registrarUsoDeIa({
            supabase,
            empresaId: empresa.id,
            userId: user.id,
            recurso: "assistente",
            usage: resultado.usos.length > 0 ? resultado.usos : { input_tokens: 0, output_tokens: 0 },
          });
          cotaFinal = { usados: cota.usados + 1, limite: cota.limite };
        } catch {
          cotaFinal = null;
        }
      }

      emitir({ tipo: "fim", salvo, cota: cotaFinal });
      try {
        controller.close();
      } catch {
        // já fechado
      }
    },
  });

  return new Response(fluxo, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
