import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFalsa, fimSse, ferramentaSse, inicioSse, sse, textoSse } from "../anthropic-falsa";

/**
 * A rota inteira, com o banco e a API da Anthropic falsos: a ordem em que a
 * franquia é reservada, o system congelado na conversa, a gravação só por
 * acréscimo (public.acrescentar_mensagens_de_ia) com os bytes que foram à API,
 * a recusa de outra aba, a limpeza da conversa nova que não foi gravada e o
 * prazo total abaixo do maxDuration.
 */

const EMPRESA = {
  id: "11111111-1111-4111-8111-111111111111",
  plan: "profissional",
  timezone: "America/Cuiaba",
  segment: "salao",
  city: "Cuiabá",
  state: "MT",
  tax_regime: "mei",
  opened_on: "2021-03-10",
};
const USUARIO = "22222222-2222-4222-8222-222222222222";
const CONVERSA_NOVA = "3f0e6f2c-6a8e-4c43-9a43-4c1c1f0b9f10";
const CONVERSA_ANTIGA = "4a1e6f2c-6a8e-4c43-9a43-4c1c1f0b9f11";
const RESERVA = 41;

type Resposta = { data: unknown; error: { message: string; details?: string } | null };
type Consulta = { tabela: string; ops: [string, unknown[]][] };

const estado = vi.hoisted(() => ({
  /** Ordem do que aconteceu: "rpc:<nome>", "from:<tabela>:<op>", "api". */
  linhaDoTempo: [] as string[],
  rpc: [] as { nome: string; args: Record<string, unknown> }[],
  rpcAdmin: [] as { nome: string; args: Record<string, unknown> }[],
  consultas: [] as { tabela: string; ops: [string, unknown[]][] }[],
  respostasRpc: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  conversaExistente: null as null | { id: string; title: string; system_snapshot: string | null },
  cliente: null as unknown,
}));

function bancoFalso() {
  const from = (tabela: string) => {
    const consulta: Consulta = { tabela, ops: [] };
    estado.consultas.push(consulta);
    const construtor: Record<string, unknown> = {};
    for (const op of ["select", "insert", "delete", "update", "eq", "order", "limit", "maybeSingle", "single"]) {
      construtor[op] = (...args: unknown[]) => {
        consulta.ops.push([op, args]);
        if (op === "insert" || op === "delete" || op === "update") estado.linhaDoTempo.push(`from:${tabela}:${op}`);
        return construtor;
      };
    }
    construtor.then = (resolver: (v: Resposta) => unknown, rejeitar: (e: unknown) => unknown) => {
      const tem = (op: string) => consulta.ops.some(([o]) => o === op);
      let resposta: Resposta = { data: null, error: null };
      if (tabela === "ai_consents") resposta = { data: { accepted_at: "2026-10-01T12:00:00Z" }, error: null };
      else if (tabela === "ai_conversations" && tem("insert")) resposta = { data: { id: CONVERSA_NOVA }, error: null };
      else if (tabela === "ai_conversations" && tem("select")) resposta = { data: estado.conversaExistente, error: null };
      return Promise.resolve(resposta).then(resolver, rejeitar);
    };
    return construtor;
  };
  const rpc = (nome: string, args: Record<string, unknown>) => {
    estado.linhaDoTempo.push(`rpc:${nome}`);
    estado.rpc.push({ nome, args });
    const responder = estado.respostasRpc[nome];
    return Promise.resolve(responder ? responder(args) : { data: null, error: null });
  };
  return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: USUARIO } } }) } };
}

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({ vinculo: { papel: "dono", empresa: EMPRESA }, vinculos: [] }),
  garantirEscrita: () => null,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => bancoFalso() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      estado.linhaDoTempo.push(`admin:${nome}`);
      estado.rpcAdmin.push({ nome, args });
      return { data: Array.isArray(args.p_ids) ? args.p_ids.length : 0, error: null };
    },
  }),
}));
vi.mock("@/lib/ia/cliente", async (original) => ({
  ...(await original<typeof import("@/lib/ia/cliente")>()),
  anthropic: () => estado.cliente,
}));

const { maxDuration, POST, PRAZO_DA_PERGUNTA_MS } = await import("@/app/api/assistente/route");
const { montarSistema } = await import("@/lib/ia/sistema");

const originais = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-teste";
  estado.linhaDoTempo = [];
  estado.rpc = [];
  estado.rpcAdmin = [];
  estado.consultas = [];
  estado.conversaExistente = null;
  estado.respostasRpc = {
    reservar_uso_de_ia: () => ({ data: [RESERVA], error: null }),
    uso_de_ia_no_mes: () => ({ data: 6, error: null }),
    atualizar_uso_de_ia: () => ({ data: 1, error: null }),
    acrescentar_mensagens_de_ia: () => ({ data: 99, error: null }),
    historico_de_ia: () => ({ data: [], error: null }),
  };
});

afterEach(() => {
  process.env = { ...originais };
  vi.restoreAllMocks();
});

function usarApi(respostas: Parameters<typeof apiFalsa>[0]) {
  const api = apiFalsa(
    respostas.map((r) => (init?: RequestInit) => {
      estado.linhaDoTempo.push("api");
      return r(init);
    }),
  );
  estado.cliente = api.cliente;
  return api;
}

function pedido(corpo: Record<string, unknown>, sinal?: AbortSignal) {
  return new Request("https://bossa.app.br/api/assistente", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://bossa.app.br", host: "bossa.app.br" },
    body: JSON.stringify(corpo),
    signal: sinal,
  });
}

async function eventos(r: Response) {
  const texto = await r.text();
  return texto
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown> & { tipo: string });
}

const rpcs = (nome: string) => estado.rpc.filter((c) => c.nome === nome);
const respostaComFerramenta = () => [
  sse([inicioSse("a"), ...ferramentaSse(0, "tu1", "resumo_financeiro", '{"inicio":"2026-09-01","fim":"2026-09-30"}'), ...fimSse("tool_use")]),
  sse([inicioSse("b"), ...textoSse(0, "Setembro fechou no azul."), ...fimSse("end_turn")]),
];

describe("POST /api/assistente — franquia, histórico e gravação", () => {
  it("conversa nova: reserva antes da 1ª chamada, congela o system, grava os tokens a cada volta e as mensagens pela função do banco", async () => {
    const api = usarApi(respostaComFerramenta());
    const r = await POST(pedido({ pergunta: "Como foi setembro?" }));
    const lista = await eventos(r);

    // Franquia reservada antes de a API ser chamada (e antes de criar a conversa).
    const t = estado.linhaDoTempo;
    expect(t.indexOf("rpc:reservar_uso_de_ia")).toBeGreaterThanOrEqual(0);
    expect(t.indexOf("rpc:reservar_uso_de_ia")).toBeLessThan(t.indexOf("api"));
    expect(t.indexOf("rpc:reservar_uso_de_ia")).toBeLessThan(t.indexOf("from:ai_conversations:insert"));
    expect(rpcs("reservar_uso_de_ia")[0].args).toMatchObject({ p_org: EMPRESA.id, p_feature: "assistente", p_unidades: 1 });

    // O system usado é gravado na criação da conversa.
    const insert = estado.consultas.find((c) => c.tabela === "ai_conversations" && c.ops.some(([o]) => o === "insert"));
    const linhaInserida = insert?.ops.find(([o]) => o === "insert")?.[1][0] as Record<string, unknown>;
    expect(linhaInserida.system_snapshot).toBe(montarSistema(EMPRESA as never));
    expect(api.corpos()[0].system).toBe(linhaInserida.system_snapshot);

    // Tokens gravados a cada volta concluída, com o total acumulado (inclusive a escrita de cache).
    const atualizacoes = rpcs("atualizar_uso_de_ia");
    expect(atualizacoes).toHaveLength(2);
    expect(atualizacoes.map((a) => a.args.p_ids)).toEqual([[RESERVA], [RESERVA]]);
    expect(atualizacoes[0].args.p_cache_creation).toBe(400);
    expect(atualizacoes[1].args.p_cache_creation).toBe(800);
    expect(t.indexOf("rpc:atualizar_uso_de_ia")).toBeLessThan(t.lastIndexOf("api"));

    // Gravação só por acréscimo, depois da última linha lida (nenhuma, numa conversa nova).
    const [gravacao] = rpcs("acrescentar_mensagens_de_ia");
    expect(gravacao.args).toMatchObject({ p_conversa: CONVERSA_NOVA, p_apos: null });
    expect(estado.consultas.some((c) => c.tabela === "ai_messages")).toBe(false);

    // Os bytes gravados são os que foram à API: pergunta, tool_use e tool_result
    // como saíram no 2º pedido, e a resposta final.
    const gravadas = gravacao.args.p_mensagens as { role: string; content: unknown; display_text: string }[];
    const enviadas = api.corpos()[1].messages as { role: string; content: unknown }[];
    expect(gravadas).toHaveLength(4);
    for (let i = 0; i < enviadas.length; i++) {
      expect(JSON.stringify({ role: gravadas[i].role, content: gravadas[i].content })).toBe(JSON.stringify(enviadas[i]));
    }
    expect(api.corposCrus[1]).toContain('"input":{"inicio":"2026-09-01","fim":"2026-09-30"}');
    expect(gravadas[0].display_text).toBe("Como foi setembro?");
    expect(gravadas[3].display_text).toBe("Setembro fechou no azul.");

    expect(estado.rpcAdmin).toEqual([]); // nada devolvido à franquia: a API foi chamada
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: true });
  });

  it("pergunta seguinte: usa o system congelado na conversa e o histórico de historico_de_ia, e grava depois da última linha lida", async () => {
    estado.conversaExistente = { id: CONVERSA_ANTIGA, title: "Como foi setembro?", system_snapshot: "SISTEMA DA CRIAÇÃO" };
    const conteudoAntigo = [{ type: "tool_use", id: "t0", name: "resumo_financeiro", input: { inicio: "2026-09-01", fim: "2026-09-30" } }];
    estado.respostasRpc.historico_de_ia = () => ({
      data: [
        { id: 7, role: "user", content: [{ type: "text", text: "Como foi setembro?" }], display_text: "Como foi setembro?" },
        { id: 8, role: "assistant", content: conteudoAntigo, display_text: "" },
        { id: 9, role: "user", content: [{ type: "tool_result", tool_use_id: "t0", content: "{}" }], display_text: "" },
        { id: 10, role: "assistant", content: [{ type: "text", text: "Fechou no azul." }], display_text: "Fechou no azul." },
      ],
      error: null,
    });
    const api = usarApi([sse([inicioSse("a"), ...textoSse(0, "Agosto foi menor."), ...fimSse("end_turn")])]);

    const lista = await eventos(await POST(pedido({ conversaId: CONVERSA_ANTIGA, pergunta: "E agosto?" })));

    const corpo = api.corpos()[0];
    expect(corpo.system).toBe("SISTEMA DA CRIAÇÃO"); // não recalcula (plano, cidade… podem ter mudado)
    expect(api.corposCrus[0]).toContain('"input":{"inicio":"2026-09-01","fim":"2026-09-30"}');
    expect(rpcs("historico_de_ia")[0].args).toEqual({ p_conversa: CONVERSA_ANTIGA });
    expect(rpcs("acrescentar_mensagens_de_ia")[0].args).toMatchObject({ p_conversa: CONVERSA_ANTIGA, p_apos: 10 });
    expect(estado.consultas.some((c) => c.tabela === "ai_messages")).toBe(false);
    expect(estado.consultas.some((c) => c.tabela === "ai_conversations" && c.ops.some(([o]) => o === "insert"))).toBe(false);
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: true });
  });

  it("outra aba gravou antes: avisa com mensagem clara e não apaga a conversa", async () => {
    estado.conversaExistente = { id: CONVERSA_ANTIGA, title: "x", system_snapshot: "S" };
    estado.respostasRpc.historico_de_ia = () => ({
      data: [{ id: 3, role: "user", content: [{ type: "text", text: "oi" }], display_text: "oi" }],
      error: null,
    });
    estado.respostasRpc.acrescentar_mensagens_de_ia = () => ({
      data: null,
      error: { message: "A conversa foi atualizada em outra aba. Recarregue a página." },
    });
    usarApi([sse([inicioSse("a"), ...textoSse(0, "Resposta."), ...fimSse("end_turn")])]);

    const lista = await eventos(await POST(pedido({ conversaId: CONVERSA_ANTIGA, pergunta: "E agora?" })));

    expect(lista).toContainEqual({
      tipo: "erro",
      codigo: "outra_aba",
      mensagem: "A conversa foi atualizada em outra aba. Recarregue a página.",
    });
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: false });
    expect(estado.linhaDoTempo).not.toContain("from:ai_conversations:delete");
  });

  it("conversa nova que não pôde ser gravada é apagada (não fica vazia na lista)", async () => {
    estado.respostasRpc.acrescentar_mensagens_de_ia = () => ({ data: null, error: { message: "falha de rede" } });
    usarApi([sse([inicioSse("a"), ...textoSse(0, "Resposta."), ...fimSse("end_turn")])]);

    const lista = await eventos(await POST(pedido({ pergunta: "Como foi setembro?" })));

    expect(lista).toContainEqual({ tipo: "erro", codigo: "gravar", mensagem: "A resposta não pôde ser gravada. Tente de novo." });
    const apagou = estado.consultas.find((c) => c.tabela === "ai_conversations" && c.ops.some(([o]) => o === "delete"));
    expect(apagou?.ops).toContainEqual(["eq", ["id", CONVERSA_NOVA]]);
    expect(apagou?.ops).toContainEqual(["eq", ["user_id", USUARIO]]);
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: false });
  });

  it("franquia esgotada: recusa sem chamar a API e sem criar conversa", async () => {
    estado.respostasRpc.reservar_uso_de_ia = () => ({
      data: null,
      error: { message: "A franquia de IA deste mês acabou.", details: "0" },
    });
    const api = usarApi([]);
    const r = await POST(pedido({ pergunta: "Como foi setembro?" }));
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ codigo: "cota" });
    expect(api.corposCrus).toHaveLength(0);
    expect(estado.linhaDoTempo).not.toContain("from:ai_conversations:insert");
  });

  it("nada chegou à API (parado antes da 1ª chamada): devolve a reserva pela chave secreta e apaga a conversa nova", async () => {
    const api = usarApi([]);
    const lista = await eventos(await POST(pedido({ pergunta: "Como foi setembro?" }, AbortSignal.abort())));

    expect(api.corposCrus).toHaveLength(0);
    expect(estado.rpcAdmin).toEqual([
      { nome: "cancelar_uso_de_ia", args: { p_ids: [RESERVA], p_org: EMPRESA.id, p_user: USUARIO } },
    ]);
    expect(rpcs("acrescentar_mensagens_de_ia")).toEqual([]);
    expect(estado.linhaDoTempo).toContain("from:ai_conversations:delete");
    // O saldo mostrado já sem a pergunta devolvida.
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: false, cota: { usados: 5 } });
  });

  it("prazo total abaixo do maxDuration: encerra com aviso e grava o que ficou completo antes do corte", async () => {
    expect(PRAZO_DA_PERGUNTA_MS).toBeLessThan(maxDuration * 1000);
    const prazo = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(prazo.signal);
    usarApi([
      respostaComFerramenta()[0],
      (init) => {
        // 2ª volta pendurada: o prazo vence no meio dela.
        setTimeout(() => prazo.abort(new DOMException("prazo", "TimeoutError")), 10);
        return new Promise<Response>((_, rejeitar) =>
          init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError"))),
        );
      },
    ]);

    const lista = await eventos(await POST(pedido({ pergunta: "Faça um relatório completo" })));

    expect(timeout).toHaveBeenCalledWith(PRAZO_DA_PERGUNTA_MS);
    expect(lista.some((e) => e.tipo === "aviso" && String(e.mensagem).includes("tempo máximo"))).toBe(true);
    const gravadas = rpcs("acrescentar_mensagens_de_ia")[0].args.p_mensagens as Anthropic.Beta.BetaMessageParam[];
    expect(gravadas.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(rpcs("atualizar_uso_de_ia")).toHaveLength(1);
    expect(estado.rpcAdmin).toEqual([]);
    expect(lista.at(-1)).toMatchObject({ tipo: "fim", salvo: true });
  });
});
