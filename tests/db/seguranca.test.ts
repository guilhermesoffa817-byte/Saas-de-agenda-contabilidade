import { afterAll, describe, expect, it } from "vitest";

import {
  bancoDisponivel,
  comoAdmin,
  comoUsuario,
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

describe.skipIf(!disponivel)("0008_seguranca — limite de tentativas", () => {
  it("deixa tentar até o limite e barra depois, por e-mail", async () => {
    const s = sufixo();
    const respostas = await comoAdmin(async (cliente) => {
      const saida: boolean[] = [];
      for (let i = 0; i < 10; i += 1) {
        const { rows } = await cliente.query<{ registrar_tentativa: boolean }>(
          "select public.registrar_tentativa('entrar', $1, $2)",
          [`hash-email-${s}`, `hash-ip-${s}-${i}`],
        );
        saida.push(rows[0].registrar_tentativa);
      }
      return saida;
    });

    // Oito passam; da nona em diante, barra.
    expect(respostas.slice(0, 8).every(Boolean)).toBe(true);
    expect(respostas[8]).toBe(false);
    expect(respostas[9]).toBe(false);
  });

  it("barra também por IP, mesmo com e-mails diferentes", async () => {
    const s = sufixo();
    const respostas = await comoAdmin(async (cliente) => {
      const saida: boolean[] = [];
      for (let i = 0; i < 22; i += 1) {
        const { rows } = await cliente.query<{ registrar_tentativa: boolean }>(
          "select public.registrar_tentativa('recuperar', $1, $2)",
          [`hash-email-${s}-${i}`, `hash-ip-unico-${s}`],
        );
        saida.push(rows[0].registrar_tentativa);
      }
      return saida;
    });

    expect(respostas[19]).toBe(true);
    expect(respostas[20]).toBe(false);
  });

  it("o contador é por tipo de tentativa: entrar não gasta a cota de cadastro", async () => {
    const s = sufixo();
    await comoAdmin(async (cliente) => {
      for (let i = 0; i < 9; i += 1) {
        await cliente.query("select public.registrar_tentativa('entrar', $1, $2)", [
          `hash-${s}`,
          `ip-${s}`,
        ]);
      }
    });

    const cadastro = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ registrar_tentativa: boolean }>(
        "select public.registrar_tentativa('cadastro', $1, $2)",
        [`hash-${s}`, `ip-${s}`],
      );
      return rows[0].registrar_tentativa;
    });

    expect(cadastro).toBe(true);
  });

  it("ninguém logado lê a tabela de tentativas", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.seg.${s}@exemplo.com.br`);
    await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-seg-${s}` });

    await expect(
      comoUsuario(dono, async (cliente) => {
        await cliente.query("select * from public.auth_attempts");
      }),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });
});

describe.skipIf(!disponivel)("0008_seguranca — LGPD", () => {
  it("anonimizar apaga o dado pessoal e mantém o histórico financeiro", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.lgpd.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-lgpd-${s}` });
    const profissional = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const servico = await criarServico(dono, empresaId, {
      nome: "Escova + hidratação",
      duracao: 90,
      preco: 12000,
    });
    const clienteId = await criarCliente(dono, empresaId, {
      nome: "Marina Alves",
      telefone: `+5565999${Math.floor(Math.random() * 900000) + 100000}`,
    });

    await comoUsuario(dono, async (cliente) => {
      await cliente.query("update public.clients set email = $1, document = $2, notes = $3 where id = $4", [
        "marina@exemplo.com.br",
        "12345678901",
        "Prefere horário da tarde.",
        clienteId,
      ]);
    });

    const lancamento = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.transactions
           (organization_id, kind, description, amount_cents, competence_date, status, paid_at, client_id)
         values ($1, 'receita', 'Escova + hidratação', 12000, current_date, 'pago', current_date, $2)
         returning id`,
        [empresaId, clienteId],
      );
      return rows[0].id;
    });

    await comoUsuario(dono, async (cliente) => {
      await cliente.query("select public.anonimizar_cliente($1)", [clienteId]);
    });

    const depois = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query(
        "select name, phone_e164, email, document, notes, deleted_at, whatsapp_opt_in from public.clients where id = $1",
        [clienteId],
      );
      const financeiro = await cliente.query(
        "select amount_cents, client_id from public.transactions where id = $1",
        [lancamento],
      );
      const auditoria = await cliente.query(
        "select action from public.audit_logs where entity_id = $1 and action = 'anonimizar_cliente'",
        [clienteId],
      );
      return { cliente: rows[0], financeiro: financeiro.rows[0], auditoria: auditoria.rows.length };
    });

    expect(depois.cliente.name).toBe("Cliente removido");
    expect(depois.cliente.phone_e164).toBeNull();
    expect(depois.cliente.email).toBeNull();
    expect(depois.cliente.document).toBeNull();
    expect(depois.cliente.notes).toBeNull();
    expect(depois.cliente.whatsapp_opt_in).toBe(false);
    expect(depois.cliente.deleted_at).not.toBeNull();

    // O dinheiro fica: o contador precisa dele.
    expect(depois.financeiro.amount_cents).toBe("12000");
    expect(depois.auditoria).toBe(1);

    expect(profissional).toBeTruthy();
    expect(servico).toBeTruthy();
  });

  it("só o dono anonimiza", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.anon.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-anon-${s}` });
    const clienteId = await criarCliente(dono, empresaId, { nome: "Juliana Prado" });

    const recepcao = await criarUsuario(`recep.anon.${s}@exemplo.com.br`);
    await comoAdmin(async (cliente) => {
      await cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'recepcao')",
        [empresaId, recepcao],
      );
    });

    await expect(
      comoUsuario(recepcao, async (cliente) => {
        await cliente.query("select public.anonimizar_cliente($1)", [clienteId]);
      }),
    ).rejects.toThrow(/Só o dono apaga/);
  });

  it("abrir anotação de cliente fica registrado na auditoria", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.nota.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-nota-${s}` });
    const clienteId = await criarCliente(dono, empresaId, { nome: "Beatriz Camargo" });

    await comoUsuario(dono, async (cliente) => {
      await cliente.query("select public.registrar_leitura_de_anotacao($1)", [clienteId]);
    });

    const registros = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query(
        "select user_id from public.audit_logs where entity_id = $1 and action = 'ler_anotacao'",
        [clienteId],
      );
      return rows;
    });

    expect(registros).toHaveLength(1);
    expect(registros[0].user_id).toBe(dono);
  });

  it("anotação de cliente de outra empresa não pode nem ser registrada", async () => {
    const s = sufixo();
    const donoA = await criarUsuario(`a.nota.${s}@exemplo.com.br`);
    const donoB = await criarUsuario(`b.nota.${s}@exemplo.com.br`);
    const empresaA = await criarEmpresa(donoA, { nome: `A ${s}`, slug: `a-nota-${s}` });
    await criarEmpresa(donoB, { nome: `B ${s}`, slug: `b-nota-${s}` });
    const clienteDeA = await criarCliente(donoA, empresaA, { nome: "Cliente de A" });

    await expect(
      comoUsuario(donoB, async (cliente) => {
        await cliente.query("select public.registrar_leitura_de_anotacao($1)", [clienteDeA]);
      }),
    ).rejects.toThrow(/outra empresa|permission denied/i);
  });
});

describe.skipIf(!disponivel)("isolamento entre empresas e cegueira do contador", () => {
  it("o contador não lê telefone nem anotações dos clientes do cliente dele", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.cego.${s}@exemplo.com.br`);
    const contador = await criarUsuario(`contador.cego.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-cego-${s}` });

    await comoAdmin(async (cliente) => {
      await cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'contador')",
        [empresaId, contador],
      );
    });

    const clienteId = await criarCliente(dono, empresaId, {
      nome: "Marina Alves",
      telefone: `+5565998${Math.floor(Math.random() * 900000) + 100000}`,
    });
    await comoUsuario(dono, async (cliente) => {
      await cliente.query("update public.clients set notes = $1, document = $2 where id = $3", [
        "Prefere horário da tarde.",
        "12345678901",
        clienteId,
      ]);
    });

    // A tabela de clientes é invisível para o contador.
    const pelaTabela = await comoUsuario(contador, async (cliente) => {
      const { rows } = await cliente.query("select id from public.clients");
      return rows.length;
    });
    expect(pelaTabela).toBe(0);

    // A visão que ele enxerga traz só o que a contabilidade precisa.
    const pelaVisao = await comoUsuario(contador, async (cliente) => {
      const { rows } = await cliente.query(
        "select * from public.clientes_para_contabilidade where id = $1",
        [clienteId],
      );
      return rows[0];
    });

    expect(pelaVisao).toBeTruthy();
    expect(Object.keys(pelaVisao)).not.toContain("phone_e164");
    expect(Object.keys(pelaVisao)).not.toContain("notes");
    expect(Object.keys(pelaVisao)).not.toContain("email");
    expect(pelaVisao.name).toBe("Marina Alves");
  });

  it("duas empresas: nenhuma lê nem altera nada da outra", async () => {
    const s = sufixo();
    const donoA = await criarUsuario(`a.iso.${s}@exemplo.com.br`);
    const donoB = await criarUsuario(`b.iso.${s}@exemplo.com.br`);
    const empresaA = await criarEmpresa(donoA, { nome: `A ${s}`, slug: `a-iso-${s}` });
    const empresaB = await criarEmpresa(donoB, { nome: `B ${s}`, slug: `b-iso-${s}` });

    const profA = await criarProfissional(donoA, empresaA, "Ana Ribeiro");
    const servicoA = await criarServico(donoA, empresaA, {
      nome: "Escova",
      duracao: 60,
      preco: 12000,
    });
    const clienteA = await criarCliente(donoA, empresaA, { nome: "Marina Alves" });

    const atendimentoA = await comoUsuario(donoA, async (cliente) => {
      const inicio = new Date(Date.now() + 86_400_000);
      const fim = new Date(inicio.getTime() + 3_600_000);
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.appointments
           (organization_id, professional_id, client_id, service_id, starts_at, ends_at, price_cents)
         values ($1, $2, $3, $4, $5, $6, 12000) returning id`,
        [empresaA, profA, clienteA, servicoA, inicio.toISOString(), fim.toISOString()],
      );
      return rows[0].id;
    });

    // B não lê nada de A, em nenhuma tabela com dado de empresa.
    const vistoPorB = await comoUsuario(donoB, async (cliente) => {
      const contagens: Record<string, number> = {};
      for (const tabela of [
        "professionals",
        "services",
        "clients",
        "appointments",
        "transactions",
        "categories",
        "accounts",
      ]) {
        const { rows } = await cliente.query(
          `select id from public.${tabela} where organization_id = $1`,
          [empresaA],
        );
        contagens[tabela] = rows.length;
      }
      return contagens;
    });

    for (const [tabela, quantidade] of Object.entries(vistoPorB)) {
      expect(quantidade, tabela).toBe(0);
    }

    // E não altera: o update não acha a linha, então não muda nada.
    const alterados = await comoUsuario(donoB, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.appointments set price_cents = 1 where id = $1",
        [atendimentoA],
      );
      return rowCount;
    });
    expect(alterados).toBe(0);

    const intacto = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query(
        "select price_cents from public.appointments where id = $1",
        [atendimentoA],
      );
      return rows[0].price_cents;
    });
    expect(intacto).toBe("12000");
    expect(empresaB).toBeTruthy();
  });
});
