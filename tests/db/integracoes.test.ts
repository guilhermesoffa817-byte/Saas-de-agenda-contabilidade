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

/** Convida alguém para a empresa com o papel pedido e devolve o id do usuário. */
async function membro(dono: string, empresaId: string, email: string, papel: string) {
  const usuario = await criarUsuario(email);
  await comoAdmin(async (cliente) => {
    await cliente.query(
      "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3::public.member_role)",
      [empresaId, usuario, papel],
    );
  });
  void dono;
  return usuario;
}

describe.skipIf(!disponivel)("0010_integracoes — WhatsApp, nota e agenda no celular", () => {
  it("o registro de envios é lido por dono e recepção, e ninguém logado escreve nele", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.int.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-int-${s}` });
    const recepcao = await membro(dono, empresaId, `recepcao.int.${s}@exemplo.com.br`, "recepcao");
    const profissionalUser = await membro(
      dono,
      empresaId,
      `prof.int.${s}@exemplo.com.br`,
      "profissional",
    );

    await comoAdmin(async (cliente) => {
      await cliente.query(
        "insert into public.message_logs (organization_id, template) values ($1, 'lembrete_agendamento')",
        [empresaId],
      );
    });

    const lidosPeloDono = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query("select id from public.message_logs");
      return rows.length;
    });
    const lidosPelaRecepcao = await comoUsuario(recepcao, async (cliente) => {
      const { rows } = await cliente.query("select id from public.message_logs");
      return rows.length;
    });
    const lidosPeloProfissional = await comoUsuario(profissionalUser, async (cliente) => {
      const { rows } = await cliente.query("select id from public.message_logs");
      return rows.length;
    });

    expect(lidosPeloDono).toBe(1);
    expect(lidosPelaRecepcao).toBe(1);
    expect(lidosPeloProfissional).toBe(0);

    await expect(
      comoUsuario(dono, async (cliente) => {
        await cliente.query(
          "insert into public.message_logs (organization_id, template) values ($1, 'inventado')",
          [empresaId],
        );
      }),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("uma empresa não enxerga o envio da outra", async () => {
    const s = sufixo();
    const donoA = await criarUsuario(`a.int.${s}@exemplo.com.br`);
    const donoB = await criarUsuario(`b.int.${s}@exemplo.com.br`);
    const empresaA = await criarEmpresa(donoA, { nome: `A ${s}`, slug: `a-int-${s}` });
    const empresaB = await criarEmpresa(donoB, { nome: `B ${s}`, slug: `b-int-${s}` });

    await comoAdmin(async (cliente) => {
      await cliente.query(
        "insert into public.message_logs (organization_id, template) values ($1, 'lembrete_agendamento')",
        [empresaA],
      );
    });

    const vistosPorB = await comoUsuario(donoB, async (cliente) => {
      const { rows } = await cliente.query("select id from public.message_logs");
      return rows.length;
    });

    expect(vistosPorB).toBe(0);
    expect(empresaB).toBeTruthy();
  });

  it("cada profissional nasce com um link de agenda próprio, e só o dono troca o dele", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.ical.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-ical-${s}` });
    const ana = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const camila = await criarProfissional(dono, empresaId, "Camila Duarte");

    const tokens = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ ical_token: string }>(
        "select ical_token from public.professionals where id = any($1)",
        [[ana, camila]],
      );
      return rows.map((linha) => linha.ical_token);
    });

    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(tokens[0]).not.toBe(tokens[1]);

    // Escrever o token na mão não é permitido: só a função sorteia.
    await expect(
      comoUsuario(dono, async (cliente) => {
        await cliente.query("update public.professionals set ical_token = $1 where id = $2", [
          "token-escolhido-a-mao",
          ana,
        ]);
      }),
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const novo = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ gerar_token_ical: string }>(
        "select public.gerar_token_ical($1)",
        [ana],
      );
      return rows[0].gerar_token_ical;
    });

    expect(novo).toMatch(/^[0-9a-f]{32}$/);
    expect(novo).not.toBe(tokens[0]);

    // Quem não é dono não troca o link.
    const recepcao = await membro(dono, empresaId, `recep.ical.${s}@exemplo.com.br`, "recepcao");
    await expect(
      comoUsuario(recepcao, async (cliente) => {
        await cliente.query("select public.gerar_token_ical($1)", [ana]);
      }),
    ).rejects.toThrow(/Só o dono troca o link/);
  });

  it("o resultado da nota vindo do provedor marca o lançamento como emitido", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.nf.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-nf-${s}` });
    const profissional = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const servico = await criarServico(dono, empresaId, {
      nome: "Escova + hidratação",
      duracao: 90,
      preco: 12000,
    });
    const clienteId = await criarCliente(dono, empresaId, {
      nome: "Marina Alves",
      telefone: "+5565999990001",
    });

    const lancamento = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.transactions
           (organization_id, kind, description, amount_cents, competence_date, status, paid_at, client_id)
         values ($1, 'receita', 'Escova + hidratação — Marina Alves', 12000, current_date, 'pago', current_date, $2)
         returning id`,
        [empresaId, clienteId],
      );
      return rows[0].id;
    });

    const notaId = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.invoices (organization_id, transaction_id, provider, provider_invoice_id)
         values ($1, $2, 'homologacao', 'nf-teste-${s}') returning id`,
        [empresaId, lancamento],
      );
      return rows[0].id;
    });

    const aplicado = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ aplicar_resultado_da_nota: string | null }>(
        `select public.aplicar_resultado_da_nota(
           'homologacao', 'nf-teste-${s}', 'emitida', '2026/000123', 'ABC123',
           'notas/${s}.xml', 'notas/${s}.pdf', null
         )`,
      );
      return rows[0].aplicar_resultado_da_nota;
    });

    expect(aplicado).toBe(notaId);

    const depois = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ nota_fiscal_emitida: boolean }>(
        "select nota_fiscal_emitida from public.transactions where id = $1",
        [lancamento],
      );
      const nota = await cliente.query<{ status: string; numero: string; pdf_path: string }>(
        "select status, numero, pdf_path from public.invoices where id = $1",
        [notaId],
      );
      return { marcado: rows[0].nota_fiscal_emitida, nota: nota.rows[0] };
    });

    expect(depois.marcado).toBe(true);
    expect(depois.nota.status).toBe("emitida");
    expect(depois.nota.numero).toBe("2026/000123");
    expect(depois.nota.pdf_path).toBe(`notas/${s}.pdf`);
    expect(profissional).toBeTruthy();
    expect(servico).toBeTruthy();
  });

  it("webhook de nota que não é nossa não derruba nada", async () => {
    const aplicado = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ aplicar_resultado_da_nota: string | null }>(
        "select public.aplicar_resultado_da_nota('homologacao', 'nao-existe', 'emitida')",
      );
      return rows[0].aplicar_resultado_da_nota;
    });

    expect(aplicado).toBeNull();
  });

  it("o mesmo id de mensagem do provedor não entra duas vezes", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.dup.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-dup-${s}` });

    await comoAdmin(async (cliente) => {
      await cliente.query(
        `insert into public.message_logs (organization_id, template, provider_message_id)
         values ($1, 'lembrete_agendamento', 'wamid.${s}')`,
        [empresaId],
      );
    });

    await expect(
      comoAdmin(async (cliente) => {
        await cliente.query(
          `insert into public.message_logs (organization_id, template, provider_message_id)
           values ($1, 'lembrete_agendamento', 'wamid.${s}')`,
          [empresaId],
        );
      }),
    ).rejects.toThrow(/duplicate key|chave duplicada/i);
  });
});

describe.skipIf(!disponivel)("reserva do lembrete — duas execuções, um envio só", () => {
  it("o update que reserva devolve o atendimento uma única vez", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.cron.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-cron-${s}` });
    const profissional = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const servico = await criarServico(dono, empresaId, {
      nome: "Escova + hidratação",
      duracao: 90,
      preco: 12000,
    });
    const clienteId = await criarCliente(dono, empresaId, {
      nome: "Marina Alves",
      telefone: "+5565999990001",
    });

    // Um atendimento daqui a 23h30: dentro da janela do lembrete.
    const inicio = new Date(Date.now() + 23.5 * 3_600_000);
    const fim = new Date(inicio.getTime() + 90 * 60_000);
    await comoUsuario(dono, async (cliente) => {
      await cliente.query(
        `insert into public.appointments
           (organization_id, professional_id, client_id, service_id, starts_at, ends_at, price_cents)
         values ($1, $2, $3, $4, $5, $6, 12000)`,
        [empresaId, profissional, clienteId, servico, inicio.toISOString(), fim.toISOString()],
      );
    });

    // O mesmo update que a rota do cron roda, duas vezes seguidas.
    const reservar = () =>
      comoAdmin(async (cliente) => {
        const { rows } = await cliente.query<{ id: string }>(
          `update public.appointments set reminder_sent_at = now()
             where status = 'agendado'
               and reminder_sent_at is null
               and starts_at >= now() + interval '23 hours'
               and starts_at < now() + interval '24 hours'
               and organization_id = $1
           returning id`,
          [empresaId],
        );
        return rows.map((linha) => linha.id);
      });

    const primeira = await reservar();
    const segunda = await reservar();

    expect(primeira).toHaveLength(1);
    expect(segunda).toHaveLength(0);
  });

  it("devolver a reserva faz a execução seguinte tentar de novo", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.retry.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-retry-${s}` });
    const profissional = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const servico = await criarServico(dono, empresaId, {
      nome: "Corte feminino",
      duracao: 60,
      preco: 9000,
    });
    const clienteId = await criarCliente(dono, empresaId, { nome: "Juliana Prado" });

    const inicio = new Date(Date.now() + 23.5 * 3_600_000);
    const fim = new Date(inicio.getTime() + 60 * 60_000);
    const atendimento = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.appointments
           (organization_id, professional_id, client_id, service_id, starts_at, ends_at, price_cents)
         values ($1, $2, $3, $4, $5, $6, 9000) returning id`,
        [empresaId, profissional, clienteId, servico, inicio.toISOString(), fim.toISOString()],
      );
      return rows[0].id;
    });

    await comoAdmin(async (cliente) => {
      await cliente.query("update public.appointments set reminder_sent_at = now() where id = $1", [
        atendimento,
      ]);
      // O envio falhou: a rota devolve a reserva.
      await cliente.query("update public.appointments set reminder_sent_at = null where id = $1", [
        atendimento,
      ]);
    });

    const denovo = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `update public.appointments set reminder_sent_at = now()
           where reminder_sent_at is null and organization_id = $1
         returning id`,
        [empresaId],
      );
      return rows.map((linha) => linha.id);
    });

    expect(denovo).toEqual([atendimento]);
  });

  it("atendimento cancelado ou fora da janela não entra na reserva", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.janela.${s}@exemplo.com.br`);
    const empresaId = await criarEmpresa(dono, { nome: `Studio ${s}`, slug: `studio-janela-${s}` });
    const profissional = await criarProfissional(dono, empresaId, "Ana Ribeiro");
    const servico = await criarServico(dono, empresaId, {
      nome: "Manicure",
      duracao: 45,
      preco: 5500,
    });
    const clienteId = await criarCliente(dono, empresaId, { nome: "Sônia Meireles" });

    const marcar = async (emHoras: number, status: string) => {
      const inicio = new Date(Date.now() + emHoras * 3_600_000);
      const fim = new Date(inicio.getTime() + 45 * 60_000);
      await comoUsuario(dono, async (cliente) => {
        await cliente.query(
          `insert into public.appointments
             (organization_id, professional_id, client_id, service_id, starts_at, ends_at, status, price_cents)
           values ($1, $2, $3, $4, $5, $6, $7::public.appointment_status, 5500)`,
          [
            empresaId,
            profissional,
            clienteId,
            servico,
            inicio.toISOString(),
            fim.toISOString(),
            status,
          ],
        );
      });
    };

    await marcar(10, "agendado"); // cedo demais
    await marcar(30, "agendado"); // tarde demais
    await marcar(23.5, "cancelado"); // dentro da janela, mas cancelado

    const reservados = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ id: string }>(
        `update public.appointments set reminder_sent_at = now()
           where status = 'agendado'
             and reminder_sent_at is null
             and starts_at >= now() + interval '23 hours'
             and starts_at < now() + interval '24 hours'
             and organization_id = $1
         returning id`,
        [empresaId],
      );
      return rows.length;
    });

    expect(reservados).toBe(0);
  });
});
