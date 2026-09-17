import { afterAll, describe, expect, it } from "vitest";

import {
  bancoDisponivel,
  comoAdmin,
  comoUsuario,
  criarAtendimento,
  criarCliente,
  criarEmpresa,
  criarProfissional,
  criarServico,
  criarUsuario,
  fecharBanco,
  sufixo,
} from "./ajuda";

const disponivel = await bancoDisponivel();

afterAll(async () => {
  await fecharBanco();
});

async function cenario() {
  const s = sufixo();
  const dono = await criarUsuario(`dono.fin.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, { nome: `Clínica ${s}`, slug: `clinica-fin-${s}` });
  const profissionalId = await criarProfissional(dono, empresaId, "Dra. Helena");
  const servicoId = await criarServico(dono, empresaId, {
    nome: "Consulta",
    duracao: 50,
    preco: 20000,
  });
  const clienteId = await criarCliente(dono, empresaId, {
    nome: "Carlos Menezes",
    telefone: `+5511${Math.floor(100000000 + Math.random() * 899999999)}`,
  });
  return { s, dono, empresaId, profissionalId, servicoId, clienteId };
}

/** Fecha um mês como o servidor faria (ignora a RLS, igual à chave secreta). */
async function fecharMes(empresaId: string, mes: string, donoId: string) {
  return comoAdmin((cliente) =>
    cliente.query(
      "insert into public.monthly_closings (organization_id, month, closed_by) values ($1, $2, $3)",
      [empresaId, mes, donoId],
    ),
  );
}

async function idDaConta(userId: string, empresaId: string, nome = "Caixa") {
  return comoUsuario(userId, async (cliente) => {
    const { rows } = await cliente.query<{ id: string }>(
      "select id from public.accounts where organization_id = $1 and name = $2",
      [empresaId, nome],
    );
    return rows[0]?.id;
  });
}

describe.skipIf(!disponivel)("0003_financeiro — contas e categorias padrão", () => {
  it("empresa nova já nasce com caixa, conta bancária e as categorias do dia a dia", async () => {
    const c = await cenario();

    const dados = await comoUsuario(c.dono, async (cliente) => {
      const contas = await cliente.query<{ name: string }>(
        "select name from public.accounts where organization_id = $1 order by name",
        [c.empresaId],
      );
      const receitas = await cliente.query<{ name: string }>(
        "select name from public.categories where organization_id = $1 and kind = 'receita' order by name",
        [c.empresaId],
      );
      const dedutiveis = await cliente.query<{ name: string }>(
        "select name from public.categories where organization_id = $1 and deductible_hint order by name",
        [c.empresaId],
      );
      return {
        contas: contas.rows.map((linha) => linha.name),
        receitas: receitas.rows.map((linha) => linha.name),
        dedutiveis: dedutiveis.rows.map((linha) => linha.name),
      };
    });

    expect(dados.contas).toEqual(["Caixa", "Conta bancária"]);
    expect(dados.receitas).toContain("Atendimentos");
    // A sugestão de dedutível segue a lista do Livro-Caixa; o contador confirma.
    expect(dados.dedutiveis).toContain("Aluguel do espaço");
    expect(dados.dedutiveis).toContain("Salários e encargos");
    expect(dados.dedutiveis).toContain("Conselho de classe e sindicato");
    expect(dados.dedutiveis).not.toContain("Retirada do dono");
    expect(dados.dedutiveis).not.toContain("Marketing");
  });
});

describe.skipIf(!disponivel)("concluir_atendimento — o dinheiro entra sem digitar de novo", () => {
  it("conclui o atendimento e cria o recebimento já pago", async () => {
    const c = await cenario();
    const conta = await idDaConta(c.dono, c.empresaId);
    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-05T13:00:00Z",
      fim: "2026-10-05T13:50:00Z",
      preco: 20000,
    });

    const lancamento = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ concluir_atendimento: string }>(
        "select public.concluir_atendimento($1, 'pix', $2, $3)",
        [atendimento, 20000, conta],
      );
      return rows[0].concluir_atendimento;
    });

    const resultado = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query(
        `select t.kind, t.status, t.amount_cents, t.description, t.payment_method, t.paid_at,
                t.competence_date, t.client_id, t.payer_type, t.account_id,
                cat.name as categoria, a.status as status_atendimento
           from public.transactions t
           join public.appointments a on a.id = t.appointment_id
           left join public.categories cat on cat.id = t.category_id
          where t.id = $1`,
        [lancamento],
      );
      return rows[0];
    });

    expect(resultado.kind).toBe("receita");
    expect(resultado.status).toBe("pago");
    expect(Number(resultado.amount_cents)).toBe(20000);
    expect(resultado.description).toContain("Consulta");
    expect(resultado.description).toContain("Carlos Menezes");
    expect(resultado.payment_method).toBe("pix");
    expect(resultado.paid_at).not.toBeNull();
    expect(resultado.categoria).toBe("Atendimentos");
    expect(resultado.client_id).toBe(c.clienteId);
    expect(resultado.payer_type).toBe("pf");
    expect(resultado.account_id).toBe(conta);
    expect(resultado.status_atendimento).toBe("concluido");
  });

  it("a data de competência segue o dia do atendimento no fuso da empresa", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`fuso.${s}@exemplo.com.br`);
    // Empresa em Cuiabá (GMT-4): 02:30 UTC do dia 6 ainda é dia 5 por lá.
    const empresaId = await criarEmpresa(dono, {
      nome: `Studio ${s}`,
      slug: `studio-fuso-${s}`,
      fuso: "America/Cuiaba",
    });
    const profissionalId = await criarProfissional(dono, empresaId, "Ana");
    const servicoId = await criarServico(dono, empresaId, { nome: "Corte", duracao: 30, preco: 5000 });
    const clienteId = await criarCliente(dono, empresaId, { nome: "Cliente Noturno" });
    const conta = await idDaConta(dono, empresaId);

    const atendimento = await criarAtendimento(dono, {
      empresaId,
      profissionalId,
      clienteId,
      servicoId,
      inicio: "2026-10-06T02:30:00Z",
      fim: "2026-10-06T03:00:00Z",
    });

    const lancamento = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ concluir_atendimento: string }>(
        "select public.concluir_atendimento($1, 'dinheiro', 5000, $2)",
        [atendimento, conta],
      );
      return rows[0].concluir_atendimento;
    });

    const competencia = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ competence_date: Date }>(
        "select competence_date from public.transactions where id = $1",
        [lancamento],
      );
      return rows[0].competence_date;
    });

    expect(competencia.toISOString().slice(0, 10)).toBe("2026-10-05");
  });

  it("não conclui duas vezes o mesmo atendimento", async () => {
    const c = await cenario();
    const conta = await idDaConta(c.dono, c.empresaId);
    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-07T13:00:00Z",
      fim: "2026-10-07T13:50:00Z",
    });

    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.concluir_atendimento($1, 'pix', 20000, $2)", [atendimento, conta]),
    );

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query("select public.concluir_atendimento($1, 'pix', 20000, $2)", [atendimento, conta]),
      ),
    ).rejects.toThrow(/não pode mais ser concluído/i);
  });

  it("recusa valor zero ou negativo", async () => {
    const c = await cenario();
    const conta = await idDaConta(c.dono, c.empresaId);
    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-08T13:00:00Z",
      fim: "2026-10-08T13:50:00Z",
    });

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query("select public.concluir_atendimento($1, 'pix', 0, $2)", [atendimento, conta]),
      ),
    ).rejects.toThrow(/valor maior que zero/i);
  });

  it("quem é de outra empresa não conclui atendimento alheio", async () => {
    const c = await cenario();
    const conta = await idDaConta(c.dono, c.empresaId);
    const estranho = await criarUsuario(`estranho.fin.${c.s}@exemplo.com.br`);
    await criarEmpresa(estranho, { nome: `Outra ${c.s}`, slug: `outra-fin-${c.s}` });

    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-09T13:00:00Z",
      fim: "2026-10-09T13:50:00Z",
    });

    await expect(
      comoUsuario(estranho, (cliente) =>
        cliente.query("select public.concluir_atendimento($1, 'pix', 20000, $2)", [atendimento, conta]),
      ),
    ).rejects.toThrow(/Sem permissão/i);
  });
});

describe.skipIf(!disponivel)("mês fechado não aceita mudança", () => {
  async function comLancamento() {
    const c = await cenario();
    const conta = await idDaConta(c.dono, c.empresaId);

    const lancamento = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at, account_id)
         values ($1, 'despesa', 'pago', 'Aluguel de outubro', 150000, '2026-10-05', '2026-10-05', $2)
         returning id`,
        [c.empresaId, conta],
      );
      return rows[0].id;
    });

    return { ...c, conta, lancamento };
  }

  it("fechado o mês, o lançamento não pode ser alterado nem apagado", async () => {
    const c = await comLancamento();

    // O fechamento é criado pelo servidor (a tabela não tem política de escrita
    // para quem está logado — na FASE 4 isso vira a função fechar_mes).
    await fecharMes(c.empresaId, "2026-10-01", c.dono);

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query("update public.transactions set amount_cents = 1 where id = $1", [c.lancamento]),
      ),
    ).rejects.toThrow(/Mês fechado/i);

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query("delete from public.transactions where id = $1", [c.lancamento]),
      ),
    ).rejects.toThrow(/Mês fechado/i);

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
           values ($1, 'receita', 'pago', 'Recebimento atrasado', 5000, '2026-10-20', '2026-10-20')`,
          [c.empresaId],
        ),
      ),
    ).rejects.toThrow(/Mês fechado/i);
  });

  it("reabrir o mês libera as alterações de novo", async () => {
    const c = await comLancamento();

    // O fechamento é criado pelo servidor (a tabela não tem política de escrita
    // para quem está logado — na FASE 4 isso vira a função fechar_mes).
    await fecharMes(c.empresaId, "2026-10-01", c.dono);
    await comoAdmin((cliente) =>
      cliente.query(
        "update public.monthly_closings set reopened_at = now() where organization_id = $1 and month = '2026-10-01'",
        [c.empresaId],
      ),
    );

    const alterados = await comoUsuario(c.dono, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.transactions set amount_cents = 160000 where id = $1",
        [c.lancamento],
      );
      return rowCount;
    });

    expect(alterados).toBe(1);
  });

  it("outro mês continua livre", async () => {
    const c = await comLancamento();

    // O fechamento é criado pelo servidor (a tabela não tem política de escrita
    // para quem está logado — na FASE 4 isso vira a função fechar_mes).
    await fecharMes(c.empresaId, "2026-10-01", c.dono);

    const criado = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'despesa', 'pago', 'Aluguel de novembro', 150000, '2026-11-05', '2026-11-05')
         returning id`,
        [c.empresaId],
      );
      return rows[0].id;
    });

    expect(criado).toBeTruthy();
  });
});

describe.skipIf(!disponivel)("quem vê e quem escreve no financeiro", () => {
  it("a recepção registra recebimento, mas não lança despesa", async () => {
    const c = await cenario();
    const recepcao = await criarUsuario(`recepcao.fin.${c.s}@exemplo.com.br`);
    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'recepcao')",
        [c.empresaId, recepcao],
      ),
    );

    const receita = await comoUsuario(recepcao, async (cliente) => {
      const { rowCount } = await cliente.query(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'receita', 'pago', 'Recebimento no balcão', 9000, '2026-10-05', '2026-10-05')`,
        [c.empresaId],
      );
      return rowCount;
    });
    expect(receita).toBe(1);

    await expect(
      comoUsuario(recepcao, (cliente) =>
        cliente.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
           values ($1, 'despesa', 'pago', 'Compra de material', 9000, '2026-10-05', '2026-10-05')`,
          [c.empresaId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("o contador lê o financeiro mas não altera", async () => {
    const c = await cenario();
    const contador = await criarUsuario(`contador.fin.${c.s}@exemplo.com.br`);
    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'contador')",
        [c.empresaId, contador],
      ),
    );

    await comoUsuario(c.dono, (cliente) =>
      cliente.query(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'receita', 'pago', 'Consulta particular', 20000, '2026-09-10', '2026-09-10')`,
        [c.empresaId],
      ),
    );

    const lidos = await comoUsuario(contador, async (cliente) => {
      const { rows } = await cliente.query("select id from public.transactions");
      return rows.length;
    });
    expect(lidos).toBe(1);

    const alterados = await comoUsuario(contador, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.transactions set amount_cents = 1 where organization_id = $1",
        [c.empresaId],
      );
      return rowCount;
    });
    expect(alterados).toBe(0);
  });

  it("o profissional não enxerga o financeiro", async () => {
    const c = await cenario();
    const profissional = await criarUsuario(`prof.fin.${c.s}@exemplo.com.br`);
    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'profissional')",
        [c.empresaId, profissional],
      ),
    );

    await comoUsuario(c.dono, (cliente) =>
      cliente.query(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'receita', 'pago', 'Consulta', 20000, '2026-09-11', '2026-09-11')`,
        [c.empresaId],
      ),
    );

    const lidos = await comoUsuario(profissional, async (cliente) => {
      const { rows } = await cliente.query("select id from public.transactions");
      return rows.length;
    });
    expect(lidos).toBe(0);
  });
});

describe.skipIf(!disponivel)("regras de dinheiro no próprio banco", () => {
  it("valor precisa ser maior que zero", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
           values ($1, 'receita', 'pago', 'Errado', 0, '2026-10-05', '2026-10-05')`,
          [c.empresaId],
        ),
      ),
    ).rejects.toThrow(/check constraint|restrição/i);
  });

  it("lançamento pago exige a data do pagamento", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date)
           values ($1, 'receita', 'pago', 'Sem data de pagamento', 5000, '2026-10-05')`,
          [c.empresaId],
        ),
      ),
    ).rejects.toThrow(/check constraint|restrição/i);
  });

  it("um atendimento gera no máximo um lançamento", async () => {
    const c = await cenario();
    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-12T13:00:00Z",
      fim: "2026-10-12T13:50:00Z",
    });

    await comoUsuario(c.dono, (cliente) =>
      cliente.query(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at, appointment_id)
         values ($1, 'receita', 'pago', 'Consulta', 20000, '2026-10-12', '2026-10-12', $2)`,
        [c.empresaId, atendimento],
      ),
    );

    await expect(
      comoUsuario(c.dono, (cliente) =>
        cliente.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date, paid_at, appointment_id)
           values ($1, 'receita', 'pago', 'Consulta repetida', 20000, '2026-10-12', '2026-10-12', $2)`,
          [c.empresaId, atendimento],
        ),
      ),
    ).rejects.toThrow(/unique|duplicate|duplicada/i);
  });
});
