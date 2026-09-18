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
| Testes com Chromium já instalado | `CHROMIUM_PATH=/caminho/chrome npm run test:e2e` |
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

O arquivo `.env.example` lista todas as chaves. Nenhuma é obrigatória para a aplicação subir: sem
elas, cada parte mostra o aviso do que falta em vez de quebrar. `SUPABASE_SECRET_KEY` nunca pode
receber o prefixo `NEXT_PUBLIC`.

## Criar o banco no Supabase

Dois caminhos, escolha um:

**Pelo painel (sem terminal).** Abra o **SQL Editor** do seu projeto, clique em
**New query**, cole o conteúdo de [`supabase/banco-completo.sql`](supabase/banco-completo.sql)
e clique em **Run**. É a junção de todas as migrações na ordem certa.

**Pelo terminal.** `npx supabase link` e depois `npm run db:push`.

O arquivo juntado é gerado a partir de `supabase/migrations/`, que continua
sendo a fonte. Mudou uma migração? Gere o arquivo de novo com `npm run db:sql`.

## Integrações (o que configurar antes de ligar)

### Lembrete automático no WhatsApp

Use a **WhatsApp Business Platform (Cloud API)**, direto com a Meta ou por parceiro oficial. API não
oficial viola os termos e derruba o número do cliente.

1. No painel da Meta, crie o app, ligue o número e pegue `WHATSAPP_TOKEN` e
   `WHATSAPP_PHONE_NUMBER_ID`.
2. Cadastre o modelo de **utilidade** `lembrete_agendamento` em `pt_BR`, com quatro variáveis na
   ordem — nome do cliente, serviço, data, hora — e dois botões de resposta rápida: "Confirmar" e
   "Remarcar". Dentro da janela de 24h o modelo de utilidade é gratuito; fora dela a Meta cobra por
   mensagem, e a tabela só muda no primeiro dia de cada trimestre.
3. Aponte o webhook para `https://seu-dominio.com.br/api/webhooks/whatsapp`, com
   `WHATSAPP_VERIFY_TOKEN` (um segredo que você inventa) e `WHATSAPP_APP_SECRET` (o app secret da
   Meta, que assina cada evento).

Depois, no SQL Editor do Supabase, ligue as extensões `pg_cron` e `pg_net` (Database → Extensions) e
rode — **com os valores reais, nunca em arquivo de migração**:

```sql
select vault.create_secret('https://seu-dominio.com.br', 'app_url');
select vault.create_secret('um-segredo-longo-igual-ao-CRON_SECRET', 'cron_secret');

select cron.schedule(
  'lembretes-whatsapp',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

A rota reserva os lembretes com um `update ... returning` antes de enviar, então duas execuções ao
mesmo tempo nunca mandam o mesmo lembrete. Se o envio falhar, a reserva volta e a execução seguinte
tenta de novo.

### NFS-e (plano Negócio)

A emissão vai por provedor especializado (Focus NFe, PlugNotas/Tecnospeed, Nuvem Fiscal, Notaas —
compare preço, cobertura de municípios, webhooks e suporte ao padrão nacional). Configure
`NFSE_PROVIDER`, `NFSE_ENV` (comece em `homologacao`), `NFSE_API_KEY` e `NFSE_WEBHOOK_TOKEN`, e
aponte o webhook do provedor para `https://seu-dominio.com.br/api/webhooks/nfse`, com o token no
cabeçalho `x-nfse-token`. Quase sempre é preciso o certificado digital da empresa — confirme com o
provedor escolhido.

Os códigos de tributação de cada serviço são preenchidos **pelo contador**, no portal dele. O
Alicerce não calcula imposto: repassa ao provedor exatamente o que estiver configurado.

Cronograma a comunicar ao cliente: o MEI já é obrigado ao padrão nacional, e ME/EPP do Simples a
partir de 01/11/2026.

### Agenda no celular

Cada profissional tem um endereço `/api/ical/<token>` para assinar no Google Agenda ou no calendário
do iPhone. O link é o segredo: quem tem o endereço lê a agenda. O dono troca o link em
Configurações → Agenda no celular, e o anterior para de funcionar na hora.

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

## Lançamento

O checklist do que configurar antes de abrir, e o que já está conferido no
código, está em [`docs/lancamento.md`](docs/lancamento.md).

## Avisos do produto

O Alicerce não substitui o contador, não calcula impostos por conta própria e não é prontuário
eletrônico. As regras fiscais embutidas foram pesquisadas em setembro de 2026, ficam centralizadas em
`src/lib/fiscal/constantes.ts` e precisam de revisão anual.
