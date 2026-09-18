import { afterAll, describe, expect, it } from "vitest";

import {
  bancoDisponivel,
  comoAdmin,
  comoUsuario,
  criarEmpresa,
  criarUsuario,
  fecharBanco,
  sufixo,
} from "./ajuda";

const disponivel = await bancoDisponivel();

afterAll(async () => {
  await fecharBanco();
});

describe.skipIf(!disponivel)("0007_assinatura — cobrança só pelo servidor", () => {
  it("o dono edita o cadastro, mas não muda plano, status nem ids do Asaas", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.ass.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-ass-${s}` });

    const cadastro = await comoUsuario(dono, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.organizations set city = 'Campo Grande' where id = $1",
        [empresaId],
      );
      return rowCount;
    });
    expect(cadastro).toBe(1);

    for (const coluna of [
      "plan = 'negocio'",
      "subscription_status = 'active'",
      "asaas_customer_id = 'cus_falso'",
      "asaas_subscription_id = 'sub_falso'",
      "billing_cycle = 'anual'",
      "pending_plan = 'negocio'",
    ]) {
      await expect(
        comoUsuario(dono, (cliente) =>
          cliente.query(`update public.organizations set ${coluna} where id = $1`, [empresaId]),
        ),
      ).rejects.toThrow(/permission denied|permissão negada/i);
    }
  });

  it("ninguém logado lê os eventos de cobrança", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.ev.${s}@exemplo.com.br`);
    await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-ev-${s}` });

    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.billing_events (id, type, payload) values ($1, 'PAYMENT_CONFIRMED', '{}'::jsonb)",
        [`evt_${s}`],
      ),
    );

    const lidos = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query("select id from public.billing_events");
      return rows.length;
    });
    expect(lidos).toBe(0);
  });

  it("o mesmo evento do Asaas não entra duas vezes", async () => {
    const s = sufixo();
    const evento = `evt_dup_${s}`;

    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.billing_events (id, type, payload) values ($1, 'PAYMENT_CONFIRMED', '{}'::jsonb)",
        [evento],
      ),
    );

    await expect(
      comoAdmin((cliente) =>
        cliente.query(
          "insert into public.billing_events (id, type, payload) values ($1, 'PAYMENT_CONFIRMED', '{}'::jsonb)",
          [evento],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("pagamento confirmado ativa a assinatura e aplica o plano pendente", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.web.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Clínica ${s}`, slug: `clinica-ass-${s}` });

    await comoAdmin((cliente) =>
      cliente.query(
        `update public.organizations
            set asaas_subscription_id = $2, pending_plan = 'profissional', billing_cycle = 'mensal'
          where id = $1`,
        [empresaId, `sub_${s}`],
      ),
    );

    const afetada = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ aplicar_status_de_cobranca: string }>(
        "select private.aplicar_status_de_cobranca($1, 'active')",
        [`sub_${s}`],
      );
      return rows[0].aplicar_status_de_cobranca;
    });
    expect(afetada).toBe(empresaId);

    const empresa = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{
        plan: string;
        subscription_status: string;
        pending_plan: string | null;
      }>("select plan, subscription_status, pending_plan from public.organizations where id = $1", [
        empresaId,
      ]);
      return rows[0];
    });

    expect(empresa.plan).toBe("profissional");
    expect(empresa.subscription_status).toBe("active");
    expect(empresa.pending_plan).toBeNull();
  });

  it("boleto vencido deixa a assinatura em atraso, sem mexer no plano", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.atraso.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Barbearia ${s}`, slug: `barb-ass-${s}` });

    await comoAdmin((cliente) =>
      cliente.query(
        `update public.organizations
            set asaas_subscription_id = $2, plan = 'essencial', subscription_status = 'active'
          where id = $1`,
        [empresaId, `sub_atraso_${s}`],
      ),
    );

    await comoAdmin((cliente) =>
      cliente.query("select private.aplicar_status_de_cobranca($1, 'past_due')", [
        `sub_atraso_${s}`,
      ]),
    );

    const empresa = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ plan: string; subscription_status: string }>(
        "select plan, subscription_status from public.organizations where id = $1",
        [empresaId],
      );
      return rows[0];
    });

    expect(empresa.subscription_status).toBe("past_due");
    expect(empresa.plan).toBe("essencial");
  });

  it("assinatura desconhecida não derruba o webhook", async () => {
    const resultado = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ aplicar_status_de_cobranca: string | null }>(
        "select private.aplicar_status_de_cobranca('sub_que_nao_existe', 'active')",
      );
      return rows[0].aplicar_status_de_cobranca;
    });
    expect(resultado).toBeNull();
  });
});
