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
  const dono = await criarUsuario(`dono.agenda.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, { nome: `Barbearia ${s}`, slug: `barbearia-${s}` });
  const profissionalId = await criarProfissional(dono, empresaId, "Rafael");
  const servicoId = await criarServico(dono, empresaId, { nome: "Corte", duracao: 30, preco: 5000 });
  const clienteId = await criarCliente(dono, empresaId, {
    nome: "João da Silva",
    telefone: `+5566${Math.floor(100000000 + Math.random() * 899999999)}`,
  });
  return { s, dono, empresaId, profissionalId, servicoId, clienteId };
}

describe.skipIf(!disponivel)("0002_agenda — o banco não deixa dois atendimentos no mesmo horário", () => {
  it("recusa o segundo atendimento que encosta no primeiro (erro 23P01)", async () => {
    const c = await cenario();

    await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-05T12:00:00Z",
      fim: "2026-10-05T12:30:00Z",
    });

    await expect(
      criarAtendimento(c.dono, {
        empresaId: c.empresaId,
        profissionalId: c.profissionalId,
        clienteId: c.clienteId,
        servicoId: c.servicoId,
        inicio: "2026-10-05T12:15:00Z",
        fim: "2026-10-05T12:45:00Z",
      }),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("deixa marcar encaixado logo depois do anterior", async () => {
    const c = await cenario();

    await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-06T12:00:00Z",
      fim: "2026-10-06T12:30:00Z",
    });

    const segundo = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-06T12:30:00Z",
      fim: "2026-10-06T13:00:00Z",
    });

    expect(segundo).toBeTruthy();
  });

  it("cancelado e concluído liberam o horário", async () => {
    const c = await cenario();

    for (const status of ["cancelado", "concluido"]) {
      await criarAtendimento(c.dono, {
        empresaId: c.empresaId,
        profissionalId: c.profissionalId,
        clienteId: c.clienteId,
        servicoId: c.servicoId,
        inicio: "2026-10-07T12:00:00Z",
        fim: "2026-10-07T12:30:00Z",
        status,
      });
    }

    const ativo = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-07T12:00:00Z",
      fim: "2026-10-07T12:30:00Z",
    });

    expect(ativo).toBeTruthy();
  });

  it("dois profissionais atendem no mesmo horário", async () => {
    const c = await cenario();
    const outro = await criarProfissional(c.dono, c.empresaId, "Camila");

    await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-08T12:00:00Z",
      fim: "2026-10-08T12:30:00Z",
    });

    const emParalelo = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: outro,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-08T12:00:00Z",
      fim: "2026-10-08T12:30:00Z",
    });

    expect(emParalelo).toBeTruthy();
  });

  it("recusa atendimento que termina antes de começar", async () => {
    const c = await cenario();

    await expect(
      criarAtendimento(c.dono, {
        empresaId: c.empresaId,
        profissionalId: c.profissionalId,
        clienteId: c.clienteId,
        servicoId: c.servicoId,
        inicio: "2026-10-09T13:00:00Z",
        fim: "2026-10-09T12:00:00Z",
      }),
    ).rejects.toThrow(/check constraint|restrição/i);
  });
});

describe.skipIf(!disponivel)("agenda — papéis e faltas", () => {
  it("o profissional vê a agenda, mas não altera serviços", async () => {
    const c = await cenario();
    const profissional = await criarUsuario(`profissional.${c.s}@exemplo.com.br`);

    await comoAdmin((cliente) =>
      cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'profissional')",
        [c.empresaId, profissional],
      ),
    );

    const servicos = await comoUsuario(profissional, async (cliente) => {
      const { rows } = await cliente.query("select id from public.services");
      return rows.length;
    });
    expect(servicos).toBe(1);

    const alterados = await comoUsuario(profissional, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.services set price_cents = 1 where id = $1",
        [c.servicoId],
      );
      return rowCount;
    });
    expect(alterados).toBe(0);
  });

  it("marcar falta soma no contador do cliente uma única vez", async () => {
    const c = await cenario();
    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-10T12:00:00Z",
      fim: "2026-10-10T12:30:00Z",
    });

    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.marcar_falta($1)", [atendimento]),
    );
    await comoUsuario(c.dono, (cliente) =>
      cliente.query("select public.marcar_falta($1)", [atendimento]),
    );

    const resultado = await comoUsuario(c.dono, async (cliente) => {
      const { rows } = await cliente.query<{ faltas: number; status: string }>(
        `select c.no_show_count as faltas, a.status
           from public.clients c
           join public.appointments a on a.client_id = c.id
          where a.id = $1`,
        [atendimento],
      );
      return rows[0];
    });

    expect(resultado.status).toBe("faltou");
    expect(Number(resultado.faltas)).toBe(1);
  });

  it("quem é de outra empresa não marca falta em atendimento alheio", async () => {
    const c = await cenario();
    const estranho = await criarUsuario(`estranho.agenda.${c.s}@exemplo.com.br`);
    await criarEmpresa(estranho, { nome: `Outro ${c.s}`, slug: `outro-${c.s}` });

    const atendimento = await criarAtendimento(c.dono, {
      empresaId: c.empresaId,
      profissionalId: c.profissionalId,
      clienteId: c.clienteId,
      servicoId: c.servicoId,
      inicio: "2026-10-11T12:00:00Z",
      fim: "2026-10-11T12:30:00Z",
    });

    await expect(
      comoUsuario(estranho, (cliente) =>
        cliente.query("select public.marcar_falta($1)", [atendimento]),
      ),
    ).rejects.toThrow(/Sem permissão/i);
  });
});
