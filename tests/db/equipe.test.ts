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

async function membro(empresaId: string, email: string, papel: string) {
  const usuario = await criarUsuario(email);
  await comoAdmin((c) =>
    c.query(
      "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3::public.member_role)",
      [empresaId, usuario, papel],
    ),
  );
  return usuario;
}

type Colaborador = {
  nome?: string;
  vinculo: string;
  profissionalId?: string | null;
  inicio?: string;
  percentual?: number;
};

async function cadastrar(dono: string, empresaId: string, dados: Colaborador) {
  return comoUsuario(dono, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.staff_members
         (organization_id, professional_id, name, job_title, contract, started_on, commission_bps)
       values ($1, $2, $3, 'Cabeleireira', $4::public.staff_contract, $5, $6) returning id`,
      [
        empresaId,
        dados.profissionalId ?? null,
        dados.nome ?? "Juliana Prado",
        dados.vinculo,
        dados.inicio ?? "2026-01-05",
        dados.percentual ?? 0,
      ],
    );
    return rows[0].id;
  });
}

async function cenario(opcoes: { fuso?: string } = {}) {
  const s = sufixo();
  const dono = await criarUsuario(`dono.eq.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, {
    nome: `Studio ${s}`,
    slug: `studio-eq-${s}`,
    fuso: opcoes.fuso,
  });
  const recepcao = await membro(empresaId, `recepcao.eq.${s}@exemplo.com.br`, "recepcao");
  const contador = await membro(empresaId, `contador.eq.${s}@exemplo.com.br`, "contador");
  const profissional = await membro(empresaId, `prof.eq.${s}@exemplo.com.br`, "profissional");
  const estranho = await criarUsuario(`estranho.eq.${s}@exemplo.com.br`);
  const outraEmpresa = await criarEmpresa(estranho, { nome: `Outra ${s}`, slug: `outra-eq-${s}` });
  const profissionalId = await criarProfissional(dono, empresaId, "Juliana Prado");
  const parceira = await cadastrar(dono, empresaId, {
    vinculo: "parceria",
    profissionalId,
    percentual: 6000,
  });
  const clt = await cadastrar(dono, empresaId, { nome: "Rafael Lima", vinculo: "clt" });
  return {
    s,
    dono,
    empresaId,
    recepcao,
    contador,
    profissional,
    estranho,
    outraEmpresa,
    profissionalId,
    parceira,
    clt,
  };
}

const contar = (uid: string, tabela: string) =>
  comoUsuario(uid, async (c) => (await c.query(`select 1 from public.${tabela}`)).rows.length);

async function pagar(
  uid: string,
  staff: string,
  tipo: string,
  mes = "2026-10-01",
  valor = 184000,
  pagoEm = "2026-10-05",
) {
  return comoUsuario(uid, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "select public.registrar_pagamento_equipe($1, $2::public.staff_payment_kind, $3, $4, $5, null, 'pix') as id",
      [staff, tipo, mes, valor, pagoEm],
    );
    return rows[0].id;
  });
}

async function ausentar(uid: string, staff: string, tipo: string, inicio: string, fim: string) {
  return comoUsuario(uid, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "select public.registrar_ausencia($1, $2::public.staff_absence_kind, $3, $4) as id",
      [staff, tipo, inicio, fim],
    );
    return rows[0].id;
  });
}

describe.skipIf(!disponivel)("0013_pessoas — quem vê e quem escreve", () => {
  it("cadastro: dono e contador leem; recepção, profissional e outra empresa não", async () => {
    const c = await cenario();
    expect(await contar(c.dono, "staff_members")).toBe(2);
    expect(await contar(c.contador, "staff_members")).toBe(2);
    expect(await contar(c.recepcao, "staff_members")).toBe(0);
    expect(await contar(c.profissional, "staff_members")).toBe(0);
    expect(await contar(c.estranho, "staff_members")).toBe(0);
  });

  it("só o dono cadastra e edita; ninguém apaga direto", async () => {
    const c = await cenario();
    for (const uid of [c.recepcao, c.contador, c.profissional]) {
      await expect(
        comoUsuario(uid, (k) =>
          k.query(
            "insert into public.staff_members (organization_id, name, contract, started_on) values ($1, 'Fulana Teste', 'clt', '2026-01-01')",
            [c.empresaId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    }
    for (const uid of [c.contador, c.estranho, c.recepcao]) {
      const n = await comoUsuario(uid, async (k) =>
        (await k.query("update public.staff_members set base_pay_cents = 1 where id = $1", [c.clt]))
          .rowCount,
      );
      expect(n).toBe(0);
    }
    const editados = await comoUsuario(c.dono, async (k) =>
      (await k.query("update public.staff_members set base_pay_cents = 190000 where id = $1", [c.clt]))
        .rowCount,
    );
    expect(editados).toBe(1);

    await expect(
      comoUsuario(c.dono, (k) => k.query("delete from public.staff_members where id = $1", [c.clt])),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.staff_members set anonymized_at = now() where id = $1", [c.clt]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("dados pessoais: só o dono lê e escreve; o contador não vê", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (k) =>
      k.query(
        `insert into public.staff_private (staff_id, organization_id, document, pix_key, phone_e164)
         values ($1, $2, '12345678909', 'juliana@exemplo.com.br', '+5565999990000')`,
        [c.parceira, c.empresaId],
      ),
    );
    expect(await contar(c.dono, "staff_private")).toBe(1);
    expect(await contar(c.contador, "staff_private")).toBe(0);
    expect(await contar(c.recepcao, "staff_private")).toBe(0);
    expect(await contar(c.profissional, "staff_private")).toBe(0);
    expect(await contar(c.estranho, "staff_private")).toBe(0);

    await expect(
      comoUsuario(c.contador, (k) =>
        k.query("insert into public.staff_private (staff_id, organization_id) values ($1, $2)", [
          c.clt,
          c.empresaId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.staff_private set document = '123.456.789-09' where staff_id = $1", [
          c.parceira,
        ]),
      ),
    ).rejects.toThrow(/check constraint|restrição/i);
  });

  it("dado pessoal não pode apontar para colaborador de outra empresa", async () => {
    const c = await cenario();
    const alheio = await cadastrar(c.estranho, c.outraEmpresa, { vinculo: "clt", nome: "Marcos Alves" });
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("insert into public.staff_private (staff_id, organization_id) values ($1, $2)", [
          alheio,
          c.empresaId,
        ]),
      ),
    ).rejects.toThrow(/outra empresa/i);
  });

  it("profissional de outra empresa é recusado", async () => {
    const c = await cenario();
    const profAlheio = await criarProfissional(c.estranho, c.outraEmpresa, "Marcos Alves");
    await expect(
      cadastrar(c.dono, c.empresaId, { vinculo: "mei", profissionalId: profAlheio, nome: "Bianca Rocha" }),
    ).rejects.toThrow(/outra empresa/i);
  });

  it("um profissional da agenda liga a um colaborador só", async () => {
    const c = await cenario();
    await expect(
      cadastrar(c.dono, c.empresaId, { vinculo: "mei", profissionalId: c.profissionalId }),
    ).rejects.toThrow(/unique|duplicate|duplicada/i);
  });

  it("ausências e pagamentos: ninguém escreve direto na tabela", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query(
          "insert into public.staff_absences (organization_id, staff_id, kind, starts_on, ends_on) values ($1, $2, 'folga', '2026-10-01', '2026-10-01')",
          [c.empresaId, c.clt],
        ),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    const pagamento = await pagar(c.dono, c.clt, "salario");
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.staff_payments set amount_cents = 1 where id = $1", [pagamento]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("ausências e pagamentos: dono e contador leem; recepção, profissional e outra empresa não", async () => {
    const c = await cenario();
    await ausentar(c.dono, c.clt, "folga", "2026-10-20", "2026-10-20");
    await pagar(c.dono, c.clt, "salario");
    for (const tabela of ["staff_absences", "staff_payments"]) {
      expect(await contar(c.dono, tabela)).toBe(1);
      expect(await contar(c.contador, tabela)).toBe(1);
      expect(await contar(c.recepcao, tabela)).toBe(0);
      expect(await contar(c.profissional, tabela)).toBe(0);
      expect(await contar(c.estranho, tabela)).toBe(0);
    }
  });

  it("só o dono chama as funções; contador e outra empresa recebem 'Sem permissão'", async () => {
    const c = await cenario();
    for (const uid of [c.contador, c.recepcao, c.estranho]) {
      await expect(ausentar(uid, c.clt, "folga", "2026-10-20", "2026-10-20")).rejects.toThrow(
        /Sem permissão/i,
      );
      await expect(pagar(uid, c.clt, "salario")).rejects.toThrow(/Sem permissão/i);
      await expect(
        comoUsuario(uid, (k) => k.query("select public.remover_colaborador($1)", [c.clt])),
      ).rejects.toThrow(/Sem permissão/i);
    }
  });
});

describe.skipIf(!disponivel)("0013_pessoas — vocabulário por vínculo", () => {
  it("parceiro só fica 'indisponível'; férias e falta são recusadas", async () => {
    const c = await cenario();
    for (const tipo of ["ferias", "falta", "atestado", "folga", "recesso"]) {
      await expect(ausentar(c.dono, c.parceira, tipo, "2026-10-20", "2026-10-21")).rejects.toThrow(
        /não combina com o vínculo/i,
      );
    }
    expect(await ausentar(c.dono, c.parceira, "indisponivel", "2026-10-20", "2026-10-21")).toBeTruthy();
  });

  it("CLT tem férias e falta, mas não 'indisponível' nem recesso; estágio tem recesso", async () => {
    const c = await cenario();
    expect(await ausentar(c.dono, c.clt, "ferias", "2026-11-02", "2026-11-15")).toBeTruthy();
    await expect(ausentar(c.dono, c.clt, "indisponivel", "2026-11-20", "2026-11-20")).rejects.toThrow(
      /não combina/i,
    );
    await expect(ausentar(c.dono, c.clt, "recesso", "2026-11-20", "2026-11-20")).rejects.toThrow(
      /não combina/i,
    );
    const estagiaria = await cadastrar(c.dono, c.empresaId, { nome: "Lívia Souza", vinculo: "estagio" });
    expect(await ausentar(c.dono, estagiaria, "recesso", "2026-12-21", "2026-12-31")).toBeTruthy();
    await expect(ausentar(c.dono, estagiaria, "ferias", "2026-12-21", "2026-12-31")).rejects.toThrow(
      /não combina/i,
    );
  });

  it("pagamento: parceiro recebe cota-parte, nunca salário; MEI recebe repasse; estágio, bolsa", async () => {
    const c = await cenario();
    await expect(pagar(c.dono, c.parceira, "salario")).rejects.toThrow(/não combina/i);
    await expect(pagar(c.dono, c.parceira, "comissao")).rejects.toThrow(/não combina/i);
    expect(await pagar(c.dono, c.parceira, "cota_parte")).toBeTruthy();

    const mei = await cadastrar(c.dono, c.empresaId, { nome: "Bianca Rocha", vinculo: "mei" });
    await expect(pagar(c.dono, mei, "salario")).rejects.toThrow(/não combina/i);
    expect(await pagar(c.dono, mei, "repasse")).toBeTruthy();

    const estagiaria = await cadastrar(c.dono, c.empresaId, { nome: "Lívia Souza", vinculo: "estagio" });
    await expect(pagar(c.dono, estagiaria, "salario")).rejects.toThrow(/não combina/i);
    expect(await pagar(c.dono, estagiaria, "bolsa")).toBeTruthy();

    await expect(pagar(c.dono, c.clt, "cota_parte")).rejects.toThrow(/não combina/i);
    await expect(pagar(c.dono, c.clt, "bolsa")).rejects.toThrow(/não combina/i);
  });
});

describe.skipIf(!disponivel)("0013_pessoas — ausência bloqueia a agenda sem contar o motivo", () => {
  it("cria o bloqueio 'Ausência' do início do primeiro dia ao início do dia seguinte ao último, no fuso", async () => {
    const c = await cenario({ fuso: "America/Cuiaba" });
    const ausencia = await ausentar(c.dono, c.parceira, "indisponivel", "2026-10-20", "2026-10-22");

    const bloqueio = await comoUsuario(c.recepcao, async (k) => {
      const { rows } = await k.query(
        `select t.reason, to_char(t.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as inicio,
                to_char(t.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as fim, t.professional_id
           from public.time_off t where t.organization_id = $1`,
        [c.empresaId],
      );
      return rows;
    });
    // Cuiabá é UTC-4: meia-noite local = 04:00 UTC.
    expect(bloqueio).toEqual([
      {
        reason: "Ausência",
        inicio: "2026-10-20T04:00",
        fim: "2026-10-23T04:00",
        professional_id: c.profissionalId,
      },
    ]);

    const ligado = await comoAdmin(async (k) =>
      (await k.query("select time_off_id from public.staff_absences where id = $1", [ausencia])).rows[0]
        .time_off_id,
    );
    expect(ligado).toBeTruthy();
  });

  it("o atestado de quem atende vira 'Ausência' na agenda, nunca 'Atestado'", async () => {
    const c = await cenario();
    const profissionalId = await criarProfissional(c.dono, c.empresaId, "Rafael Nunes");
    const clt = await cadastrar(c.dono, c.empresaId, { nome: "Rafael Nunes", vinculo: "clt", profissionalId });
    await ausentar(c.dono, clt, "atestado", "2026-10-14", "2026-10-14");
    const motivos = await comoUsuario(c.profissional, async (k) =>
      (await k.query("select reason from public.time_off where professional_id = $1", [profissionalId]))
        .rows.map((r) => r.reason),
    );
    expect(motivos).toEqual(["Ausência"]);
  });

  it("colaborador sem agenda não gera bloqueio", async () => {
    const c = await cenario();
    const id = await ausentar(c.dono, c.clt, "folga", "2026-10-20", "2026-10-20");
    const ligado = await comoAdmin(async (k) =>
      (await k.query("select time_off_id from public.staff_absences where id = $1", [id])).rows[0]
        .time_off_id,
    );
    expect(ligado).toBeNull();
  });

  it("excluir a ausência apaga o bloqueio da agenda", async () => {
    const c = await cenario();
    const ausencia = await ausentar(c.dono, c.parceira, "indisponivel", "2026-10-20", "2026-10-20");
    await comoUsuario(c.dono, (k) => k.query("select public.excluir_ausencia($1)", [ausencia]));
    const sobrou = await comoAdmin(async (k) => ({
      ausencias: (await k.query("select 1 from public.staff_absences where id = $1", [ausencia])).rows
        .length,
      bloqueios: (await k.query("select 1 from public.time_off where organization_id = $1", [c.empresaId]))
        .rows.length,
    }));
    expect(sobrou).toEqual({ ausencias: 0, bloqueios: 0 });
  });

  it("período invertido é recusado", async () => {
    const c = await cenario();
    await expect(ausentar(c.dono, c.clt, "folga", "2026-10-21", "2026-10-20")).rejects.toThrow(
      /período/i,
    );
  });
});

describe.skipIf(!disponivel)("0013_pessoas — pagamento vira despesa", () => {
  it("cota-parte cai em 'Comissões e repasses a profissionais', paga, sem CPF na descrição", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (k) =>
      k.query(
        "insert into public.staff_private (staff_id, organization_id, document) values ($1, $2, '12345678909')",
        [c.parceira, c.empresaId],
      ),
    );
    const pagamento = await pagar(c.dono, c.parceira, "cota_parte", "2026-10-15", 184000, "2026-10-05");
    const linha = await comoUsuario(c.contador, async (k) =>
      (
        await k.query(
          `select t.kind, t.status, t.amount_cents, t.paid_at::text as pago, t.competence_date::text as competencia,
                  t.description, t.payment_method, t.created_by, cat.name as categoria,
                  p.reference_month::text as referencia, p.kind as tipo
             from public.staff_payments p join public.transactions t on t.id = p.transaction_id
             left join public.categories cat on cat.id = t.category_id where p.id = $1`,
          [pagamento],
        )
      ).rows[0],
    );
    expect(linha).toMatchObject({
      kind: "despesa",
      status: "pago",
      amount_cents: "184000",
      pago: "2026-10-05",
      competencia: "2026-10-01",
      referencia: "2026-10-01",
      description: "Cota-parte — Juliana P.",
      payment_method: "pix",
      created_by: c.dono,
      categoria: "Comissões e repasses a profissionais",
      tipo: "cota_parte",
    });
    expect(linha.description).not.toMatch(/\d{3}/);
  });

  it("salário cai em 'Salários e encargos'", async () => {
    const c = await cenario();
    const pagamento = await pagar(c.dono, c.clt, "salario", "2026-10-01", 190000);
    const linha = await comoUsuario(c.dono, async (k) =>
      (
        await k.query(
          `select t.description, cat.name as categoria from public.staff_payments p
             join public.transactions t on t.id = p.transaction_id
             join public.categories cat on cat.id = t.category_id where p.id = $1`,
          [pagamento],
        )
      ).rows[0],
    );
    expect(linha).toEqual({ description: "Salário — Rafael L.", categoria: "Salários e encargos" });
  });

  it("recria a categoria se o dono a apagou", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (k) =>
      k.query(
        "delete from public.categories where organization_id = $1 and name = 'Comissões e repasses a profissionais'",
        [c.empresaId],
      ),
    );
    const pagamento = await pagar(c.dono, c.parceira, "cota_parte");
    const categoria = await comoUsuario(c.dono, async (k) =>
      (
        await k.query(
          `select cat.name from public.staff_payments p join public.transactions t on t.id = p.transaction_id
             join public.categories cat on cat.id = t.category_id where p.id = $1`,
          [pagamento],
        )
      ).rows[0].name,
    );
    expect(categoria).toBe("Comissões e repasses a profissionais");
  });

  it("recusa valor zero, conta de outra empresa e colaborador alheio", async () => {
    const c = await cenario();
    await expect(pagar(c.dono, c.clt, "salario", "2026-10-01", 0)).rejects.toThrow(/maior que zero/i);
    const contaAlheia = await comoAdmin(async (k) =>
      (await k.query("select id from public.accounts where organization_id = $1 limit 1", [c.outraEmpresa]))
        .rows[0].id,
    );
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query(
          "select public.registrar_pagamento_equipe($1, 'salario', '2026-10-01', 1000, '2026-10-05', $2, 'pix')",
          [c.clt, contaAlheia],
        ),
      ),
    ).rejects.toThrow(/Conta inválida/i);
    const alheio = await cadastrar(c.estranho, c.outraEmpresa, { vinculo: "clt", nome: "Marcos Alves" });
    await expect(pagar(c.dono, alheio, "salario")).rejects.toThrow(/Sem permissão/i);
  });

  it("mês fechado barra o pagamento e não deixa meia gravação", async () => {
    const c = await cenario();
    await comoAdmin((k) =>
      k.query(
        "insert into public.monthly_closings (organization_id, month, closed_by) values ($1, '2026-09-01', $2)",
        [c.empresaId, c.dono],
      ),
    );
    await expect(pagar(c.dono, c.clt, "salario", "2026-09-01", 150000, "2026-09-05")).rejects.toThrow(
      /Mês fechado/i,
    );
    const sobrou = await comoAdmin(async (k) => ({
      pagamentos: (await k.query("select 1 from public.staff_payments where staff_id = $1", [c.clt])).rows
        .length,
      lancamentos: (
        await k.query("select 1 from public.transactions where organization_id = $1", [c.empresaId])
      ).rows.length,
    }));
    expect(sobrou).toEqual({ pagamentos: 0, lancamentos: 0 });
  });

  it("excluir o pagamento apaga o lançamento e o pagamento", async () => {
    const c = await cenario();
    const pagamento = await pagar(c.dono, c.clt, "salario");
    const lancamento = await comoAdmin(async (k) =>
      (await k.query("select transaction_id from public.staff_payments where id = $1", [pagamento])).rows[0]
        .transaction_id,
    );
    await comoUsuario(c.dono, (k) => k.query("select public.excluir_pagamento_equipe($1)", [pagamento]));
    const sobrou = await comoAdmin(async (k) => ({
      pagamento: (await k.query("select 1 from public.staff_payments where id = $1", [pagamento])).rows.length,
      lancamento: (await k.query("select 1 from public.transactions where id = $1", [lancamento])).rows.length,
    }));
    expect(sobrou).toEqual({ pagamento: 0, lancamento: 0 });
  });

  it("apagar o lançamento no financeiro apaga o pagamento junto", async () => {
    const c = await cenario();
    const pagamento = await pagar(c.dono, c.clt, "salario");
    await comoUsuario(c.dono, (k) =>
      k.query(
        "delete from public.transactions where id = (select transaction_id from public.staff_payments where id = $1)",
        [pagamento],
      ),
    );
    const sobrou = await comoAdmin(async (k) =>
      (await k.query("select 1 from public.staff_payments where id = $1", [pagamento])).rows.length,
    );
    expect(sobrou).toBe(0);
  });

  it("mês fechado também barra a exclusão do pagamento", async () => {
    const c = await cenario();
    const pagamento = await pagar(c.dono, c.clt, "salario", "2026-08-01", 150000, "2026-08-05");
    await comoAdmin((k) =>
      k.query(
        "insert into public.monthly_closings (organization_id, month, closed_by) values ($1, '2026-08-01', $2)",
        [c.empresaId, c.dono],
      ),
    );
    await expect(
      comoUsuario(c.dono, (k) => k.query("select public.excluir_pagamento_equipe($1)", [pagamento])),
    ).rejects.toThrow(/Mês fechado/i);
  });
});

describe.skipIf(!disponivel)("0013_pessoas — base da comissão", () => {
  it("soma só as receitas pagas dos atendimentos do profissional, no mês", async () => {
    const c = await cenario();
    const outroProfissional = await criarProfissional(c.dono, c.empresaId, "Camila Duarte");
    const servico = await criarServico(c.dono, c.empresaId, { nome: "Corte", duracao: 30, preco: 8000 });
    const cliente = await criarCliente(c.dono, c.empresaId, { nome: "Fernanda Lopes" });

    async function atendimento(profissionalId: string, dia: string) {
      return criarAtendimento(c.dono, {
        empresaId: c.empresaId,
        profissionalId,
        clienteId: cliente,
        servicoId: servico,
        inicio: `${dia}T13:00:00Z`,
        fim: `${dia}T13:30:00Z`,
      });
    }
    async function receita(ag: string, valor: number, status: string, pagoEm: string | null) {
      await comoUsuario(c.dono, (k) =>
        k.query(
          `insert into public.transactions
             (organization_id, kind, status, description, amount_cents, competence_date, paid_at, appointment_id)
           values ($1, 'receita', $2::public.tx_status, 'Corte', $3, '2026-10-01', $4, $5)`,
          [c.empresaId, status, valor, pagoEm, ag],
        ),
      );
    }

    await receita(await atendimento(c.profissionalId, "2026-10-02"), 8000, "pago", "2026-10-02");
    await receita(await atendimento(c.profissionalId, "2026-10-03"), 9500, "pago", "2026-10-31");
    await receita(await atendimento(c.profissionalId, "2026-10-04"), 7000, "pendente", null); // não pago
    await receita(await atendimento(c.profissionalId, "2026-09-30"), 6000, "pago", "2026-09-30"); // outro mês
    await receita(await atendimento(outroProfissional, "2026-10-05"), 12000, "pago", "2026-10-05"); // outra pessoa
    // Despesa ligada a nada não entra.
    await comoUsuario(c.dono, (k) =>
      k.query(
        `insert into public.transactions (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
         values ($1, 'despesa', 'pago', 'Produtos', 3000, '2026-10-02', '2026-10-02')`,
        [c.empresaId],
      ),
    );

    const base = (uid: string, staff: string) =>
      comoUsuario(uid, async (k) =>
        (await k.query("select public.base_de_comissao($1, '2026-10-17') as v", [staff])).rows[0].v,
      );
    expect(await base(c.dono, c.parceira)).toBe("17500");
    expect(await base(c.contador, c.parceira)).toBe("17500");
    expect(await base(c.dono, c.clt)).toBe("0"); // sem agenda
    await expect(base(c.recepcao, c.parceira)).rejects.toThrow(/Sem permissão/i);
    await expect(base(c.estranho, c.parceira)).rejects.toThrow(/Sem permissão/i);
  });
});

describe.skipIf(!disponivel)("0013_pessoas — remover colaborador", () => {
  it("sem pagamento, apaga de vez (com ausências e bloqueios)", async () => {
    const c = await cenario();
    await ausentar(c.dono, c.parceira, "indisponivel", "2026-10-20", "2026-10-20");
    const resultado = await comoUsuario(c.dono, async (k) =>
      (await k.query("select public.remover_colaborador($1) as r", [c.parceira])).rows[0].r,
    );
    expect(resultado).toBe("removido");
    const sobrou = await comoAdmin(async (k) => ({
      colaborador: (await k.query("select 1 from public.staff_members where id = $1", [c.parceira])).rows
        .length,
      bloqueios: (await k.query("select 1 from public.time_off where organization_id = $1", [c.empresaId]))
        .rows.length,
    }));
    expect(sobrou).toEqual({ colaborador: 0, bloqueios: 0 });
  });

  it("com pagamento, anonimiza: some o nome e os dados pessoais, ficam os pagamentos", async () => {
    const c = await cenario({ fuso: "America/Cuiaba" });
    await comoUsuario(c.dono, (k) =>
      k.query(
        "insert into public.staff_private (staff_id, organization_id, document, pix_key) values ($1, $2, '12345678909', 'chave-pix')",
        [c.parceira, c.empresaId],
      ),
    );
    await pagar(c.dono, c.parceira, "cota_parte");
    const resultado = await comoUsuario(c.dono, async (k) =>
      (await k.query("select public.remover_colaborador($1) as r", [c.parceira])).rows[0].r,
    );
    expect(resultado).toBe("anonimizado");

    const linha = await comoAdmin(async (k) => {
      const { rows } = await k.query(
        `select s.name, s.job_title, s.anonymized_at is not null as anonimizado, s.ended_on::text as fim,
                (now() at time zone 'America/Cuiaba')::date::text as hoje,
                (select count(*)::int from public.staff_private p where p.staff_id = s.id) as privados,
                (select count(*)::int from public.staff_payments p where p.staff_id = s.id) as pagamentos
           from public.staff_members s where s.id = $1`,
        [c.parceira],
      );
      return rows[0];
    });
    expect(linha).toMatchObject({
      name: "Ex-colaborador",
      job_title: null,
      anonimizado: true,
      privados: 0,
      pagamentos: 1,
    });
    expect(linha.fim).toBe(linha.hoje);

    // Anonimizado não recebe pagamento novo nem volta a ter nome.
    await expect(pagar(c.dono, c.parceira, "cota_parte")).rejects.toThrow(/removido/i);
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.staff_members set name = 'Juliana Prado' where id = $1", [c.parceira]),
      ),
    ).rejects.toThrow(/removido/i);
    // Chamar de novo não quebra.
    const deNovo = await comoUsuario(c.dono, async (k) =>
      (await k.query("select public.remover_colaborador($1) as r", [c.parceira])).rows[0].r,
    );
    expect(deNovo).toBe("anonimizado");
  });
});

describe.skipIf(!disponivel)("0013_pessoas — categoria nova nas empresas", () => {
  it("empresa nova nasce com 'Comissões e repasses a profissionais'", async () => {
    const c = await cenario();
    const categoria = await comoUsuario(c.dono, async (k) =>
      (
        await k.query(
          "select report_group, deductible_hint from public.categories where organization_id = $1 and name = 'Comissões e repasses a profissionais' and kind = 'despesa'",
          [c.empresaId],
        )
      ).rows,
    );
    expect(categoria).toEqual([{ report_group: "operacional", deductible_hint: false }]);
  });
});
