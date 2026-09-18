import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Junta todas as migrações num arquivo só, na ordem certa, para colar no SQL
 * Editor do Supabase.
 *
 * Existe porque nem todo mundo quer instalar o CLI do Supabase só para criar o
 * banco uma vez. A fonte continua sendo supabase/migrations/ — este arquivo é
 * derivado, e precisa ser gerado de novo quando uma migração muda.
 */
const PASTA = "supabase/migrations";
const DESTINO = "supabase/banco-completo.sql";

const arquivos = readdirSync(PASTA)
  .filter((nome) => nome.endsWith(".sql"))
  .sort();

const cabecalho = `-- ============================================================================
-- ALICERCE — banco de dados completo
--
-- COMO USAR:
--   1. No painel do Supabase, abra "SQL Editor" no menu da esquerda.
--   2. Clique em "New query".
--   3. Cole TUDO deste arquivo (Ctrl+A, Ctrl+C aqui; Ctrl+V lá).
--   4. Clique em "Run".
--
-- Leva alguns segundos. Se aparecer "Success. No rows returned", deu certo:
-- as tabelas, as permissões e as regras de segurança estão criadas.
--
-- Rode UMA VEZ só, num projeto novo. Rodar de novo num banco que já tem as
-- tabelas dá erro de "already exists" — e isso é proteção, não problema.
--
-- Este arquivo é a junção das ${arquivos.length} migrações do projeto, na ordem certa.
-- Gerado por: npm run db:sql
-- A fonte continua sendo supabase/migrations/ — se mudar lá, gere de novo.
-- ============================================================================

`;

const traco = "-".repeat(74);
const corpo = arquivos
  .map((nome) => {
    const sql = readFileSync(join(PASTA, nome), "utf8").trimEnd();
    return `\n\n-- ${traco}\n-- ${nome}\n-- ${traco}\n\n${sql}\n`;
  })
  .join("");

writeFileSync(DESTINO, cabecalho + corpo);
console.log(`${DESTINO} gerado a partir de ${arquivos.length} migrações.`);
