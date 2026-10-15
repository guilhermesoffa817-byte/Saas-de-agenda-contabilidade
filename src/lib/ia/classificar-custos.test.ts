import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DespesaParaCusto } from "@/lib/custos/calculo";

const ordem: string[] = [];
const parse = vi.fn();
const reservarUsoDeIa = vi.fn();
const atualizarUsoDeIa = vi.fn();
const cancelarUsoDeIa = vi.fn();

vi.mock("./cliente", async (original) => {
  const real = await original<typeof import("./cliente")>();
  return { ...real, anthropic: () => ({ beta: { messages: { parse } } }) };
});

vi.mock("./cota", () => ({ reservarUsoDeIa, atualizarUsoDeIa, cancelarUsoDeIa }));

const {
  chaveDaDescricao,
  classificarComFranquia,
  classificarLote,
  descricoesAnteriores,
  DESCRICAO_DE_DESPESA_COM_CLIENTE,
  emLotes,
  interpretarResposta,
  montarLote,
  nomesParaOcultar,
  SISTEMA_DA_CLASSIFICACAO,
  TAMANHO_DO_LOTE,
} = await import("./classificar-custos");

let sequencia = 0;
function despesa(dados: Partial<DespesaParaCusto> = {}): DespesaParaCusto {
  sequencia += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequencia).padStart(12, "0")}`,
    descricao: "Lavanderia",
    valorCents: 12_345,
    pagoEm: "2026-10-10",
    formaDePagamento: "pix",
    categoria: "Outras despesas",
    categoriaId: "cat",
    grupo: "operacional",
    naturezaDaCategoria: null,
    excecao: null,
    ...dados,
  };
}

beforeEach(() => {
  ordem.length = 0;
  parse.mockReset();
  reservarUsoDeIa.mockReset();
  atualizarUsoDeIa.mockReset();
  cancelarUsoDeIa.mockReset();
});

describe("montarLote", () => {
  it("limpa dado pessoal, não manda id do banco e marca recorrência", () => {
    const a = despesa({
      descricao: "Reembolso para Ana — CPF 123.456.789-09, ana@exemplo.com.br",
      categoria: "Outras despesas",
    });
    const b = despesa({ descricao: "Lavanderia — outubro", grupo: null, formaDePagamento: null });
    const anteriores = descricoesAnteriores(
      [{ descricao: "Lavanderia — setembro", pagoEm: "2026-09-12" }],
      "2026-10",
    );

    const { itens, idPorNumero } = montarLote([a, b], anteriores);

    expect(itens[0]).toEqual({
      id: "1",
      descricao: "Reembolso para Ana — CPF [cpf], [e-mail]",
      categoria: "Outras despesas",
      grupo_no_relatorio: "operacional",
      valor_cents: 12_345,
      valor: expect.stringMatching(/^R\$\s123,45$/),
      forma_de_pagamento: "pix",
      repete_em_meses_anteriores: false,
    });
    expect(itens[1]).toMatchObject({ id: "2", grupo_no_relatorio: "operacional", repete_em_meses_anteriores: true });
    expect(JSON.stringify(itens)).not.toContain(a.id);
    expect(idPorNumero.get("1")).toBe(a.id);
    expect(idPorNumero.get("2")).toBe(b.id);
  });

  it("despesa ligada a cliente não leva a descrição; nomes conhecidos viram [nome]", () => {
    const doCliente = despesa({ descricao: "Reembolso sinal — Maria Fernanda Lima", clienteId: "cli-1" });
    const vale = despesa({ descricao: "Vale para Rafael Lima" });
    const bonus = despesa({ descricao: "Bônus — Juliana S.", categoria: "Gratificação da Juliana" });

    const { itens } = montarLote([doCliente, vale, bonus], new Set(), [
      "Maria Fernanda Lima",
      "Rafael Lima",
      "Juliana Souza",
    ]);

    expect(itens[0]!.descricao).toBe(DESCRICAO_DE_DESPESA_COM_CLIENTE);
    expect(itens[1]!.descricao).toBe("Vale para [nome]");
    expect(itens[2]!.descricao).toBe("Bônus — [nome] S.");
    expect(itens[2]!.categoria).toBe("Gratificação da [nome]");
    const enviado = JSON.stringify(itens);
    for (const nome of ["Maria", "Fernanda", "Rafael", "Lima", "Juliana"]) expect(enviado).not.toContain(nome);
  });
});

describe("nomesParaOcultar", () => {
  type Resposta = { data: { name: string }[] | null; error: { message: string } | null };
  function clienteFalso(respostas: Record<string, Resposta>) {
    const consultas: { tabela: string; ids?: string[] }[] = [];
    return {
      consultas,
      from(tabela: string) {
        const consulta: { tabela: string; ids?: string[] } = { tabela };
        consultas.push(consulta);
        const construtor = {
          select: () => construtor,
          eq: () => construtor,
          in(_coluna: string, ids: string[]) {
            consulta.ids = ids;
            return construtor;
          },
          then(resolver: (r: Resposta) => unknown) {
            return Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(resolver);
          },
        };
        return construtor;
      },
    };
  }

  it("junta profissionais, equipe e só os clientes ligados, em consultas curtas", async () => {
    const supabase = clienteFalso({
      professionals: { data: [{ name: "Juliana Souza" }], error: null },
      staff_members: { data: [{ name: "Rafael Lima" }], error: null },
      clients: { data: [{ name: "Maria Fernanda Lima" }], error: null },
    });
    const ids = Array.from({ length: 150 }, (_, i) => `cli-${i}`);

    const nomes = await nomesParaOcultar(supabase as never, "org", [...ids, "cli-0"]);

    expect(nomes).toEqual(expect.arrayContaining(["Juliana Souza", "Rafael Lima", "Maria Fernanda Lima"]));
    const deClientes = supabase.consultas.filter((c) => c.tabela === "clients");
    expect(deClientes.map((c) => c.ids!.length)).toEqual([100, 50]);
  });

  it("sem conseguir ler os nomes, lança (a descrição não sai do servidor)", async () => {
    const supabase = clienteFalso({ staff_members: { data: null, error: { message: "falhou" } } });
    await expect(nomesParaOcultar(supabase as never, "org", [])).rejects.toThrow(/preparar as despesas/);
  });
});

describe("recorrência", () => {
  it("ignora mês e números na comparação", () => {
    expect(chaveDaDescricao("Aluguel — Outubro/2026")).toBe(chaveDaDescricao("aluguel setembro 2026"));
  });

  it("só conta o que foi pago antes do mês", () => {
    const anteriores = descricoesAnteriores(
      [
        { descricao: "Contador", pagoEm: "2026-09-30" },
        { descricao: "Sistema", pagoEm: "2026-10-01" },
      ],
      "2026-10",
    );
    expect(anteriores.has("contador")).toBe(true);
    expect(anteriores.has("sistema")).toBe(false);
  });
});

describe("emLotes", () => {
  it("lotes de até 60", () => {
    const lotes = emLotes(Array.from({ length: 125 }, (_, i) => i));
    expect(lotes.map((l) => l.length)).toEqual([60, 60, 5]);
    expect(TAMANHO_DO_LOTE).toBe(60);
    expect(emLotes([])).toEqual([]);
  });
});

describe("interpretarResposta", () => {
  it("descarta id inventado ou repetido e corta o motivo em 200", () => {
    const mapa = new Map([
      ["1", "tx-a"],
      ["2", "tx-b"],
    ]);
    const sugestoes = interpretarResposta(
      [
        { id: "1", natureza: "fixo", motivo: "x".repeat(250) },
        { id: "1", natureza: "variavel", motivo: "repetido" },
        { id: "9", natureza: "fixo", motivo: "inventado" },
        { id: " 2 ", natureza: "nao_operacional", motivo: "   " },
      ],
      mapa,
    );
    expect(sugestoes).toEqual([
      { transacaoId: "tx-a", natureza: "fixo", motivo: "x".repeat(200) },
      { transacaoId: "tx-b", natureza: "nao_operacional", motivo: "Sugestão da IA." },
    ]);
  });
});

describe("classificarLote", () => {
  it("chama o Opus 5.5 com fallback, effort baixo e o enum do banco", async () => {
    const a = despesa();
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { itens: [{ id: "1", natureza: "variavel", motivo: "Serviço por demanda." }] },
      usage: { input_tokens: 500, output_tokens: 80 },
    });

    const resultado = await classificarLote([a], new Set());

    expect(resultado).toEqual({
      ok: true,
      sugestoes: [{ transacaoId: a.id, natureza: "variavel", motivo: "Serviço por demanda." }],
      uso: { input_tokens: 500, output_tokens: 80 },
    });
    const [pedido] = parse.mock.calls[0]!;
    expect(pedido).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SISTEMA_DA_CLASSIFICACAO,
    });
    const schema = JSON.stringify(pedido.output_config.format.schema);
    expect(schema).toContain('"enum":["fixo","variavel","nao_operacional"]');
    expect(pedido.messages[0].content).not.toContain(a.id);
  });

  it("recusa e saída vazia viram erro em português", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null, usage: {} });
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "recusa" },
    });

    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: null, usage: {} });
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "saida", repetivel: true },
    });
  });

  it("erro do SDK é traduzido, não lançado", async () => {
    parse.mockRejectedValue(new Anthropic.AnthropicError("json cortado"));
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "saida" },
    });
  });

  it("lista vazia não chama a API; lote acima de 60 é recusado", async () => {
    expect(await classificarLote([], new Set())).toMatchObject({ ok: true, sugestoes: [] });
    const grande = Array.from({ length: 61 }, () => despesa());
    expect(await classificarLote(grande, new Set())).toMatchObject({ ok: false });
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("classificarComFranquia", () => {
  const empresa = { id: "org", plan: "essencial" as const };
  const base = { supabase: {} as never, empresa, userId: "u1", anteriores: new Set<string>(), nomes: [] };
  const ok = (despesas: unknown[]) => ({
    stop_reason: "end_turn",
    parsed_output: { itens: despesas.map((_, i) => ({ id: String(i + 1), natureza: "fixo", motivo: "Mensal." })) },
    usage: { input_tokens: 100, output_tokens: 10 },
  });

  beforeEach(() => {
    reservarUsoDeIa.mockImplementation(async ({ unidades }: { unidades: number }) => {
      ordem.push(`reservar:${unidades}`);
      return { ok: true, ids: Array.from({ length: unidades }, (_, i) => 1000 + i) };
    });
    atualizarUsoDeIa.mockImplementation(async ({ ids }: { ids: number[] }) => {
      ordem.push(`atualizar:${ids.length}`);
      return true;
    });
    cancelarUsoDeIa.mockImplementation(async ({ ids }: { ids: number[] }) => {
      ordem.push(`cancelar:${ids.length}`);
      return ids.length;
    });
  });

  it("reserva uma unidade por despesa ANTES de chamar a IA e grava os tokens depois", async () => {
    const despesas = Array.from({ length: 3 }, () => despesa());
    parse.mockImplementation(async () => {
      ordem.push("api");
      return ok(despesas);
    });

    const resultado = await classificarComFranquia({ ...base, despesas, maximo: 180 });

    expect(ordem).toEqual(["reservar:3", "api", "atualizar:3"]);
    expect(reservarUsoDeIa).toHaveBeenCalledWith(
      expect.objectContaining({ empresa, recurso: "classificacao", unidades: 3 }),
    );
    expect(atualizarUsoDeIa).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [1000, 1001, 1002], usage: [{ input_tokens: 100, output_tokens: 10 }] }),
    );
    expect(resultado).toMatchObject({ enviados: 3, limitadoPelaFranquia: false, erro: null });
    expect(resultado.sugestoes).toHaveLength(3);
    expect(cancelarUsoDeIa).not.toHaveBeenCalled();
  });

  it("franquia esgotada: a IA nem é chamada", async () => {
    reservarUsoDeIa.mockResolvedValue({ ok: false, restantes: 0, mensagem: "A franquia de IA deste mês acabou." });

    const resultado = await classificarComFranquia({ ...base, despesas: [despesa()], maximo: 180 });

    expect(parse).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ enviados: 0, limitadoPelaFranquia: true, sugestoes: [] });
  });

  it("franquia que não cobre tudo: reserva o que resta e manda só essas", async () => {
    const despesas = Array.from({ length: 5 }, () => despesa());
    reservarUsoDeIa.mockResolvedValueOnce({ ok: false, restantes: 2, mensagem: "restam 2" });
    parse.mockImplementation(async (pedido: { messages: { content: string }[] }) =>
      ok(JSON.parse(pedido.messages[0]!.content).despesas),
    );

    const resultado = await classificarComFranquia({ ...base, despesas, maximo: 180 });

    expect(reservarUsoDeIa.mock.calls.map(([p]) => p.unidades)).toEqual([5, 2]);
    expect(resultado.sugestoes.map((s) => s.transacaoId)).toEqual([despesas[0]!.id, despesas[1]!.id]);
    expect(resultado).toMatchObject({ enviados: 2, limitadoPelaFranquia: true });
  });

  it("lote que a API recusou sem cobrar (limite de pedidos) volta para a franquia", async () => {
    const despesas = Array.from({ length: TAMANHO_DO_LOTE + 1 }, () => despesa());
    parse
      .mockImplementationOnce(async () => ok(despesas.slice(0, TAMANHO_DO_LOTE)))
      .mockRejectedValueOnce(new Anthropic.RateLimitError(429, undefined, "x", new Headers()));

    const resultado = await classificarComFranquia({ ...base, despesas, maximo: 180 });

    expect(cancelarUsoDeIa).toHaveBeenCalledWith({ empresaId: "org", userId: "u1", ids: [1060] });
    expect(atualizarUsoDeIa).toHaveBeenCalledTimes(1);
    expect(resultado.enviados).toBe(TAMANHO_DO_LOTE);
    expect(resultado.erro).toMatch(/Muitos pedidos/);
  });

  it("uma despesa recusada não prende o lote: divide, classifica as outras e conta o uso da recusa", async () => {
    const recusada = despesa({ descricao: "Toxina botulínica 100U" });
    const outras = [despesa({ descricao: "Lavanderia" }), despesa({ descricao: "Reforma" })];
    parse.mockImplementation(async (pedido: { messages: { content: string }[] }) => {
      const itens = JSON.parse(pedido.messages[0]!.content).despesas as { descricao: string }[];
      if (itens.some((i) => i.descricao.includes("Toxina"))) {
        return { stop_reason: "refusal", parsed_output: null, usage: { input_tokens: 50, output_tokens: 0 } };
      }
      return ok(itens);
    });

    const resultado = await classificarComFranquia({ ...base, despesas: [outras[0]!, recusada, outras[1]!], maximo: 180 });

    expect(resultado.sugestoes.map((s) => s.transacaoId).sort()).toEqual(outras.map((d) => d.id).sort());
    expect(resultado.recusadas).toEqual([recusada.id]);
    expect(resultado).toMatchObject({ enviados: 3, interrompido: false, erro: null });
    // 1 chamada do lote inteiro (recusada) + 3 partes de 1: todas as quatro contam.
    expect(parse).toHaveBeenCalledTimes(4);
    const [{ usage }] = atualizarUsoDeIa.mock.calls[0]!;
    expect(usage).toHaveLength(4);
    expect(cancelarUsoDeIa).not.toHaveBeenCalled();
  });

  it("depois do prazo de divisão, o lote recusado fica para o próximo clique (sem novas chamadas)", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null, usage: { input_tokens: 5, output_tokens: 0 } });

    const resultado = await classificarComFranquia({
      ...base,
      despesas: [despesa(), despesa()],
      maximo: 180,
      prazoParaDividirMs: -1,
    });

    expect(parse).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ interrompido: true, recusadas: [], enviados: 2 });
  });
});
