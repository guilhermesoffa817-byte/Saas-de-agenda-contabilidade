@AGENTS.md

# Alicerce — regras do projeto

Especificação completa: `docs/prompt-saas-alicerce.md`. Antes de cada fase, leia a seção dela.

## Comandos
- Rodar: `npm run dev` · Lint: `npm run lint` · Tipos: `npx tsc --noEmit`
- Testes: `npx vitest run` · Ponta a ponta: `npx playwright test`
- Banco: `npx supabase migration new <nome>` · `npx supabase db push`
- Tipos do banco: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`

## Regras invioláveis
- Dinheiro sempre em centavos inteiros (colunas `*_cents bigint`). Nunca float. Formatar só na tela, com Intl pt-BR/BRL.
- Datas gravadas como `timestamptz`; exibidas no fuso da empresa (`organizations.timezone`).
- Toda tabela com dados de empresa tem `organization_id` e RLS ativa.
- A chave secreta do Supabase só existe em arquivos com `import "server-only"`.
- Supabase: só `@supabase/ssr`, com `getAll`/`setAll`. Nunca `@supabase/auth-helpers-nextjs`.
- Valores legais só em `src/lib/fiscal/constantes.ts`, com fonte e data.
- Interface em pt-BR, sem lorem ipsum; dados de demonstração brasileiros e realistas.
- Design: usar só os tokens de `src/app/globals.css`. Proibido gradiente roxo/azul, ilustração 3D genérica e foto de banco de imagens.
- Toda animação respeita `prefers-reduced-motion`.
- Ao terminar uma tarefa: lint + tipos + testes, e relatar o resultado.
