import { Pool, type PoolClient } from "pg";

/**
 * Ferramentas para testar as migrações num Postgres local com o mesmo esquema do
 * Supabase (veja scripts/db-local.sh). `comoUsuario` roda as consultas como o papel
 * `authenticated` com o `auth.uid()` do usuário informado — é assim que a RLS é exercida.
 */
export const URL_BANCO =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/alicerce_test";

let pool: Pool | undefined;

function obterPool() {
  pool ??= new Pool({ connectionString: URL_BANCO, max: 4 });
  return pool;
}

/** Diz se existe um banco de teste com as migrações aplicadas. */
export async function bancoDisponivel() {
  try {
    const cliente = await obterPool().connect();
    try {
      await cliente.query("select 1 from public.organizations limit 1");
      return true;
    } finally {
      cliente.release();
    }
  } catch {
    return false;
  }
}

export async function fecharBanco() {
  await pool?.end();
  pool = undefined;
}

/** Roda como dono do banco (equivale à chave secreta do servidor: ignora a RLS). */
export async function comoAdmin<T>(acao: (cliente: PoolClient) => Promise<T>) {
  const cliente = await obterPool().connect();
  try {
    return await acao(cliente);
  } finally {
    cliente.release();
  }
}

/** Roda como um usuário logado do Supabase: papel `authenticated` e `auth.uid()` preenchido. */
export async function comoUsuario<T>(userId: string, acao: (cliente: PoolClient) => Promise<T>) {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("set local role authenticated");
    await cliente.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const resultado = await acao(cliente);
    await cliente.query("commit");
    return resultado;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

/** Cria um usuário em auth.users (no Supabase isso é feito pelo Auth). */
export async function criarUsuario(email: string) {
  return comoAdmin(async (cliente) => {
    const { rows } = await cliente.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    return rows[0].id;
  });
}

/** Cria uma empresa pela função oficial, com o usuário como dono. */
export async function criarEmpresa(
  userId: string,
  dados: { nome: string; slug: string; segmento?: string; regime?: string; fuso?: string },
) {
  return comoUsuario(userId, async (cliente) => {
    const { rows } = await cliente.query<{ create_organization: string }>(
      "select public.create_organization($1, $2, $3, $4::public.tax_regime, $5)",
      [
        dados.nome,
        dados.slug,
        dados.segmento ?? "salao",
        dados.regime ?? "mei",
        dados.fuso ?? "America/Sao_Paulo",
      ],
    );
    return rows[0].create_organization;
  });
}

/** Sufixo aleatório para e-mails e slugs, para os testes não colidirem entre si. */
export function sufixo() {
  return Math.random().toString(36).slice(2, 10);
}
