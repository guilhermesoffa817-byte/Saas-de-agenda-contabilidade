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

describe.skipIf(!disponivel)("0001_fundacao — isolamento por empresa (RLS)", () => {
  it("quem cria a empresa entra como dono", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dona.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Salão ${s}`, slug: `salao-${s}` });

    const papel = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ role: string }>(
        "select role from public.organization_members where organization_id = $1 and user_id = $2",
        [empresa, dono],
      );
      return rows[0]?.role;
    });

    expect(papel).toBe("dono");
  });

  it("um usuário não enxerga nada da empresa de outro", async () => {
    const a = sufixo();
    const b = sufixo();
    const donoA = await criarUsuario(`a.${a}@exemplo.com.br`);
    const donoB = await criarUsuario(`b.${b}@exemplo.com.br`);
    const empresaA = await criarEmpresa(donoA, { nome: `Barbearia ${a}`, slug: `barbearia-${a}` });
    const empresaB = await criarEmpresa(donoB, { nome: `Clínica ${b}`, slug: `clinica-${b}` });

    const visto = await comoUsuario(donoA, async (cliente) => {
      const empresas = await cliente.query<{ id: string }>("select id from public.organizations");
      const equipe = await cliente.query("select organization_id from public.organization_members");
      return {
        empresas: empresas.rows.map((r) => r.id),
        equipes: equipe.rows.map((r) => r.organization_id),
      };
    });

    expect(visto.empresas).toEqual([empresaA]);
    expect(visto.empresas).not.toContain(empresaB);
    expect(visto.equipes).toEqual([empresaA]);
  });

  it("um usuário não altera a empresa de outro", async () => {
    const s = sufixo();
    const donoA = await criarUsuario(`intruso.${s}@exemplo.com.br`);
    const donoB = await criarUsuario(`vitima.${s}@exemplo.com.br`);
    await criarEmpresa(donoA, { nome: `Studio ${s}`, slug: `studio-${s}` });
    const empresaB = await criarEmpresa(donoB, { nome: `Consultório ${s}`, slug: `consultorio-${s}` });

    const alteradas = await comoUsuario(donoA, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.organizations set name = 'invadida' where id = $1",
        [empresaB],
      );
      return rowCount;
    });

    expect(alteradas).toBe(0);

    const nome = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ name: string }>(
        "select name from public.organizations where id = $1",
        [empresaB],
      );
      return rows[0].name;
    });
    expect(nome).toBe(`Consultório ${s}`);
  });

  it("o dono edita o cadastro, mas não muda plano nem status da assinatura", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`plano.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Personal ${s}`, slug: `personal-${s}` });

    const cadastro = await comoUsuario(dono, async (cliente) => {
      const { rowCount } = await cliente.query(
        "update public.organizations set city = 'Cuiabá', state = 'MT' where id = $1",
        [empresa],
      );
      return rowCount;
    });
    expect(cadastro).toBe(1);

    await expect(
      comoUsuario(dono, (cliente) =>
        cliente.query("update public.organizations set plan = 'negocio' where id = $1", [empresa]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);

    await expect(
      comoUsuario(dono, (cliente) =>
        cliente.query("update public.organizations set trial_ends_at = now() + interval '90 days' where id = $1", [
          empresa,
        ]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("ninguém se coloca na equipe de uma empresa por conta própria", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.equipe.${s}@exemplo.com.br`);
    const estranho = await criarUsuario(`estranho.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Terapias ${s}`, slug: `terapias-${s}` });

    await expect(
      comoUsuario(estranho, (cliente) =>
        cliente.query(
          "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'dono')",
          [empresa, estranho],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("o convite só é aceito pelo e-mail convidado", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.convite.${s}@exemplo.com.br`);
    const contador = await criarUsuario(`contador.${s}@exemplo.com.br`);
    const outro = await criarUsuario(`outro.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Estética ${s}`, slug: `estetica-${s}` });

    const token = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ token: string }>(
        `insert into public.organization_invites (organization_id, email, role)
         values ($1, $2, 'contador') returning token`,
        [empresa, `contador.${s}@exemplo.com.br`],
      );
      return rows[0].token;
    });

    await expect(
      comoUsuario(outro, (cliente) => cliente.query("select public.accept_invite($1)", [token])),
    ).rejects.toThrow(/outro e-mail/i);

    const empresaAceita = await comoUsuario(contador, async (cliente) => {
      const { rows } = await cliente.query<{ accept_invite: string }>(
        "select public.accept_invite($1)",
        [token],
      );
      return rows[0].accept_invite;
    });
    expect(empresaAceita).toBe(empresa);

    const papel = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ role: string }>(
        "select role from public.organization_members where organization_id = $1 and user_id = $2",
        [empresa, contador],
      );
      return rows[0]?.role;
    });
    expect(papel).toBe("contador");

    await expect(
      comoUsuario(contador, (cliente) => cliente.query("select public.accept_invite($1)", [token])),
    ).rejects.toThrow(/inválido ou expirado/i);
  });

  it("convite expirado não vale", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.exp.${s}@exemplo.com.br`);
    const convidado = await criarUsuario(`convidado.exp.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Spa ${s}`, slug: `spa-${s}` });

    const token = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query<{ token: string }>(
        `insert into public.organization_invites (organization_id, email, role, expires_at)
         values ($1, $2, 'recepcao', now() - interval '1 day') returning token`,
        [empresa, `convidado.exp.${s}@exemplo.com.br`],
      );
      return rows[0].token;
    });

    await expect(
      comoUsuario(convidado, (cliente) => cliente.query("select public.accept_invite($1)", [token])),
    ).rejects.toThrow(/inválido ou expirado/i);
  });

  it("só o dono lê a auditoria da própria empresa", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`dono.audit.${s}@exemplo.com.br`);
    const recepcao = await criarUsuario(`recepcao.${s}@exemplo.com.br`);
    const empresa = await criarEmpresa(dono, { nome: `Odonto ${s}`, slug: `odonto-${s}` });

    await comoAdmin(async (cliente) => {
      await cliente.query(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'recepcao')",
        [empresa, recepcao],
      );
      await cliente.query(
        "insert into public.audit_logs (organization_id, user_id, action) values ($1, $2, 'exportacao.livro_caixa')",
        [empresa, dono],
      );
    });

    const doDono = await comoUsuario(dono, async (cliente) => {
      const { rows } = await cliente.query("select action from public.audit_logs");
      return rows.length;
    });
    const daRecepcao = await comoUsuario(recepcao, async (cliente) => {
      const { rows } = await cliente.query("select action from public.audit_logs");
      return rows.length;
    });

    expect(doDono).toBe(1);
    expect(daRecepcao).toBe(0);
  });

  it("o slug da empresa segue o formato do link público", async () => {
    const s = sufixo();
    const dono = await criarUsuario(`slug.${s}@exemplo.com.br`);

    await expect(
      criarEmpresa(dono, { nome: "Nome Com Espaço", slug: "Salão do João" }),
    ).rejects.toThrow(/violates check constraint|viola a restrição/i);
  });
});
