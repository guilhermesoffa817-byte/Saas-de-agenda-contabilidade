import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Sugerir classificação" de ponta a ponta, com o banco e a API falsos:
 * - a regra grava source 'regra' (não mais 'ia' com prefixo);
 * - a franquia é reservada no banco ANTES da IA e os tokens são gravados depois,
 *   sem insert direto em ai_usage_logs (revogado na 0015);
 * - despesa ligada a cliente não leva descrição e nomes conhecidos não saem.
 */
type Operacao = { tipo: string; tabela?: string; dados?: unknown; momento: number };

const estado = vi.hoisted(() => ({
  momento: 0,
  operacoes: [] as Operacao[],
  transacoes: [] as unknown[],
  parse: null as unknown as ReturnType<typeof vi.fn>,
  franquiaAcabou: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({
    vinculo: {
      papel: "dono",
      empresa: { id: "org-1", plan: "essencial", timezone: "America/Sao_Paulo" },
    },
    vinculos: [],
  }),
  garantirEscrita: () => null,
  usuarioAtual: async () => ({ id: "user-1" }),
}));

vi.mock("@/lib/ia/cliente", async (original) => {
  const real = await original<typeof import("@/lib/ia/cliente")>();
  estado.parse = vi.fn();
  return {
    ...real,
    iaConfigurada: () => true,
    anthropic: () => ({ beta: { messages: { parse: estado.parse } } }),
  };
});

const NOMES: Record<string, { name: string }[]> = {
  professionals: [{ name: "Juliana Souza" }],
  staff_members: [{ name: "Rafael Lima" }],
  clients: [{ name: "Maria Fernanda Lima" }],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc(funcao: string, argumentos: Record<string, unknown>) {
      estado.operacoes.push({ tipo: `rpc:${funcao}`, dados: argumentos, momento: ++estado.momento });
      if (funcao === "reservar_uso_de_ia" && estado.franquiaAcabou) {
        return Promise.resolve({ data: null, error: { message: "A franquia de IA deste mês acabou.", details: "0" } });
      }
      if (funcao === "reservar_uso_de_ia") {
        const unidades = argumentos.p_unidades as number;
        return Promise.resolve({ data: Array.from({ length: unidades }, (_, i) => 500 + i), error: null });
      }
      if (funcao === "atualizar_uso_de_ia") return Promise.resolve({ data: 1, error: null });
      return Promise.resolve({ data: null, error: { message: `rpc inesperada: ${funcao}` } });
    },
    from(tabela: string) {
      if (tabela === "ai_usage_logs") throw new Error("insert direto em ai_usage_logs é revogado");
      let faixa: [number, number] | null = null;
      const construtor = {
        select: () => construtor,
        eq: () => construtor,
        in: () => construtor,
        gte: () => construtor,
        lte: () => construtor,
        order: () => construtor,
        range(de: number, ate: number) {
          faixa = [de, ate];
          return construtor;
        },
        upsert(dados: unknown) {
          estado.operacoes.push({ tipo: "upsert", tabela, dados, momento: ++estado.momento });
          return Promise.resolve({ error: null });
        },
        then(resolver: (r: { data: unknown[]; error: null }) => unknown) {
          const linhas = tabela === "transactions" ? estado.transacoes : (NOMES[tabela] ?? []);
          const pagina = faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas;
          return Promise.resolve({ data: pagina, error: null }).then(resolver);
        },
      };
      return construtor;
    },
  }),
}));

const { sugerirClassificacao } = await import("./acoes");

let sequencia = 0;
function transacao(description: string, extra: Record<string, unknown> = {}) {
  sequencia += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequencia).padStart(12, "0")}`,
    kind: "despesa",
    description,
    amount_cents: 15_000 + sequencia,
    paid_at: "2026-10-08",
    payment_method: "pix",
    appointment_id: null,
    client_id: null,
    category_id: "cat-outras",
    categories: { name: "Outras despesas", report_group: "operacional", cost_behavior: null },
    transaction_cost_overrides: null,
    ...extra,
  };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-teste";
  estado.momento = 0;
  estado.operacoes = [];
  estado.franquiaAcabou = false;
  estado.parse.mockReset();
});

describe("sugerirClassificacao", () => {
  it("regra grava 'regra'; a IA vem depois da reserva; cliente e nomes não saem do servidor", async () => {
    const aluguel = transacao("Aluguel da sala 204");
    const reembolso = transacao("Reembolso sinal — Maria Fernanda Lima", { client_id: "cli-1" });
    const vale = transacao("Vale para Rafael Lima");
    estado.transacoes = [aluguel, reembolso, vale];

    estado.parse.mockImplementation(async (pedido: { messages: { content: string }[] }) => {
      estado.operacoes.push({ tipo: "api", dados: pedido, momento: ++estado.momento });
      const { despesas } = JSON.parse(pedido.messages[0]!.content) as { despesas: { id: string }[] };
      return {
        stop_reason: "end_turn",
        parsed_output: {
          itens: despesas.map((d) => ({ id: d.id, natureza: "nao_operacional", motivo: "Não é da operação." })),
        },
        usage: { input_tokens: 300, output_tokens: 40, cache_creation_input_tokens: 0 },
      };
    });

    const resposta = await sugerirClassificacao("2026-10");

    expect(resposta.erro).toBeUndefined();
    expect(resposta.aviso).toBe("1 despesa classificada por regra e 2 sugestões da IA.");

    const [porRegra, porIa] = estado.operacoes.filter((o) => o.tipo === "upsert");
    expect(porRegra!.dados).toEqual([
      expect.objectContaining({
        transaction_id: aluguel.id,
        source: "regra",
        reason: "Aluguel se paga todo mês, com ou sem atendimento.",
      }),
    ]);
    expect((porIa!.dados as { source: string }[]).map((d) => d.source)).toEqual(["ia", "ia"]);

    const reserva = estado.operacoes.find((o) => o.tipo === "rpc:reservar_uso_de_ia")!;
    const api = estado.operacoes.find((o) => o.tipo === "api")!;
    const atualizacao = estado.operacoes.find((o) => o.tipo === "rpc:atualizar_uso_de_ia")!;
    expect(reserva.dados).toMatchObject({ p_org: "org-1", p_feature: "classificacao", p_unidades: 2 });
    expect(reserva.momento).toBeLessThan(api.momento);
    expect(atualizacao.momento).toBeGreaterThan(api.momento);
    expect(atualizacao.dados).toMatchObject({ p_ids: [500, 501], p_input: 300, p_output: 40 });

    const enviado = (api.dados as { messages: { content: string }[] }).messages[0]!.content;
    for (const trecho of ["Maria", "Fernanda", "Rafael", "Lima", "Reembolso"]) expect(enviado).not.toContain(trecho);
    expect(enviado).toContain("Vale para [nome]");
  });

  it("franquia esgotada: não chama a IA e avisa", async () => {
    estado.transacoes = [transacao("Lavanderia")];
    estado.franquiaAcabou = true;

    const resposta = await sugerirClassificacao("2026-10");

    expect(estado.parse).not.toHaveBeenCalled();
    expect(resposta.aviso).toBe("1 despesa ficou sem classificação: a franquia de IA do mês acabou.");
  });
});
