import { readdirSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { bancoDisponivel, comoAdmin, fecharBanco } from "./ajuda";

const disponivel = await bancoDisponivel();

afterAll(async () => {
  await fecharBanco();
});

/**
 * As regras invioláveis do projeto, viradas em teste.
 *
 * Não adianta estarem escritas no CLAUDE.md se nada verifica: seis meses depois
 * alguém cria uma tabela sem RLS e ninguém percebe até vazar dado de uma empresa
 * para outra. Aqui a regra é perguntada ao banco, que é onde ela vale.
 */
describe.skipIf(!disponivel)("regras invioláveis — banco", () => {
  it("toda tabela tem RLS ativa", async () => {
    const semRls = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ relname: string }>(`
        select c.relname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
         order by c.relname
      `);
      return rows.map((linha) => linha.relname);
    });

    expect(semRls).toEqual([]);
  });

  it("toda tabela com organization_id tem política de leitura por empresa", async () => {
    const semPolitica = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ relname: string }>(`
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and exists (
             select 1 from information_schema.columns k
              where k.table_schema = 'public' and k.table_name = c.relname
                and k.column_name = 'organization_id')
           and not exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and p.cmd in ('SELECT', 'ALL'))
         order by c.relname
      `);
      return rows.map((linha) => linha.relname);
    });

    // booking_attempts é só do servidor: RLS ativa e nenhuma política, de
    // propósito — ninguém logado lê as tentativas de agendamento de ninguém.
    expect(semPolitica).toEqual(["booking_attempts"]);
  });

  it("dinheiro é sempre inteiro: nenhuma coluna de valor é float", async () => {
    const suspeitas = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ tabela: string; coluna: string; tipo: string }>(`
        select table_name as tabela, column_name as coluna, data_type as tipo
          from information_schema.columns
         where table_schema = 'public'
           and (column_name like '%cents%' or column_name like '%valor%'
                or column_name like '%price%' or column_name like '%amount%')
           and data_type not in ('bigint', 'integer', 'smallint')
         order by table_name, column_name
      `);
      return rows;
    });

    expect(suspeitas).toEqual([]);
  });

  it("nenhuma coluna de dinheiro usa numeric, real ou double", async () => {
    const flutuantes = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ tabela: string; coluna: string; tipo: string }>(`
        select table_name as tabela, column_name as coluna, data_type as tipo
          from information_schema.columns
         where table_schema = 'public'
           and data_type in ('numeric', 'real', 'double precision')
         order by table_name, column_name
      `);
      return rows;
    });

    expect(flutuantes).toEqual([]);
  });

  it("data e hora são timestamptz, nunca timestamp sem fuso", async () => {
    const semFuso = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ tabela: string; coluna: string }>(`
        select table_name as tabela, column_name as coluna
          from information_schema.columns
         where table_schema = 'public'
           and data_type = 'timestamp without time zone'
         order by table_name, column_name
      `);
      return rows;
    });

    expect(semFuso).toEqual([]);
  });

  it("nenhuma função exposta ao cliente roda com search_path solto", async () => {
    const soltas = await comoAdmin(async (cliente) => {
      const { rows } = await cliente.query<{ nome: string }>(`
        select p.proname as nome
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private')
           and p.prosecdef
           and not exists (
             select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
              where cfg like 'search_path=%')
         order by p.proname
      `);
      return rows.map((linha) => linha.nome);
    });

    // Função "security definer" sem search_path fixo é caminho conhecido de
    // escalada de privilégio.
    expect(soltas).toEqual([]);
  });
});

describe("regras invioláveis — nome das migrações", () => {
  it("todo arquivo de migração tem só dígitos antes do sublinhado", () => {
    // O CLI do Supabase PULA EM SILÊNCIO qualquer migração fora deste padrão —
    // e termina dizendo "Finished". Foi assim que quatro migrações quase foram
    // para produção sem serem aplicadas, incluindo a função que o webhook de
    // cobrança chama. Este teste existe para isso não acontecer de novo.
    const fora = readdirSync("supabase/migrations")
      .filter((nome) => nome.endsWith(".sql"))
      .filter((nome) => !/^\d+_[a-z0-9_]+\.sql$/.test(nome));

    expect(fora).toEqual([]);
  });

  it("os números das migrações não se repetem e estão em ordem", () => {
    const numeros = readdirSync("supabase/migrations")
      .filter((nome) => nome.endsWith(".sql"))
      .map((nome) => Number(nome.split("_")[0]));

    expect(new Set(numeros).size).toBe(numeros.length);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
  });
});
