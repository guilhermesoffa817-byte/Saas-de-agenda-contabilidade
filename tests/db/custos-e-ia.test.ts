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

async function cenario(opcoes: { fuso?: string } = {}) {
  const s = sufixo();
  const dono = await criarUsuario(`dono.ci.${s}@exemplo.com.br`);
  const empresaId = await criarEmpresa(dono, {
    nome: `Clínica ${s}`,
    slug: `clinica-ci-${s}`,
    fuso: opcoes.fuso,
  });
  const socio = await membro(empresaId, `socio.ci.${s}@exemplo.com.br`, "dono");
  const recepcao = await membro(empresaId, `recepcao.ci.${s}@exemplo.com.br`, "recepcao");
  const contador = await membro(empresaId, `contador.ci.${s}@exemplo.com.br`, "contador");
  const profissional = await membro(empresaId, `prof.ci.${s}@exemplo.com.br`, "profissional");
  const estranho = await criarUsuario(`estranho.ci.${s}@exemplo.com.br`);
  const outraEmpresa = await criarEmpresa(estranho, { nome: `Outra ${s}`, slug: `outra-ci-${s}` });
  return { s, dono, socio, empresaId, recepcao, contador, profissional, estranho, outraEmpresa };
}

async function lancar(
  uid: string,
  empresaId: string,
  dados: { tipo?: string; categoria?: string; dia?: string } = {},
) {
  return comoUsuario(uid, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.transactions
         (organization_id, kind, status, description, amount_cents, competence_date, paid_at, category_id)
       values ($1, $2::public.tx_kind, 'pago', 'Lançamento de teste', 15000, $3, $3,
               (select id from public.categories where organization_id = $1 and name = $4))
       returning id`,
      [empresaId, dados.tipo ?? "despesa", dados.dia ?? "2026-10-05", dados.categoria ?? "Outras despesas"],
    );
    return rows[0].id;
  });
}

const contar = (uid: string, tabela: string) =>
  comoUsuario(uid, async (c) => (await c.query(`select 1 from public.${tabela}`)).rows.length);

describe.skipIf(!disponivel)("0014 — comportamento padrão das categorias", () => {
  it("empresa nova nasce com fixo, variável e sem classificação onde não é custo", async () => {
    const c = await cenario();
    const linhas = await comoUsuario(c.dono, async (k) =>
      (
        await k.query<{ name: string; kind: string; cost_behavior: string | null; cost_behavior_source: string }>(
          "select name, kind, cost_behavior, cost_behavior_source from public.categories where organization_id = $1",
          [c.empresaId],
        )
      ).rows,
    );
    const de = (nome: string) => linhas.find((l) => l.name === nome)?.cost_behavior;
    expect(de("Aluguel do espaço")).toBe("fixo");
    expect(de("Energia, água e internet")).toBe("fixo");
    expect(de("Salários e encargos")).toBe("fixo");
    expect(de("Marketing")).toBe("fixo");
    expect(de("Materiais e insumos")).toBe("variavel");
    expect(de("Comissões e repasses a profissionais")).toBe("variavel");
    expect(de("Taxas de maquininha e bancárias")).toBe("variavel");
    expect(de("Impostos (DAS, ISS, Carnê-Leão)")).toBe("variavel");
    expect(de("Outras despesas")).toBeNull();
    expect(de("Retirada do dono")).toBeNull();
    for (const receita of linhas.filter((l) => l.kind === "receita")) {
      expect(receita.cost_behavior, receita.name).toBeNull();
    }
    expect(new Set(linhas.map((l) => l.cost_behavior_source))).toEqual(new Set(["padrao"]));
  });

  it("o comportamento só aceita os três valores", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.categories set cost_behavior = 'semifixo' where organization_id = $1", [
          c.empresaId,
        ]),
      ),
    ).rejects.toThrow(/check constraint|restrição/i);
  });
});

describe.skipIf(!disponivel)("0014 — exceção de custo por lançamento", () => {
  it("dono classifica; contador lê; recepção, profissional e outra empresa não", async () => {
    const c = await cenario();
    const despesa = await lancar(c.dono, c.empresaId);
    await comoUsuario(c.dono, (k) =>
      k.query(
        "insert into public.transaction_cost_overrides (transaction_id, organization_id, cost_behavior, source) values ($1, $2, 'fixo', 'dono')",
        [despesa, c.empresaId],
      ),
    );
    expect(await contar(c.dono, "transaction_cost_overrides")).toBe(1);
    expect(await contar(c.contador, "transaction_cost_overrides")).toBe(1);
    expect(await contar(c.recepcao, "transaction_cost_overrides")).toBe(0);
    expect(await contar(c.profissional, "transaction_cost_overrides")).toBe(0);
    expect(await contar(c.estranho, "transaction_cost_overrides")).toBe(0);

    const alterados = await comoUsuario(c.contador, async (k) =>
      (
        await k.query("update public.transaction_cost_overrides set cost_behavior = 'variavel' where transaction_id = $1", [
          despesa,
        ])
      ).rowCount,
    );
    expect(alterados).toBe(0);
  });

  it("recusa receita e retirada do dono", async () => {
    const c = await cenario();
    const receita = await lancar(c.dono, c.empresaId, { tipo: "receita", categoria: "Atendimentos" });
    const retirada = await lancar(c.dono, c.empresaId, { categoria: "Retirada do dono" });
    for (const id of [receita, retirada]) {
      await expect(
        comoUsuario(c.dono, (k) =>
          k.query(
            "insert into public.transaction_cost_overrides (transaction_id, organization_id, cost_behavior, source) values ($1, $2, 'fixo', 'dono')",
            [id, c.empresaId],
          ),
        ),
      ).rejects.toThrow(/Só despesas/i);
    }
  });

  it("recusa lançamento de outra empresa", async () => {
    const c = await cenario();
    const alheio = await lancar(c.estranho, c.outraEmpresa);
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query(
          "insert into public.transaction_cost_overrides (transaction_id, organization_id, cost_behavior, source) values ($1, $2, 'fixo', 'dono')",
          [alheio, c.empresaId],
        ),
      ),
    ).rejects.toThrow(/Só despesas/i);
  });

  it("funciona em mês fechado: reclassificar não mexe no lançamento", async () => {
    const c = await cenario();
    const despesa = await lancar(c.dono, c.empresaId, { dia: "2026-09-10" });
    await comoAdmin((k) =>
      k.query(
        "insert into public.monthly_closings (organization_id, month, closed_by) values ($1, '2026-09-01', $2)",
        [c.empresaId, c.dono],
      ),
    );
    await comoUsuario(c.dono, (k) =>
      k.query(
        "insert into public.transaction_cost_overrides (transaction_id, organization_id, cost_behavior, source, reason) values ($1, $2, 'variavel', 'ia', 'Compra de insumo')",
        [despesa, c.empresaId],
      ),
    );
    const n = await comoUsuario(c.dono, async (k) =>
      (
        await k.query(
          "update public.transaction_cost_overrides set cost_behavior = 'fixo', source = 'dono' where transaction_id = $1",
          [despesa],
        )
      ).rowCount,
    );
    expect(n).toBe(1);
    // E o lançamento continua travado.
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.transactions set amount_cents = 1 where id = $1", [despesa])),
    ).rejects.toThrow(/Mês fechado/i);
  });
});

async function conversa(uid: string, empresaId: string, titulo = "Como foi setembro?") {
  return comoUsuario(uid, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      "insert into public.ai_conversations (organization_id, user_id, title) values ($1, $2, $3) returning id",
      [empresaId, uid, titulo],
    );
    return rows[0].id;
  });
}

async function mensagem(uid: string, conversaId: string, empresaId: string, texto = "Como foi setembro?") {
  return comoUsuario(uid, async (k) => {
    const { rows } = await k.query<{ id: string }>(
      `insert into public.ai_messages (conversation_id, organization_id, role, content, display_text)
       values ($1, $2, 'user', $3::jsonb, $4) returning id`,
      [conversaId, empresaId, JSON.stringify([{ type: "text", text: texto }]), texto],
    );
    return rows[0].id;
  });
}

describe.skipIf(!disponivel)("0014 — conversas com o assistente", () => {
  it("cada dono vê só as próprias conversas; os outros papéis não usam", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    await mensagem(c.dono, id, c.empresaId);

    expect(await contar(c.dono, "ai_conversations")).toBe(1);
    expect(await contar(c.dono, "ai_messages")).toBe(1);
    // Outro dono da MESMA empresa não lê a conversa do sócio.
    expect(await contar(c.socio, "ai_conversations")).toBe(0);
    expect(await contar(c.socio, "ai_messages")).toBe(0);
    for (const uid of [c.contador, c.recepcao, c.profissional, c.estranho]) {
      expect(await contar(uid, "ai_conversations")).toBe(0);
      expect(await contar(uid, "ai_messages")).toBe(0);
    }

    for (const uid of [c.contador, c.recepcao]) {
      await expect(conversa(uid, c.empresaId)).rejects.toThrow(/row-level security/i);
    }
    // Ninguém escreve na conversa alheia.
    await expect(mensagem(c.socio, id, c.empresaId)).rejects.toThrow(/row-level security/i);
    await expect(mensagem(c.estranho, id, c.outraEmpresa)).rejects.toThrow(/outra empresa|row-level/i);
  });

  it("ninguém cria conversa em nome de outra pessoa", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("insert into public.ai_conversations (organization_id, user_id, title) values ($1, $2, 'x')", [
          c.empresaId,
          c.socio,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("mensagens são só por acréscimo: sem update nem delete; apagar a conversa leva tudo", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    const msg = await mensagem(c.dono, id, c.empresaId);
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.ai_messages set display_text = 'x' where id = $1", [msg])),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      comoUsuario(c.dono, (k) => k.query("delete from public.ai_messages where id = $1", [msg])),
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const apagadas = await comoUsuario(c.dono, async (k) =>
      (await k.query("delete from public.ai_conversations where id = $1", [id])).rowCount,
    );
    expect(apagadas).toBe(1);
    const sobrou = await comoAdmin(async (k) =>
      (await k.query("select 1 from public.ai_messages where conversation_id = $1", [id])).rows.length,
    );
    expect(sobrou).toBe(0);
  });

  it("mensagem nova atualiza a conversa (é o que conta para a retenção)", async () => {
    const c = await cenario();
    const id = await conversa(c.dono, c.empresaId);
    await comoAdmin((k) =>
      k.query("update public.ai_conversations set updated_at = now() - interval '10 days' where id = $1", [id]),
    );
    await mensagem(c.dono, id, c.empresaId);
    const recente = await comoAdmin(async (k) =>
      (await k.query("select updated_at > now() - interval '1 minute' as ok from public.ai_conversations where id = $1", [id]))
        .rows[0].ok,
    );
    expect(recente).toBe(true);
  });

  it("aceite do aviso: o próprio dono registra e lê; não edita", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (k) =>
      k.query("insert into public.ai_consents (organization_id, user_id) values ($1, $2)", [c.empresaId, c.dono]),
    );
    expect(await contar(c.dono, "ai_consents")).toBe(1);
    expect(await contar(c.socio, "ai_consents")).toBe(0);
    expect(await contar(c.contador, "ai_consents")).toBe(0);
    await expect(
      comoUsuario(c.contador, (k) =>
        k.query("insert into public.ai_consents (organization_id, user_id) values ($1, $2)", [
          c.empresaId,
          c.contador,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("update public.ai_consents set accepted_at = now() where user_id = $1", [c.dono]),
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });
});

describe.skipIf(!disponivel)("0014 — uso da IA e franquia", () => {
  it("dono lê e registra o uso; ninguém edita nem apaga; outros papéis não veem", async () => {
    const c = await cenario();
    await comoUsuario(c.dono, (k) =>
      k.query(
        "insert into public.ai_usage_logs (organization_id, user_id, feature, input_tokens, output_tokens) values ($1, $2, 'assistente', 1200, 300)",
        [c.empresaId, c.dono],
      ),
    );
    expect(await contar(c.dono, "ai_usage_logs")).toBe(1);
    for (const uid of [c.contador, c.recepcao, c.profissional, c.estranho]) {
      expect(await contar(uid, "ai_usage_logs")).toBe(0);
    }
    await expect(
      comoUsuario(c.dono, (k) => k.query("update public.ai_usage_logs set input_tokens = 0")),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      comoUsuario(c.dono, (k) => k.query("delete from public.ai_usage_logs")),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      comoUsuario(c.contador, (k) =>
        k.query("insert into public.ai_usage_logs (organization_id, feature) values ($1, 'assistente')", [
          c.empresaId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
    // O dono não registra uso em nome de outra pessoa.
    await expect(
      comoUsuario(c.dono, (k) =>
        k.query("insert into public.ai_usage_logs (organization_id, user_id, feature) values ($1, $2, 'assistente')", [
          c.empresaId,
          c.socio,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("uso_de_ia_no_mes conta o mês corrente no fuso da empresa, por recurso", async () => {
    const fuso = "America/Cuiaba";
    const c = await cenario({ fuso });
    await comoAdmin((k) =>
      k.query(
        `insert into public.ai_usage_logs (organization_id, feature, created_at) values
           ($1, 'assistente', (date_trunc('month', now() at time zone $2) at time zone $2) + interval '1 minute'),
           ($1, 'assistente', now()),
           ($1, 'classificacao', now()),
           -- um minuto antes da virada do mês LOCAL: em UTC já é o mês corrente, mas lá ainda não
           ($1, 'assistente', (date_trunc('month', now() at time zone $2) at time zone $2) - interval '1 minute')`,
        [c.empresaId, fuso],
      ),
    );
    await comoAdmin((k) =>
      k.query("insert into public.ai_usage_logs (organization_id, feature) values ($1, 'assistente')", [
        c.outraEmpresa,
      ]),
    );
    const uso = (uid: string, recurso: string) =>
      comoUsuario(uid, async (k) =>
        (await k.query("select public.uso_de_ia_no_mes($1, $2) as n", [c.empresaId, recurso])).rows[0].n,
      );
    expect(await uso(c.dono, "assistente")).toBe(2);
    expect(await uso(c.dono, "classificacao")).toBe(1);
    await expect(uso(c.contador, "assistente")).rejects.toThrow(/Sem permissão/i);
    await expect(uso(c.estranho, "assistente")).rejects.toThrow(/Sem permissão/i);
  });
});

describe.skipIf(!disponivel)("0014 — retenção dos dados de IA", () => {
  it("apaga conversas paradas há mais de 90 dias e uso com mais de 12 meses", async () => {
    const c = await cenario();
    const velha = await conversa(c.dono, c.empresaId, "Conversa antiga");
    const nova = await conversa(c.dono, c.empresaId, "Conversa recente");
    await mensagem(c.dono, velha, c.empresaId);
    await comoAdmin(async (k) => {
      await k.query("update public.ai_conversations set updated_at = now() - interval '91 days' where id = $1", [
        velha,
      ]);
      await k.query("update public.ai_conversations set updated_at = now() - interval '89 days' where id = $1", [
        nova,
      ]);
      await k.query(
        `insert into public.ai_usage_logs (organization_id, feature, created_at) values
           ($1, 'assistente', now() - interval '13 months'),
           ($1, 'assistente', now() - interval '11 months')`,
        [c.empresaId],
      );
    });

    const resultado = await comoAdmin(async (k) =>
      (await k.query("select public.limpar_dados_de_ia() as r")).rows[0].r,
    );
    expect(resultado.conversas).toBeGreaterThanOrEqual(1);
    expect(resultado.registros_de_uso).toBeGreaterThanOrEqual(1);

    const sobrou = await comoAdmin(async (k) => ({
      conversas: (
        await k.query("select id from public.ai_conversations where organization_id = $1", [c.empresaId])
      ).rows.map((r) => r.id),
      mensagens: (await k.query("select 1 from public.ai_messages where conversation_id = $1", [velha])).rows
        .length,
      usos: (await k.query("select 1 from public.ai_usage_logs where organization_id = $1", [c.empresaId])).rows
        .length,
    }));
    expect(sobrou).toEqual({ conversas: [nova], mensagens: 0, usos: 1 });
  });

  it("a limpeza é só do servidor", async () => {
    const c = await cenario();
    await expect(
      comoUsuario(c.dono, (k) => k.query("select public.limpar_dados_de_ia()")),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });
});
