# Alicerce

Agenda + financeiro/contábil para autônomos e pequenos negócios (salões, barbearias, clínicas,
consultórios, personal trainers e terapeutas), com página de vendas própria.

A especificação completa do produto está em [`docs/prompt-saas-alicerce.md`](docs/prompt-saas-alicerce.md)
e é construída **uma fase por vez** (FASE 0 a FASE 8). As regras permanentes do projeto estão em
[`CLAUDE.md`](CLAUDE.md).

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha as chaves (veja abaixo)
npm run dev                  # http://localhost:3000
```

## Comandos

| O que | Comando |
|---|---|
| Rodar em desenvolvimento | `npm run dev` |
| Lint | `npm run lint` |
| Tipos | `npm run typecheck` |
| Testes de unidade | `npm test` |
| Testes de ponta a ponta | `npm run test:e2e` |
| Nova migração do banco | `npx supabase migration new <nome>` |
| Banco local para testes | `npm run db:local` |
| Aplicar migrações | `npm run db:push` |
| Gerar tipos do banco | `npm run db:types` |

## Testes de banco

As migrações são testadas num Postgres local, sem Docker e sem depender do projeto da nuvem:

```bash
npm run db:local   # recria o banco alicerce_test e aplica todas as migrações
npm test           # roda os testes; os de banco são pulados se o banco não existir
```

`supabase/local/00_shim_supabase.sql` recria só o que o Supabase já oferece no banco dele (papéis
`anon`/`authenticated`, schema `auth`, `auth.uid()` e privilégios padrão). Ele nunca é aplicado no
projeto da nuvem. Os testes de `tests/db` provam, entre outras coisas, que um usuário de uma empresa
não lê nem altera dados de outra.

## Variáveis de ambiente

O arquivo `.env.example` lista todas as chaves. Nesta fase nenhuma delas é obrigatória para rodar a
aplicação; elas entram a partir da FASE 1 (Supabase), FASE 5 (Asaas, Resend, Turnstile) e FASE 7
(WhatsApp). `SUPABASE_SECRET_KEY` nunca pode receber o prefixo `NEXT_PUBLIC`.

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui + lucide-react · Supabase
(Postgres, Auth, Storage, Cron) · Zod 4 + react-hook-form · date-fns 4 · Recharts · exceljs ·
@react-pdf/renderer · Resend · Asaas · Vitest + Playwright · deploy na Vercel.

## Componentes de UI

Os componentes de `src/components/ui/` são cópias do registro oficial do shadcn/ui (variante
`new-york-v4`, baseada no pacote `radix-ui`), com os imports adaptados para `@/components/ui/*` e
`@/lib/utils`. Para acrescentar um componente novo, o caminho normal é `npx shadcn@latest add <nome>`;
em ambientes sem acesso a `ui.shadcn.com` dá para copiar o arquivo do registro público e trocar os
imports do mesmo jeito.

## Avisos do produto

O Alicerce não substitui o contador, não calcula impostos por conta própria e não é prontuário
eletrônico. As regras fiscais embutidas foram pesquisadas em setembro de 2026, ficam centralizadas em
`src/lib/fiscal/constantes.ts` e precisam de revisão anual.
