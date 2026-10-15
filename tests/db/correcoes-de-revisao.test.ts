import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  bancoDisponivel,
  comoAdmin,
  comoUsuario,
  criarEmpresa,
  criarProfissional,
  criarUsuario,
  fecharBanco,
  sufixo,
} from "./ajuda";

/**
 * Migração 0015: correções da revisão adversarial (franquia de IA, histórico do
 * assistente, conversa, anonimização, vínculo, pagamento protegido, Carnê-Leão,
 * origem 'regra' e retenção dos envios).
 */
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

async function cenario() {
  const s = sufixo();
  const dono = await criarUsuario(`dono.cr.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, { nome: `Espaço ${s}`, slug: `espaco-cr-${s}` });
  const socio = await membro(empresaId, `socio.cr.${s}@exemplo.com.br`, "dono");
  const recepcao = await membro(empresaId, `recepcao.cr.${s}@exemplo.com.br`, "recepcao");
  const contador = await membro(empresaId, `contador.cr.${s}@exemplo.com.br`, "contador");
  const estranho = await criarUsuario(`estranho.cr.${s}@exemplo.com.br`);
  return { s, dono, socio, recepcao, contador, estranho, empresaId };
}

/** Abre uma transação como usuário logado e devolve a conexão (para testar corrida). */
async function abrirComoUsuario(cliente: PoolClient, userId: string) {
  await cliente.query("begin");
  await cliente.query("set local role authenticated");
  await cliente.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

const reservar = (uid: string, empresaId: string, unidades = 1, limite = 20, recurso = "assistente") =>
  comoUsuario(uid, async (k) => {
    const { rows } = await k.query<{ ids: string[] }>(
      "select public.reservar_uso_de_ia($1, $2, $3, $4) as ids",
      [empresaId, recurso, unidades, limite],
    );
    return rows[0].ids.map(Number);
  });

const linhasDeUso = (empresaId: string) =>
  comoAdmin(async (k) =>
    (
      await k.query<{
        id: string;
        user_id: string | null;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_creation_tokens: number;
        web_searches: number;
      }>("select * from public.ai_usage_logs where organization_id = $1 order by id", [empresaId])
    ).rows,
  );

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 a — franquia de IA reservada antes da chamada", () => {
  it("reserva as unidades no nome de quem pede e devolve os ids", async () => {
    const c = await cenario();
    const ids = await reservar(c.dono, c.empresaId, 3, 100, "classificacao");
    expect(ids).toHaveLength(3);
    const linhas = await linhasDeUso(c.empresaId);
    expect(linhas.map((l) => Number(l.id))).toEqual(ids);
    expect(new Set(linhas.map((l) => l.user_id))).toEqual(new Set([c.dono]));
    const uso = await comoUsuario(c.dono, async (k) =>
      (await k.query("select public.uso_de_ia_no_mes($1, 'classificacao') as n", [c.empresaId])).rows[0].n,
    );
    expect(uso).toBe(3);
  });

  it("recusa o que passa do limite, com a mensagem certa, e não grava nada", async () => {
    const c = await cenario();
    await reservar(c.dono, c.empresaId, 2, 3);
    await expect(reservar(c.dono, c.empresaId, 2, 3)).rejects.toThrow(/não cobre este pedido: restam 1/);
    await reservar(c.dono, c.empresaId, 1, 3);
    await expect(reservar(c.dono, c.empresaId, 1, 3)).rejects.toThrow(/franquia de IA deste mês acabou/);
    expect(await linhasDeUso(c.empresaId)).toHaveLength(3);
  });

  it("só o dono reserva; quantidade e recurso são conferidos", async () => {
    const c = await cenario();
    for (const uid of [c.contador, c.recepcao, c.estranho]) {
      await expect(reservar(uid, c.empresaId)).rejects.toThrow(/Sem permissão/);
    }
    await expect(reservar(c.dono, c.empresaId, 0)).rejects.toThrow(/inválida/);
    await expect(reservar(c.dono, c.empresaId, 1, 20, "outra")).rejects.toThrow(/desconhecido/);
  });

  it("corrida: duas transações ao mesmo tempo com limite 1 — só uma passa", async () => {
    const c = await cenario();
    await comoAdmin(async (a) => {
      await comoAdmin(async (b) => {
        await abrirComoUsuario(a, c.dono);
        await abrirComoUsuario(b, c.socio);
        try {
          await a.query("select public.reservar_uso_de_ia($1, 'assistente', 1, 1)", [c.empresaId]);
          // A ainda não confirmou. Sem a trava, B contaria 0 e passaria agora.
          let terminou = false;
          const pedidoB = b
            .query("select public.reservar_uso_de_ia($1, 'assistente', 1, 1)", [c.empresaId])
            .finally(() => {
              terminou = true;
            });
          pedidoB.catch(() => {});
          await new Promise((r) => setTimeout(r, 300));
          expect(terminou).toBe(false); // B espera na fila da empresa
          await a.query("commit");
          await expect(pedidoB).rejects.toThrow(/franquia de IA deste mês acabou/);
        } finally {
          await a.query("rollback").catch(() => {});
          await b.query("rollback").catch(() => {});
        }
      });
    });
    expect(await linhasDeUso(c.empresaId)).toHaveLength(1);
  });

  it("atualizar grava os tokens na primeira linha, só do próprio usuário, sem diminuir", async () => {
    const c = await cenario();
    const ids = await reservar(c.dono, c.empresaId, 2, 100, "classificacao");
    const atualizar = (uid: string, valores: number[]) =>
      comoUsuario(uid, async (k) =>
        (
          await k.query("select public.atualizar_uso_de_ia($1::bigint[], $2, $3, $4, $5, $6) as n", [
            ids,
            ...valores,
          ])
        ).rows[0].n,
      );
    expect(await atualizar(c.dono, [1000, 200, 800, 300, 1])).toBe(1);
    // Totais acumulados de novo, maiores: atualiza. Zeros pelo navegador: nada diminui.
    expect(await atualizar(c.dono, [2500, 500, 800, 1200, 2])).toBe(1);
    expect(await atualizar(c.dono, [0, 0, 0, 0, 0])).toBe(1);
    // O sócio (também dono) não mexe no registro alheio.
    expect(await atualizar(c.socio, [9, 9, 9, 9, 9])).toBe(0);

    const linhas = await linhasDeUso(c.empresaId);
    expect(linhas[0]).toMatchObject({
      input_tokens: 2500,
      output_tokens: 500,
      cache_read_tokens: 800,
      cache_creation_tokens: 1200,
      web_searches: 2,
    });
    expect(linhas[1]).toMatchObject({ input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0 });

    // Reserva de mais de 1 dia não muda mais.
    await comoAdmin((k) =>
      k.query("update public.ai_usage_logs set created_at = now() - interval '2 days' where id = any($1::bigint[])", [
        ids,
      ]),
    );
    expect(await atualizar(c.dono, [9999, 9999, 9999, 9999, 9])).toBe(0);
    await expect(atualizar(c.dono, [-1, 0, 0, 0, 0])).rejects.toThrow(/inválido/);
  });

  it("cancelar é só do servidor e só devolve reserva recente, sem tokens, da pessoa certa", async () => {
    const c = await cenario();
    const [comTokens] = await reservar(c.dono, c.empresaId);
    const [velha] = await reservar(c.dono, c.empresaId);
    const [livre, livre2] = await reservar(c.dono, c.empresaId, 2);
    await comoUsuario(c.dono, (k) =>
      k.query("select public.atualizar_uso_de_ia(array[$1]::bigint[], 10, 5, 0, 0, 0)", [comTokens]),
    );
    await comoAdmin((k) =>
      k.query("update public.ai_usage_logs set created_at = now() - interval '20 minutes' where id = $1", [velha]),
    );

    // O navegador (dono logado) não cancela: senão cancelaria a reserva em andamento.
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("select public.cancelar_uso_de_ia($1::bigint[], $2, $3)", [[livre], c.empresaId, c.dono]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const cancelar = (ids: number[], org: string, user: string) =>
      comoAdmin(async (k) => {
        await k.query("begin");
        try {
          await k.query("set local role service_role");
          const { rows } = await k.query("select public.cancelar_uso_de_ia($1::bigint[], $2, $3) as n", [
            ids,
            org,
            user,
          ]);
          await k.query("commit");
          return rows[0].n as number;
        } catch (erro) {
          await k.query("rollback");
          throw erro;
        }
      });
    expect(await cancelar([livre], c.empresaId, c.socio)).toBe(0); // de outra pessoa
    expect(await cancelar([comTokens, velha, livre, livre2], c.empresaId, c.dono)).toBe(2);
    const sobrou = (await linhasDeUso(c.empresaId)).map((l) => Number(l.id));
    expect(sobrou).toEqual([comTokens, velha]);
  });
});

/* ========================================================================= */

async function conversa(uid: string, empresaId: string, extra: { snapshot?: string } = {}) {
  return comoUsuario(uid, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      "insert into public.ai_conversations (organization_id, user_id, title, system_snapshot) values ($1, $2, 'Como foi setembro?', $3) returning id",
      [empresaId, uid, extra.snapshot ?? null],
    );
    return rows[0].id;
  });
}

const acrescentar = (uid: string, conversaId: string, apos: string | number | null, mensagens: unknown) =>
  comoUsuario(uid, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      "select public.acrescentar_mensagens_de_ia($1, $2, $3::json) as id",
      [conversaId, apos, typeof mensagens === "string" ? mensagens : JSON.stringify(mensagens)],
    );
    return rows[0].id;
  });

// O modelo gerou "inicio" antes de "fim": é essa ordem que tem de voltar.
const RESPOSTA =
  '[{"role":"user","content":[{"type":"text","text":"Como foi setembro?"}],"display_text":"Como foi setembro?"},' +
  '{"role":"assistant","content":[{"type":"thinking","thinking":"...","signature":"abc"},' +
  '{"type":"tool_use","id":"toolu_1","name":"resumo_financeiro","input":{"inicio":"2026-09-01","fim":"2026-09-30"}}],"display_text":""}]';

describe.skipIf(!disponivel)("0015 b — histórico do assistente só pelo servidor", () => {
  it("grava na ordem, com os bytes enviados à API, e o histórico devolve igual", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    const ultima = await acrescentar(c.dono, id, null, RESPOSTA);
    const historico = await comoUsuario(c.dono, async (k) =>
      (
        await k.query<{ id: string; role: string; content: string; display_text: string }>(
          "select id::text, role, content::text as content, display_text from public.historico_de_ia($1)",
          [id],
        )
      ).rows,
    );
    expect(historico.map((h) => h.role)).toEqual(["user", "assistant"]);
    expect(historico.at(-1)?.id).toBe(ultima);
    expect(historico[1].content).toBe(
      '[{"type":"thinking","thinking":"...","signature":"abc"},{"type":"tool_use","id":"toolu_1","name":"resumo_financeiro","input":{"inicio":"2026-09-01","fim":"2026-09-30"}}]',
    );
    expect(historico[0].display_text).toBe("Como foi setembro?");
    expect(historico[1].display_text).toBe("");
  });

  it("navegador não insere nem lê o conteúdo bruto; lê o texto visível", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    await acrescentar(c.dono, id, null, RESPOSTA);
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query(
          "insert into public.ai_messages (conversation_id, organization_id, role, content) values ($1, $2, 'user', '[]')",
          [id, c.empresaId],
        ),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      comoUsuario(c.dono, (k) => k.query("select content from public.ai_messages where conversation_id = $1", [id])),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    const visiveis = await comoUsuario(c.dono, async (k) =>
      (
        await k.query("select role, display_text from public.ai_messages where conversation_id = $1 order by id", [id])
      ).rows,
    );
    expect(visiveis).toEqual([
      { role: "user", display_text: "Como foi setembro?" },
      { role: "assistant", display_text: "" },
    ]);
  });

  it("só o dono da conversa grava e lê pela função", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    for (const uid of [c.socio, c.contador, c.estranho]) {
      await expect(acrescentar(uid, id, null, RESPOSTA)).rejects.toThrow(/Conversa não encontrada/);
      await expect(
        comoUsuario(uid, (k) => k.query("select * from public.historico_de_ia($1)", [id])),
      ).rejects.toThrow(/Conversa não encontrada/);
    }
  });

  it("recusa gravar sobre um histórico que outra aba já mudou", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    const pergunta = [{ role: "user", content: [{ type: "text", text: "E outubro?" }], display_text: "E outubro?" }];
    // Conversa nova, mas outra aba gravou primeiro.
    const primeira = await acrescentar(c.dono, id, null, pergunta);
    await expect(acrescentar(c.dono, id, null, pergunta)).rejects.toThrow(
      "A conversa foi atualizada em outra aba. Recarregue a página.",
    );
    // As duas abas leram até `primeira`; a segunda a gravar é recusada.
    const segunda = await acrescentar(c.dono, id, primeira, pergunta);
    await expect(acrescentar(c.dono, id, primeira, pergunta)).rejects.toThrow(/outra aba/);
    await acrescentar(c.dono, id, segunda, pergunta);
  });

  it("tem teto de tamanho e confere o formato", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    const grande = [{ role: "user", content: [{ type: "text", text: "x".repeat(2_200_000) }], display_text: "" }];
    await expect(acrescentar(c.dono, id, null, grande)).rejects.toThrow(/grande demais/);
    await expect(acrescentar(c.dono, id, null, [])).rejects.toThrow(/Nenhuma mensagem/);
    await expect(acrescentar(c.dono, id, null, [{ role: "system", content: [] }])).rejects.toThrow(/formato/);
    await expect(acrescentar(c.dono, id, null, [{ role: "user" }])).rejects.toThrow(/formato/);
    await expect(acrescentar(c.dono, id, null, [42])).rejects.toThrow(/formato/);

    // Por conversa: 8 MB no total.
    const bloco = [{ role: "user", content: [{ type: "text", text: "y".repeat(1_900_000) }], display_text: "" }];
    let apos: string | null = null;
    for (let i = 0; i < 4; i++) apos = await acrescentar(c.dono, id, apos, bloco);
    await expect(acrescentar(c.dono, id, apos, bloco)).rejects.toThrow(/longa demais/);
  });

  it("gravar atualiza a conversa (retenção)", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    await comoAdmin((k) =>
      k.query("update public.ai_conversations set updated_at = now() - interval '10 days' where id = $1", [id]),
    );
    await acrescentar(c.dono, id, null, RESPOSTA);
    const recente = await comoAdmin(async (k) =>
      (
        await k.query("select updated_at > now() - interval '1 minute' as ok from public.ai_conversations where id = $1", [
          id,
        ])
      ).rows[0].ok,
    );
    expect(recente).toBe(true);
  });
});

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 c — conversa: só o título é editável", () => {
  it("dono não adia a retenção nem move a conversa; renomeia e guarda o prompt de sistema", async () => {
    const c = await cenario();
    const outra = await criarEmpresa(c.dono, { nome: `Filial ${c.s}`, slug: `filial-cr-${c.s}` });
    const id = await conversa(c.dono, c.empresaId, { snapshot: "Você é o assistente do Bossa." });

    for (const sql of [
      "update public.ai_conversations set updated_at = '2099-01-01' where id = $1",
      `update public.ai_conversations set organization_id = '${outra}' where id = $1`,
      "update public.ai_conversations set system_snapshot = 'outro' where id = $1",
    ]) {
      await expect(comoUsuario(c.dono, (k) => k.query(sql, [id]))).rejects.toThrow(
        /permission denied|permissão negada/i,
      );
    }
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query(
          "insert into public.ai_conversations (organization_id, user_id, title, updated_at) values ($1, $2, 'x', '2099-01-01')",
          [c.empresaId, c.dono],
        ),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const n = await comoUsuario(c.dono, async (k) =>
      (await k.query("update public.ai_conversations set title = 'Setembro' where id = $1", [id])).rowCount,
    );
    expect(n).toBe(1);
    const linha = await comoUsuario(c.dono, async (k) =>
      (await k.query("select title, system_snapshot from public.ai_conversations where id = $1", [id])).rows[0],
    );
    expect(linha).toEqual({ title: "Setembro", system_snapshot: "Você é o assistente do Bossa." });

    await expect(conversa(c.dono, c.empresaId, { snapshot: "x".repeat(20_001) })).rejects.toThrow(
      /check constraint|restrição/i,
    );
  });
});

/* ========================================================================= */

async function colaborador(dono: string, empresaId: string, dados: { nome: string; vinculo: string; profissional?: string }) {
  return comoUsuario(dono, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      `insert into public.staff_members (organization_id, professional_id, name, contract, started_on)
       values ($1, $2, $3, $4::public.staff_contract, '2026-01-05') returning id`,
      [empresaId, dados.profissional ?? null, dados.nome, dados.vinculo],
    );
    return rows[0].id;
  });
}

const pagar = (dono: string, staff: string, tipo: string, mes = "2026-09-01", pagoEm = "2026-09-30") =>
  comoUsuario(dono, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      "select public.registrar_pagamento_equipe($1, $2::public.staff_payment_kind, $3, 150000, $4, null, 'pix') as id",
      [staff, tipo, mes, pagoEm],
    );
    return rows[0].id;
  });

const ausentar = (dono: string, staff: string, tipo: string, inicio: string, fim: string) =>
  comoUsuario(dono, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      "select public.registrar_ausencia($1, $2::public.staff_absence_kind, $3, $4) as id",
      [staff, tipo, inicio, fim],
    );
    return rows[0].id;
  });

const remover = (dono: string, staff: string) =>
  comoUsuario(dono, async (k) => (await k.query("select public.remover_colaborador($1) as r", [staff])).rows[0].r);

const fecharMes = (empresaId: string, dono: string, mes: string) =>
  comoAdmin((k) =>
    k.query("insert into public.monthly_closings (organization_id, month, closed_by) values ($1, $2, $3)", [
      empresaId,
      mes,
      dono,
    ]),
  );

const transacaoDoPagamento = (pagamento: string) =>
  comoAdmin(async (k) =>
    (await k.query<{ id: string }>("select transaction_id as id from public.staff_payments where id = $1", [pagamento]))
      .rows[0].id,
  );

describe.skipIf(!disponivel)("0015 d — anonimizar apaga o que identifica a pessoa", () => {
  it("solta a agenda, apaga ausências (atestado) e bloqueios e tira o nome do lançamento, mesmo em mês fechado", async () => {
    const c = await cenario();
    const profissional = await criarProfissional(c.dono, c.empresaId, "Juliana Prado Souza");
    const staff = await colaborador(c.dono, c.empresaId, {
      nome: "Juliana Prado Souza",
      vinculo: "clt",
      profissional,
    });
    await ausentar(c.dono, staff, "atestado", "2026-09-10", "2026-09-11");
    await ausentar(c.dono, staff, "ferias", "2026-11-02", "2026-11-20");
    const pagamento = await pagar(c.dono, staff, "salario");
    await fecharMes(c.empresaId, c.dono, "2026-09-01");

    expect(await remover(c.dono, staff)).toBe("anonimizado");

    const depois = await comoAdmin(async (k) => ({
      staff: (await k.query("select name, professional_id from public.staff_members where id = $1", [staff])).rows[0],
      ausencias: (await k.query("select 1 from public.staff_absences where staff_id = $1", [staff])).rows.length,
      bloqueios: (await k.query("select 1 from public.time_off where professional_id = $1", [profissional])).rows
        .length,
    }));
    expect(depois).toEqual({ staff: { name: "Ex-colaborador", professional_id: null }, ausencias: 0, bloqueios: 0 });

    // O contador vê o pagamento, sem o nome; o valor fica.
    const lancamento = await comoUsuario(c.contador, async (k) =>
      (
        await k.query("select description, amount_cents::int as valor from public.transactions where id = $1", [
          await transacaoDoPagamento(pagamento),
        ])
      ).rows[0],
    );
    expect(lancamento).toEqual({ description: "Salário — Ex-colaborador", valor: 150000 });
  });

  it("depois de anonimizar, o profissional pode ser apagado e religado a um cadastro novo", async () => {
    const c = await cenario();
    const profissional = await criarProfissional(c.dono, c.empresaId, "Rafael Lima");
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Rafael Lima", vinculo: "parceria", profissional });
    await pagar(c.dono, staff, "cota_parte");
    expect(await remover(c.dono, staff)).toBe("anonimizado");

    // Recontratação: o mesmo perfil da agenda num cadastro novo.
    const novo = await colaborador(c.dono, c.empresaId, { nome: "Rafael Lima", vinculo: "clt", profissional });
    expect(novo).toBeTruthy();
  });

  it("anonimizado só aceita perder a ligação com a agenda (cascata ao apagar o profissional)", async () => {
    const c = await cenario();
    const profissional = await criarProfissional(c.dono, c.empresaId, "Camila Rocha");
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Camila Rocha", vinculo: "parceria", profissional });
    await pagar(c.dono, staff, "cota_parte");
    expect(await remover(c.dono, staff)).toBe("anonimizado");
    // Linha anonimizada antes desta correção (ainda com a agenda ligada).
    await comoAdmin(async (k) => {
      await k.query("alter table public.staff_members disable trigger trg_conferir_colaborador");
      try {
        await k.query("update public.staff_members set professional_id = $2 where id = $1", [staff, profissional]);
      } finally {
        await k.query("alter table public.staff_members enable trigger trg_conferir_colaborador");
      }
    });
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.staff_members set name = 'Camila' where id = $1", [staff])),
    ).rejects.toThrow(/removido/);
    const apagados = await comoUsuario(c.dono, async (k) =>
      (await k.query("delete from public.professionals where id = $1", [profissional])).rowCount,
    );
    expect(apagados).toBe(1);
    const ligado = await comoAdmin(async (k) =>
      (await k.query("select professional_id from public.staff_members where id = $1", [staff])).rows[0].professional_id,
    );
    expect(ligado).toBeNull();
  });

  it("a brecha do mês fechado é estreita: nem com a marca ligada o dono muda outro lançamento", async () => {
    const c = await cenario();
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Beatriz Nunes", vinculo: "clt" });
    const pagamento = await pagar(c.dono, staff, "salario");
    await fecharMes(c.empresaId, c.dono, "2026-09-01");
    const tx = await transacaoDoPagamento(pagamento);
    // Colaboradora ainda ativa: a marca não abre o mês fechado.
    await expect(
      comoUsuario(c.dono, async (k) => {
        await k.query("select set_config('bossa.anonimizando', '1', true)");
        await k.query("update public.transactions set description = 'Salário — Ex-colaborador' where id = $1", [tx]);
      }),
    ).rejects.toThrow(/Mês fechado/);
  });
});

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 e — trocar o vínculo", () => {
  it("recusa virar PJ quem já tem férias registradas", async () => {
    const c = await cenario();
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Rafael Lima", vinculo: "clt" });
    await ausentar(c.dono, staff, "ferias", "2026-11-02", "2026-11-20");
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.staff_members set contract = 'pj' where id = $1", [staff])),
    ).rejects.toThrow(/cadastre a pessoa de novo, como outro colaborador/);
  });

  it("recusa virar parceria quem já recebeu salário; parceria com cota-parte vira MEI à vontade", async () => {
    const c = await cenario();
    const clt = await colaborador(c.dono, c.empresaId, { nome: "Ana Souza", vinculo: "clt" });
    await pagar(c.dono, clt, "salario");
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.staff_members set contract = 'parceria' where id = $1", [clt])),
    ).rejects.toThrow(/outro colaborador/);

    const parceira = await colaborador(c.dono, c.empresaId, { nome: "Luana Dias", vinculo: "parceria" });
    await pagar(c.dono, parceira, "cota_parte");
    await comoUsuario(c.dono, (k) =>
      k.query("update public.staff_members set contract = 'mei' where id = $1", [parceira]),
    );
  });

  it("estágio vira CLT, e depois a recepção remove o bloqueio do recesso na agenda", async () => {
    const c = await cenario();
    const profissional = await criarProfissional(c.dono, c.empresaId, "Marina Alves");
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Marina Alves", vinculo: "estagio", profissional });
    const ausencia = await ausentar(c.dono, staff, "recesso", "2026-12-21", "2026-12-31");
    await comoUsuario(c.dono, (k) => k.query("update public.staff_members set contract = 'clt' where id = $1", [staff]));

    const bloqueio = await comoAdmin(async (k) =>
      (await k.query("select time_off_id from public.staff_absences where id = $1", [ausencia])).rows[0].time_off_id,
    );
    const apagados = await comoUsuario(c.recepcao, async (k) =>
      (await k.query("delete from public.time_off where id = $1", [bloqueio])).rowCount,
    );
    expect(apagados).toBe(1);
    const linha = await comoAdmin(async (k) =>
      (await k.query("select kind, time_off_id from public.staff_absences where id = $1", [ausencia])).rows[0],
    );
    expect(linha).toEqual({ kind: "recesso", time_off_id: null });
    // Ausência nova continua conferida pelo vínculo atual.
    await expect(ausentar(c.dono, staff, "recesso", "2027-01-05", "2027-01-06")).rejects.toThrow(/não combina/);
  });
});

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 f — pagamento da equipe não muda pelo Financeiro", () => {
  it("valor, tipo, status e datas ficam travados; descrição muda; excluir leva o pagamento", async () => {
    const c = await cenario();
    const staff = await colaborador(c.dono, c.empresaId, { nome: "Paula Mendes", vinculo: "clt" });
    const pagamento = await pagar(c.dono, staff, "salario", "2026-10-01", "2026-10-05");
    const tx = await transacaoDoPagamento(pagamento);
    for (const mudanca of [
      "amount_cents = 99",
      "kind = 'receita'",
      "status = 'pendente', paid_at = null",
      "paid_at = '2026-10-06'",
      "competence_date = '2026-11-01'",
    ]) {
      await expect(
        comoUsuario(c.dono, (k) => k.query(`update public.transactions set ${mudanca} where id = $1`, [tx])),
      ).rejects.toThrow("Este lançamento é um pagamento da equipe: altere ou exclua pela tela Equipe.");
    }
    const n = await comoUsuario(c.dono, async (k) =>
      (await k.query("update public.transactions set description = 'Salário de outubro' where id = $1", [tx])).rowCount,
    );
    expect(n).toBe(1);

    // Lançamento comum continua editável.
    const comum = await comoUsuario(c.dono, async (k) =>
      (
        await k.query<{ id: string }>(
          `insert into public.transactions (organization_id, kind, status, description, amount_cents, competence_date, paid_at)
           values ($1, 'despesa', 'pago', 'Aluguel', 250000, '2026-10-01', '2026-10-05') returning id`,
          [c.empresaId],
        )
      ).rows[0].id,
    );
    await comoUsuario(c.dono, (k) => k.query("update public.transactions set amount_cents = 260000 where id = $1", [comum]));

    await comoUsuario(c.dono, (k) => k.query("delete from public.transactions where id = $1", [tx]));
    const sobrou = await comoAdmin(async (k) =>
      (await k.query("select 1 from public.staff_payments where id = $1", [pagamento])).rows.length,
    );
    expect(sobrou).toBe(0);
  });
});

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 h — exceção de custo com origem 'regra'", () => {
  it("aceita ia, regra e dono; recusa o resto", async () => {
    const c = await cenario();
    const despesa = await comoUsuario(c.dono, async (k) =>
      (
        await k.query<{ id: string }>(
          `insert into public.transactions (organization_id, kind, status, description, amount_cents, competence_date, paid_at,
             category_id)
           values ($1, 'despesa', 'pago', 'Carnê-Leão set/2026', 185000, '2026-10-01', '2026-10-05',
             (select id from public.categories where organization_id = $1 and name = 'Impostos (DAS, ISS, Carnê-Leão)'))
           returning id`,
          [c.empresaId],
        )
      ).rows[0].id,
    );
    const gravar = (fonte: string) =>
      comoUsuario(c.dono, (k) =>
        k.query(
          `insert into public.transaction_cost_overrides (transaction_id, organization_id, cost_behavior, source)
           values ($1, $2, 'nao_operacional', $3)
           on conflict (transaction_id) do update set source = excluded.source`,
          [despesa, c.empresaId, fonte],
        ),
      );
    for (const fonte of ["regra", "ia", "dono"]) await gravar(fonte);
    await expect(gravar("contador")).rejects.toThrow(/check constraint|restrição/i);
  });
});

/* ========================================================================= */

describe.skipIf(!disponivel)("0015 i — retenção dos envios de WhatsApp", () => {
  it("a limpeza diária apaga envios com mais de 12 meses", async () => {
    const c = await cenario();
    await comoAdmin((k) =>
      k.query(
        `insert into public.message_logs (organization_id, template, created_at) values
           ($1, 'lembrete_agendamento', now() - interval '13 months'),
           ($1, 'lembrete_agendamento', now() - interval '11 months')`,
        [c.empresaId],
      ),
    );
    const resultado = await comoAdmin(async (k) => (await k.query("select public.limpar_dados_de_ia() as r")).rows[0].r);
    expect(resultado.envios_de_mensagem).toBeGreaterThanOrEqual(1);
    const sobrou = await comoAdmin(async (k) =>
      (await k.query("select 1 from public.message_logs where organization_id = $1", [c.empresaId])).rows.length,
    );
    expect(sobrou).toBe(1);
  });
});
