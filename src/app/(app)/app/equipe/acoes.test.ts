import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ações da Equipe com o banco falso. Cobre:
 * - achado 26: desligar (último dia até hoje) ou remover desativa o profissional
 *   ligado na agenda; último dia no futuro só avisa;
 * - achado 9: a sugestão do pagamento é recalculada com a base do mês de
 *   referência escolhido, não do mês aberto na página;
 * - achados 4/31: o aviso da remoção diz o que a 0015 apaga;
 * - achado 33: a troca de vínculo recusada pelo banco vira instrução clara.
 */
type Operacao = {
  tabela: string;
  acao: "select" | "update" | "insert" | "upsert" | "delete" | "rpc";
  dados?: unknown;
  colunas?: string;
  filtros: [string, string, unknown][];
};

type Resultado = { data: unknown; error: { message: string; code?: string } | null };

const estado = vi.hoisted(() => ({
  operacoes: [] as Operacao[],
  responder: (() => ({ data: null, error: null })) as (op: Operacao) => Resultado,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({
    vinculo: {
      papel: "dono",
      empresa: { id: "org-1", plan: "essencial", timezone: "America/Sao_Paulo", segment: "salao" },
    },
    vinculos: [],
  }),
  garantirEscrita: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    function construtor(tabela: string) {
      const op: Operacao = { tabela, acao: "select", filtros: [] };
      let registrada = false;
      const registrar = () => {
        if (!registrada) estado.operacoes.push(op);
        registrada = true;
      };
      const resolver = () => {
        registrar();
        return Promise.resolve(estado.responder(op));
      };
      const b: Record<string, unknown> = {
        select(colunas?: string) {
          if (op.acao === "select") op.colunas = colunas;
          else op.colunas = `${op.colunas ?? ""}|retorno:${colunas}`;
          return b;
        },
        update(dados: unknown) {
          op.acao = "update";
          op.dados = dados;
          return b;
        },
        insert(dados: unknown) {
          op.acao = "insert";
          op.dados = dados;
          return b;
        },
        upsert(dados: unknown) {
          op.acao = "upsert";
          op.dados = dados;
          return resolver();
        },
        delete() {
          op.acao = "delete";
          return b;
        },
        eq(coluna: string, valor: unknown) {
          op.filtros.push(["eq", coluna, valor]);
          return b;
        },
        in(coluna: string, valor: unknown) {
          op.filtros.push(["in", coluna, valor]);
          return b;
        },
        not(coluna: string, _op: string, valor: unknown) {
          op.filtros.push(["not", coluna, valor]);
          return b;
        },
        gte(coluna: string, valor: unknown) {
          op.filtros.push(["gte", coluna, valor]);
          return b;
        },
        lte(coluna: string, valor: unknown) {
          op.filtros.push(["lte", coluna, valor]);
          return b;
        },
        order: () => b,
        maybeSingle: resolver,
        single: resolver,
        then(ok: (valor: Resultado) => unknown, falha?: (erro: unknown) => unknown) {
          return resolver().then(ok, falha);
        },
      };
      return b;
    }
    return {
      from: (tabela: string) => construtor(tabela),
      rpc(funcao: string, argumentos: unknown) {
        const op: Operacao = { tabela: funcao, acao: "rpc", dados: argumentos, filtros: [] };
        estado.operacoes.push(op);
        return Promise.resolve(estado.responder(op));
      },
    };
  },
}));

const { desligarColaborador, removerColaborador, salvarColaborador, sugestoesDePagamento } =
  await import("./acoes");

const COLABORADOR = "11111111-1111-4111-8111-111111111111";
const PROFISSIONAL = "22222222-2222-4222-8222-222222222222";

const desativacoes = () =>
  estado.operacoes.filter((op) => op.tabela === "professionals" && op.acao === "update");

beforeEach(() => {
  estado.operacoes = [];
  estado.responder = () => ({ data: null, error: null });
});

describe("desligar tira a pessoa da agenda online (achado 26)", () => {
  function banco({ profissional = PROFISSIONAL as string | null, ativo = true } = {}) {
    estado.responder = (op) => {
      if (op.tabela === "staff_members" && op.acao === "select") {
        return {
          data: { started_on: "2019-03-01", anonymized_at: null, professional_id: profissional },
          error: null,
        };
      }
      if (op.tabela === "professionals" && op.acao === "update") {
        return { data: ativo ? [{ name: "Juliana Prado" }] : [], error: null };
      }
      if (op.tabela === "professionals" && op.acao === "select") {
        return { data: { name: "Juliana Prado", active: ativo }, error: null };
      }
      return { data: null, error: null };
    };
  }

  it("último dia já passou: desativa o profissional ligado e avisa", async () => {
    banco();
    const resposta = await desligarColaborador({ colaboradorId: COLABORADOR, fim: "2020-10-10" });

    expect(resposta.erro).toBeUndefined();
    const [desativacao] = desativacoes();
    expect(desativacao?.dados).toEqual({ active: false });
    expect(desativacao?.filtros).toContainEqual(["eq", "id", PROFISSIONAL]);
    expect(desativacao?.filtros).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(resposta.aviso).toContain("Juliana Prado");
    expect(resposta.aviso).toContain("não recebe mais agendamentos online");
  });

  it("último dia no futuro: não desativa ainda, mas explica que precisará desativar", async () => {
    banco();
    const resposta = await desligarColaborador({ colaboradorId: COLABORADOR, fim: "2099-12-20" });

    expect(desativacoes()).toHaveLength(0);
    expect(resposta.aviso).toContain("continua recebendo agendamentos online");
    expect(resposta.aviso).toContain("20/12/2099");
    expect(resposta.aviso).toContain("Serviços e equipe");
  });

  it("sem profissional ligado, não mexe na agenda", async () => {
    banco({ profissional: null });
    const resposta = await desligarColaborador({ colaboradorId: COLABORADOR, fim: "2020-10-10" });

    expect(estado.operacoes.some((op) => op.tabela === "professionals")).toBe(false);
    expect(resposta.aviso).toBe("Desligamento registrado.");
  });

  it("último dia preenchido pela edição do cadastro também desativa", async () => {
    estado.responder = (op) => {
      if (op.tabela === "staff_members" && op.acao === "select" && op.colunas?.startsWith("contract")) {
        return { data: { contract: "parceria", anonymized_at: null, ended_on: null }, error: null };
      }
      if (op.tabela === "professionals" && op.acao === "update") {
        return { data: [{ name: "Juliana Prado" }], error: null };
      }
      return { data: null, error: null };
    };
    const resposta = await salvarColaborador({
      colaboradorId: COLABORADOR,
      nome: "Juliana Prado Souza",
      cargo: "Cabeleireira",
      contrato: "parceria",
      inicio: "2019-03-01",
      fim: "2020-10-10",
      profissionalId: PROFISSIONAL,
      fixoCents: 0,
      percentual: "40",
      porAtendimentoCents: 0,
      dadosPessoais: { documento: "", pix: "", telefone: "", email: "", observacoes: "" },
    });

    expect(resposta.erro).toBeUndefined();
    expect(desativacoes()).toHaveLength(1);
    expect(resposta.aviso).toContain("não recebe mais agendamentos online");
  });
});

describe("remover (achados 26, 4 e 31)", () => {
  function banco(resultado: "removido" | "anonimizado") {
    estado.responder = (op) => {
      if (op.tabela === "staff_members" && op.acao === "select") {
        return { data: { professional_id: PROFISSIONAL }, error: null };
      }
      if (op.acao === "rpc") return { data: resultado, error: null };
      if (op.tabela === "professionals" && op.acao === "update") {
        return { data: [{ name: "Juliana Prado" }], error: null };
      }
      return { data: null, error: null };
    };
  }

  it("lê a ligação com a agenda antes da remoção (que a apaga) e desativa o profissional depois", async () => {
    banco("anonimizado");
    const resposta = await removerColaborador(COLABORADOR);

    const ordem = estado.operacoes.map((op) => `${op.tabela}:${op.acao}`);
    expect(ordem).toEqual([
      "staff_members:select",
      "remover_colaborador:rpc",
      "professionals:update",
    ]);
    expect(desativacoes()[0]?.filtros).toContainEqual(["eq", "id", PROFISSIONAL]);
    expect(resposta.aviso).toContain("não recebe mais agendamentos online");
  });

  it("o aviso da anonimização conta o que a 0015 apaga de fato", async () => {
    banco("anonimizado");
    const { aviso } = await removerColaborador(COLABORADOR);

    expect(aviso).toContain("ausências");
    expect(aviso).toContain("ligação com a agenda");
    expect(aviso).toContain("Ex-colaborador");
    expect(aviso).toContain("sem o nome");
  });

  it("sem pagamento, a pessoa some por completo", async () => {
    banco("removido");
    const { aviso } = await removerColaborador(COLABORADOR);
    expect(aviso).toMatch(/^Colaborador removido, com as ausências/);
  });

  it("erro na remoção não desativa nada", async () => {
    estado.responder = (op) =>
      op.acao === "rpc" ? { data: null, error: { message: "Sem permissão." } } : { data: null, error: null };
    const resposta = await removerColaborador(COLABORADOR);
    expect(resposta.erro).toBe("Sem permissão.");
    expect(desativacoes()).toHaveLength(0);
  });
});

describe("troca de vínculo recusada pelo banco (achado 33)", () => {
  it("vira instrução clara: desligar e cadastrar de novo", async () => {
    estado.responder = (op) => {
      if (op.tabela === "staff_members" && op.acao === "select") {
        return { data: { contract: "clt", anonymized_at: null, ended_on: null }, error: null };
      }
      if (op.tabela === "staff_members" && op.acao === "update") {
        return {
          data: null,
          error: {
            code: "P0001",
            message:
              "Esta pessoa já tem férias, faltas, salário ou outros registros de emprego. Para o novo vínculo, registre o desligamento deste cadastro e cadastre a pessoa de novo, como outro colaborador.",
          },
        };
      }
      return { data: null, error: null };
    };
    const resposta = await salvarColaborador({
      colaboradorId: COLABORADOR,
      nome: "Rafael Lima",
      cargo: "",
      contrato: "pj",
      inicio: "2024-02-01",
      fim: "",
      profissionalId: "",
      fixoCents: 0,
      percentual: "",
      porAtendimentoCents: 0,
      dadosPessoais: { documento: "", pix: "", telefone: "", email: "", observacoes: "" },
    });

    expect(resposta.erro).toContain("não pode virar parceria, MEI, PJ ou autônomo");
    expect(resposta.erro).toContain("Registre o desligamento");
    // Nada de seguir gravando dados pessoais depois da recusa.
    expect(estado.operacoes.some((op) => op.tabela === "staff_private")).toBe(false);
  });
});

describe("sugestão do pagamento acompanha o mês de referência (achado 9)", () => {
  it("usa a base do mês escolhido, não a do mês aberto na página", async () => {
    estado.responder = (op) => {
      if (op.tabela === "staff_members") {
        return {
          data: [
            {
              id: COLABORADOR,
              name: "Juliana Prado Souza",
              job_title: "Cabeleireira",
              contract: "parceria",
              started_on: "2025-01-06",
              ended_on: null,
              professional_id: PROFISSIONAL,
              base_pay_cents: 0,
              commission_bps: 4000,
              per_service_cents: 0,
              anonymized_at: null,
            },
          ],
          error: null,
        };
      }
      if (op.tabela === "base_de_comissao") {
        const { p_mes } = op.dados as { p_mes: string };
        // Setembro inteiro: R$ 12.000,00. Outubro até o dia 5: R$ 800,00.
        return { data: p_mes === "2026-09-01" ? 1_200_000 : 80_000, error: null };
      }
      return { data: null, error: null };
    };

    const resposta = await sugestoesDePagamento("2026-09");

    const chamada = estado.operacoes.find((op) => op.tabela === "base_de_comissao");
    expect(chamada?.dados).toEqual({ p_staff: COLABORADOR, p_mes: "2026-09-01" });
    expect(resposta.dados?.[COLABORADOR]?.percentualCents).toBe(480_000); // 40% de R$ 12.000,00
  });

  it("quem não trabalhou no mês escolhido vem zerado", async () => {
    estado.responder = (op) =>
      op.tabela === "staff_members"
        ? {
            data: [
              {
                id: COLABORADOR,
                name: "Rafael Lima",
                job_title: null,
                contract: "clt",
                started_on: "2026-10-01",
                ended_on: null,
                professional_id: null,
                base_pay_cents: 190_000,
                commission_bps: 0,
                per_service_cents: 0,
                anonymized_at: null,
              },
            ],
            error: null,
          }
        : { data: null, error: null };

    const resposta = await sugestoesDePagamento("2026-09");
    expect(resposta.dados?.[COLABORADOR]?.totalCents).toBe(0);
  });

  it("recusa mês fora do formato", async () => {
    const resposta = await sugestoesDePagamento("09/2026");
    expect(resposta.erro).toBe("Escolha o mês de referência.");
    expect(estado.operacoes).toHaveLength(0);
  });
});
