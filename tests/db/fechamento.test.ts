import { afterAll, describe, expect, it } from "vitest";

import {
  bancoDisponivel,
  comoAdmin,
  comoUsuario,
  criarCliente,
  criarEmpresa,
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
  const dono = await criarUsuario(`dono.fech.${s}@exemplo.com.br`);
  const contador = await criarUsuario(`contador.fech.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-fech-${s}` });

  await comoAdmin((cliente) =>
    cliente.query(
      "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'contador')",
      [empresaId, contador],
    ),
  );

  // Um mês com uma receita e uma despesa pagas.
  await comoUsuario(dono, async (cliente) => {
    await cliente.query(
      `insert into public.transactions
         (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
       values ($1, 'receita', 'pago', 'Atendimentos da semana', 120000, '2026-09-10', '2026-09-10'),
              ($1, 'despesa', 'pago', 'Aluguel', 150000, '2026-09-05', '2026-09-05'),
              ($1, 'receita', 'pendente', 'A receber', 50000, '2026-09-20', null)`,
      [empresaId],
    );
  });

  return { s, dono, contador, empresaId };
}

describe.skipIf(!disponivel)("0004_fechamento — fechar e reabrir o mês", () => {
  it("o dono fecha o mês e os totais somam só o que foi pago", async () => {
    const c = await cenario();

    const fechamento = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{
        month: Date;
        totals: { receitas_cents: number; despesas_cents: number; lancamentos: number };
        closed_by: string;
      }>("select * from public.fechar_mes($1, '2026-09-01')", [c.empresaId]);
      return rows[0];
    });

    expect(fechamento.month.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(Number(fechamento.totals.receitas_cents)).toBe(120000);
    expect(Number(fechamento.totals.despesas_cents)).toBe(150000);
    // O lançamento pendente não entra na conta do mês fechado.
    expect(Number(fechamento.totals.lancamentos)).toBe(2);
    expect(fechamento.closed_by).toBe(c.dono);
  });

  it("aceita qualquer dia do mês e normaliza para o dia 1", async () => {
    const c = await cenario();

    const mes = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ month: Date }>(
        "select month from public.fechar_mes($1, '2026-09-23')",
        [c.empresaId],
      );
      return rows[0].month;
    });

    expect(mes.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("o contador não fecha o mês", async () => {
    const c = await cenario();

    await expect(
      comoUsuario(c.contador, (cliente) =>
        cliente.query("select public.fechar_mes($1, '2026-09-01')", [c.empresaId]),
      ),
    ).rejects.toThrow(/Apenas o dono pode fechar/i);
  });

  it("fechar de novo atualiza os totais e limpa a reabertura", async () => {
    const c = await cenario();

    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.fechar_mes($1, '2026-09-01')", [c.empresaId]),
    );
    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.reabrir_mes($1, '2026-09-01')", [c.empresaId]),
    );

    // Com o mês reaberto, dá para lançar de novo.
    await comoUsuario(c.dono, (cliente) =>
      cliente.query(
        `insert into public.transactions
           (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'receita', 'pago', 'Recebimento esquecido', 30000, '2026-09-28', '2026-09-28')`,
        [c.empresaId],
      ),
    );

    const refeito = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{
        totals: { receitas_cents: number };
        reopened_at: string | null;
      }>("select * from public.fechar_mes($1, '2026-09-01')", [c.empresaId]);
      return rows[0];
    });

    expect(Number(refeito.totals.receitas_cents)).toBe(150000);
    expect(refeito.reopened_at).toBeNull();
  });

  it("reabrir o mês fica registrado na auditoria", async () => {
    const c = await cenario();

    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.fechar_mes($1, '2026-09-01')", [c.empresaId]),
    );
    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.reabrir_mes($1, '2026-09-01')", [c.empresaId]),
    );

    const registros = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ action: string; user_id: string }>(
        "select action, user_id from public.audit_logs where organization_id = $1",
        [c.empresaId],
      );
      return rows;
    });

    expect(registros).toHaveLength(1);
    expect(registros[0].action).toBe("fechamento.reaberto");
    expect(registros[0].user_id).toBe(c.dono);
  });

  it("o contador não reabre o mês", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.fechar_mes($1, '2026-09-01')", [c.empresaId]),
    );

    await expect(
      comoUsuario(c.contador, (cliente) =>
        cliente.query("select public.reabrir_mes($1, '2026-09-01')", [c.empresaId]),
      ),
    ).rejects.toThrow(/Apenas o dono pode reabrir/i);
  });
});

describe.skipIf(!disponivel)("o que o contador pode e o que não pode", () => {
  it("define o código contábil da categoria, mas não muda mais nada nela", async () => {
    const c = await cenario();

    const categoria = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        "select id from public.categories where organization_id = $1 and name = 'Aluguel do espaço'",
        [c.empresaId],
      );
      return rows[0].id;
    });

    await comoUsuario(c.contador, (cliente) =>
      cliente.query("select public.definir_codigo_contabil($1, ' 3.1.01 ')", [categoria]),
    );

    const codigo = await comoUsuario(c.contador, async (cliente) => {
      const { rows } = await cliente.query<{ accounting_code: string }>(
        "select accounting_code from public.categories where id = $1",
        [categoria],
      );
      return rows[0].accounting_code;
    });
    expect(codigo).toBe("3.1.01");

    const alterados = await comoUsuario(c.contador, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.categories set name = 'Renomeada pelo contador' where id = $1",
        [categoria],
      );
      return rowCount;
    });
    expect(alterados).toBe(0);
  });

  it("quem é de outra empresa não define código contábil", async () => {
    const c = await cenario();
    const estranho = await criarUsuario(`estranho.fech.${c.s}@exemplo.com.br`);
    await criarEmpresa(estranho, { nome: `Outra ${c.s}`, slug: `outra-fech-${c.s}` });

    const categoria = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        "select id from public.categories where organization_id = $1 limit 1",
        [c.empresaId],
      );
      return rows[0].id;
    });

    await expect(
      comoUsuario(estranho, (cliente) =>
        cliente.query("select public.definir_codigo_contabil($1, '9.9.99')", [categoria]),
      ),
    ).rejects.toThrow(/Sem permissão/i);
  });

  it("vê nome e CPF do pagador, mas nunca telefone nem anotações", async () => {
    const c = await cenario();

    await comoUsuario(c.dono, async (cliente) => {
      await cliente.query(
        `insert into public.clients (organization_id, name, phone_e164, document, notes)
         values ($1, 'Paciente Exemplo', '+5566999990000', '12345678901', 'Anotação administrativa')`,
        [c.empresaId],
      );
    });

    // A tabela de clientes é invisível para o contador...
    const pelaTabela = await comoUsuario(c.contador, async (cliente) => {
      const { rows } = await cliente.query("select id from public.clients");
      return rows.length;
    });
    expect(pelaTabela).toBe(0);

    // ...e a visão de contabilidade só entrega o necessário.
    const pelaVisao = await comoUsuario(c.contador, async (cliente) => {
      const { rows, fields } = await cliente.query<{ name: string; document: string }>(
        "select * from public.clientes_para_contabilidade",
      );
      return { nomes: rows.map((linha) => linha.name), colunas: fields.map((campo) => campo.name) };
    });

    expect(pelaVisao.nomes).toContain("Paciente Exemplo");
    expect(pelaVisao.colunas).toEqual(["id", "organization_id", "name", "document", "payer_type"]);
    expect(pelaVisao.colunas).not.toContain("phone_e164");
    expect(pelaVisao.colunas).not.toContain("notes");
  });

  it("a visão não vaza clientes de outra empresa", async () => {
    const c = await cenario();
    const outroDono = await criarUsuario(`dono.outro.${c.s}@exemplo.com.br`);
    const outraEmpresa = await criarEmpresa(outroDono, {
      nome: `Concorrente ${c.s}`,
      slug: `concorrente-${c.s}`,
    });
    await criarCliente(outroDono, outraEmpresa, { nome: "Cliente Alheio" });
    await criarCliente(c.dono, c.empresaId, { nome: "Cliente Próprio" });

    const nomes = await comoUsuario(c.contador, async (cliente) => {
      const { rows } = await cliente.query<{ name: string }>(
        "select name from public.clientes_para_contabilidade",
      );
      return rows.map((linha) => linha.name);
    });

    expect(nomes).toContain("Cliente Próprio");
    expect(nomes).not.toContain("Cliente Alheio");
  });

  it("pede comprovante ao dono e o dono marca como resolvido", async () => {
    const c = await cenario();

    const pedido = await comoUsuario(c.contador, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.document_requests (organization_id, requested_by, message)
         values ($1, $2, 'Falta o comprovante do aluguel de setembro') returning id`,
        [c.empresaId, c.contador],
      );
      return rows[0].id;
    });

    const resolvidos = await comoUsuario(c.dono, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.document_requests set resolved_at = now() where id = $1",
        [pedido],
      );
      return rowCount;
    });
    expect(resolvidos).toBe(1);

    // O contador não fecha o próprio pedido.
    const pelaContabilidade = await comoUsuario(c.contador, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.document_requests set message = 'mudei' where id = $1",
        [pedido],
      );
      return rowCount;
    });
    expect(pelaContabilidade).toBe(0);
  });
});

describe.skipIf(!disponivel)("mês fechado — documento emitido depois", () => {
  it("marcar nota e recibo emitidos passa no mês fechado; mexer no valor não", async () => {
    const c = await cenario();

    const lancamento = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.transactions
           (organization_id, kind, description, amount_cents, competence_date, status, paid_at, payer_type)
         values ($1, 'receita', 'Consulta — Marina Alves', 25000, '2026-05-10', 'pago', '2026-05-10', 'pf')
         returning id`,
        [c.empresaId],
      );
      return rows[0].id;
    });

    await comoAdmin(async (cliente) => {
      await cliente.query(
        `insert into public.monthly_closings (organization_id, month, closed_by, closed_at)
         values ($1, '2026-05-01', $2, now())`,
        [c.empresaId, c.dono],
      );
    });

    // O que não é do fechamento passa.
    const marcados = await comoUsuario(c.dono, async (cliente) => {
      const recibo = await cliente.query(
        "update public.transactions set receita_saude_emitido = true where id = $1",
        [lancamento],
      );
      const nota = await cliente.query(
        "update public.transactions set nota_fiscal_emitida = true where id = $1",
        [lancamento],
      );
      return (recibo.rowCount ?? 0) + (nota.rowCount ?? 0);
    });
    expect(marcados).toBe(2);

    // O dinheiro continua travado.
    await expect(
      comoUsuario(c.dono, async (cliente) => {
        await cliente.query("update public.transactions set amount_cents = 1 where id = $1", [
          lancamento,
        ]);
      }),
    ).rejects.toThrow(/Mês fechado/);

    // E marcar o recibo junto com uma mudança de valor não passa disfarçado.
    await expect(
      comoUsuario(c.dono, async (cliente) => {
        await cliente.query(
          "update public.transactions set receita_saude_emitido = false, amount_cents = 1 where id = $1",
          [lancamento],
        );
      }),
    ).rejects.toThrow(/Mês fechado/);

    const final = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query(
        "select amount_cents, nota_fiscal_emitida, receita_saude_emitido from public.transactions where id = $1",
        [lancamento],
      );
      return rows[0];
    });
    expect(final.amount_cents).toBe("25000");
    expect(final.nota_fiscal_emitida).toBe(true);
    expect(final.receita_saude_emitido).toBe(true);
  });
});
