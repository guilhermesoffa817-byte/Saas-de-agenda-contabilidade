# ALICERCE — Prompt completo para criar o SaaS no Claude Code

**Sistema de agenda + financeiro/contábil para autônomos e pequenos negócios, com página de vendas de alta conversão.**
Versão 2 · pesquisa atualizada em setembro de 2026

---

## COMO USAR (leia antes de abrir o Claude Code)

Este arquivo descreve o sistema inteiro: banco de dados, telas, regras fiscais, cobrança e página de vendas. Ele é grande de propósito. Pedir "faça tudo" de uma vez costuma dar errado; o que funciona é o Claude Code ler o arquivo e construir **uma fase por vez**, com você testando entre uma e outra.

1. Crie uma pasta vazia chamada `alicerce`. Dentro dela, crie uma pasta `docs` e coloque este arquivo lá, sem mudar o nome: `alicerce/docs/prompt-saas-alicerce.md`.
2. Abra o Claude Code dentro da pasta `alicerce` e envie:
   `Leia o arquivo docs/prompt-saas-alicerce.md inteiro. Depois faça somente a FASE 0 e pare.`
3. Quando a FASE 0 terminar e você conferir o resultado, envie:
   `Faça a FASE 1 do docs/prompt-saas-alicerce.md. Antes de escrever código, me mostre o plano.`
   Repita essa mesma mensagem trocando o número da fase, até a FASE 8.
4. No fim de cada fase o Claude Code vai dizer o que testar e quais chaves colocar no arquivo `.env.local`. Para ver o sistema funcionando, ele vai pedir para você rodar `npm run dev` e abrir `http://localhost:3000` no navegador.
5. Contas que você vai precisar criar (todas têm plano gratuito ou ambiente de teste): GitHub, Supabase (escolha a região **São Paulo**), Vercel, Asaas (sandbox), Resend e Cloudflare (Turnstile). Na FASE 7: Meta (WhatsApp Business Platform) e um emissor de NFS-e.
6. Quer começar a divulgar antes do sistema ficar pronto? Depois da FASE 1, envie: `Faça a FASE 6 em modo lista de espera.` A página de vendas vai ao ar captando interessados; quando as telas reais existirem, peça para trocar os mockups por elas.

**Antes de lançar:** troque todo valor marcado **[EXEMPLO]**, use só depoimentos reais e mostre as partes fiscais (FASES 4 e 7) e os textos de LGPD para um contador e um advogado. As regras fiscais deste arquivo foram pesquisadas em setembro de 2026 e mudam com frequência.

---
---

# INSTRUÇÕES PARA O CLAUDE CODE

## 1. Papel e forma de trabalho

Você é engenheiro(a) full-stack sênior e designer de produto e vai construir o **Alicerce** do zero, seguindo este documento.

- Trabalhe **uma fase por vez**, somente quando o usuário pedir. Antes de codar, mostre um plano curto da fase.
- O usuário não é programador experiente. Sempre que ele precisar fazer algo fora do código (criar conta, copiar chave, configurar um painel), explique passo a passo, em português simples.
- Ao terminar cada fase: rode `npm run lint`, `npx tsc --noEmit` e os testes; corrija o que falhar; faça um commit; e responda com três blocos: **o que foi feito**, **como testar no navegador**, **o que falta configurar**.
- Nunca invente chaves ou segredos. Use `.env.local` (fora do git) e mantenha `.env.example` atualizado.
- Micro-decisões que este documento não cobre: decida pelo padrão daqui e siga. Pergunte apenas o que muda arquitetura, custo mensal ou regra fiscal.
- Interface 100% em português do Brasil, moeda BRL, datas dd/mm/aaaa, fuso horário por empresa (o Brasil tem vários: `America/Sao_Paulo`, `America/Cuiaba`, `America/Manaus`...).

## 2. Contexto do produto

**Alicerce** é um SaaS de agenda + financeiro/contábil para autônomos e pequenos negócios locais: salões, barbearias, clínicas, consultórios, personal trainers e terapeutas.

- **Agenda inteligente:** agendamento online por link, confirmação, lembrete no WhatsApp, bloqueio de horários, vários profissionais.
- **Financeiro simples para o dono:** quanto entrou, quanto saiu, quanto sobrou — sem planilha. Ao concluir um atendimento, o recebimento vira lançamento automaticamente.
- **Ponte com o contador (principal diferencial):** fechamento do mês com um clique, relatórios exportáveis (PDF, Excel, CSV) e um portal onde o contador acompanha todos os clientes dele que usam o Alicerce.

**Público:** dono de negócio que hoje usa caderno, planilha e WhatsApp espalhados, não tem formação financeira, perde dinheiro com faltas e tem medo da bagunça no fim do mês.

**Tom de marca:** corporativo e institucional — sólido, confiável, sério. Nada de tom de startup descolada.

**Concorrência (referência, não copiar):** Trinks (agenda para salões), Vedius (agenda + financeiro para fisioterapia; cerca de R$ 79,90/mês no plano individual, 7 dias grátis sem cartão), Conta Azul/Nibo/Omie (financeiro completo, porém complexo e caro para autônomo). Ângulo do Alicerce: **o único que junta agenda, financeiro do dono e relatório pronto para o contador, sem complicação.**

**Regime do negócio (perguntado no cadastro; muda os relatórios):**
- Autônomo pessoa física → Livro-Caixa para o Carnê-Leão e controle de recibos do Receita Saúde.
- MEI → termômetro do limite anual e relatório mensal de receitas brutas.
- ME/EPP no Simples Nacional → resumo gerencial (DRE simplificada) e exportação contábil.

**O que o Alicerce não é:** não substitui o contador, não calcula impostos por conta própria e não é prontuário eletrônico. Nenhum texto do produto ou da página de vendas pode prometer o contrário.

## 3. Regras fiscais que o sistema precisa respeitar (pesquisa de setembro de 2026)

| Tema | Regra vigente | O que o sistema faz |
|---|---|---|
| Limite do MEI | R$ 81.000 por ano; no ano de abertura, R$ 6.750 por mês de atividade. O PLP 186/2026 propõe aumentar o teto, mas **não foi aprovado**. | Termômetro do limite com alertas em 70% e 90%. Valor em constante revisável. |
| Livro-Caixa (Carnê-Leão) | Só para trabalhador autônomo. Dedutíveis: salários e encargos de empregados, despesas de custeio necessárias à receita, publicações e anuidades profissionais, congressos, contribuições a sindicatos e associações. Não dedutíveis: transporte e veículo (exceto representante comercial), benfeitorias, depreciação, leasing, cupom sem identificação. A dedução é limitada ao rendimento do mês. | Categorias com "sugestão de dedutível" (o contador confirma). Receitas separadas por pagador PF/PJ. Relatório pela data de pagamento. Aviso quando as despesas dedutíveis passam da receita do mês. |
| Receita Saúde | Desde 01/01/2025, médicos, psicólogos, dentistas, fisioterapeutas, fonoaudiólogos e terapeutas ocupacionais que atendem como pessoa física emitem recibo pelo app Receita Saúde, pelo Carnê-Leão Web ou pelo e-CAC. Não há integração pública para emissão. | O sistema **não** emite esse recibo. Ele lista os recebimentos de pacientes pessoa física ainda sem recibo (com CPF e valor) e permite marcar como emitido. |
| NFS-e | MEI: padrão nacional obrigatório desde 01/09/2023 (serviços para empresas). ME/EPP do Simples Nacional: obrigatório a partir de 01/11/2026 (Resolução CGSN nº 191/2026). Municípios aderiram ao padrão nacional em 01/01/2026 (LC 214/2025). Novo DANFSe padronizado pela NT 008/2026. | Emissão somente via provedor especializado (FASE 7). |
| Reforma tributária (IBS/CBS) | 2026 é ano de teste (CBS 0,9% e IBS 0,1%, informativos). Para Simples Nacional e MEI, os campos passam a ser exigidos a partir de 04/01/2027. | Não calcular IBS/CBS internamente. Guardar os valores devolvidos pelo provedor de nota. |
| LGPD | Dado de saúde é dado sensível: exige controle de acesso, senhas individuais, logs de acesso, rastreabilidade e política de retenção. O Alicerce é **operador**; o negócio é **controlador** dos dados dos clientes dele. | RLS por empresa e por papel, tabela de auditoria, prontuário fora do escopo, exportação e exclusão de dados. |

```ts
// src/lib/fiscal/constantes.ts
// Revisar todo ano. Fonte: gov.br/memp ("Teto do MEI"), consultado em set/2026.
// O PLP 186/2026 propõe R$ 110 mil (2027) e R$ 140 mil (2028) — ainda NÃO aprovado.
export const LIMITE_MEI_ANUAL_CENTS = 81_000_00; // R$ 81.000,00
export const LIMITE_MEI_POR_MES_CENTS = 6_750_00; // R$ 6.750,00 por mês de atividade no ano de abertura
export const ALERTAS_LIMITE_MEI = [0.7, 0.9] as const;
```

## 4. Escopo desta versão

**Dentro:** cadastro e permissões por empresa; agenda com vários profissionais; página pública de agendamento; clientes e serviços; financeiro (entradas, saídas, contas a pagar e receber, comprovantes); fechamento do mês; relatórios e exportações para o contador; portal do contador; assinatura paga do Alicerce; lembretes por WhatsApp; Pix copia e cola; página de vendas; integrações opcionais da FASE 7.

**Fora (não construir):** prontuário eletrônico clínico; emissão do recibo Receita Saúde; cálculo próprio de impostos; folha de pagamento; estoque; contabilidade completa (partidas dobradas, SPED) — isso é trabalho do contador, no sistema dele.

## 5. Stack

- **Next.js 16** (versão estável mais recente; houve release de segurança em agosto de 2026, mantenha atualizado), App Router, TypeScript em modo `strict`.
- **Tailwind CSS v4** + **shadcn/ui** (componentes copiados para o projeto) + **lucide-react**.
- **Supabase**: Postgres, Auth, Storage e Cron. Projeto na região São Paulo. Pacotes `@supabase/supabase-js` e `@supabase/ssr`.
- **Zod 4** + **react-hook-form** para formulários; **date-fns 4** + **@date-fns/tz** para datas e fusos.
- **Recharts** (via componente `chart` do shadcn), **exceljs** (Excel), **@react-pdf/renderer** (PDF).
- **Resend** para e-mails; **Cloudflare Turnstile** contra spam no agendamento público.
- **Asaas** para cobrar a assinatura do Alicerce (Pix, boleto, cartão, Pix Automático).
- **Motion** (Framer Motion), **GSAP + ScrollTrigger** e **Lenis** — apenas na página de vendas.
- **@dnd-kit/core** para arrastar agendamentos. Não use FullCalendar: a visão por profissional dele é paga.
- **Vitest** (unidade) e **Playwright** (ponta a ponta). Deploy na **Vercel**.
- Tarefas agendadas pelo **Supabase Cron**, não pelo cron da Vercel (no plano Hobby ele só roda uma vez por dia).

## 6. Estrutura de pastas

```
src/
  app/
    (marketing)/            -> página de vendas, /precos, /para-contadores, /para-saloes, /para-clinicas, /para-personal
    (auth)/                 -> /entrar, /cadastro, /recuperar-senha, /convite/[token]
    (app)/app/              -> sistema logado: agenda, clientes, servicos, financeiro, relatorios, configuracoes, assinatura
    contador/               -> portal do contador
    agendar/[slug]/         -> página pública de agendamento
    api/webhooks/asaas/     -> webhook de pagamentos
    api/cron/lembretes/     -> chamado pelo Supabase Cron
    api/ical/[token]/       -> agenda do profissional no celular (FASE 7)
  components/
    ui/                     -> shadcn
    app/                    -> telas reais do sistema (reaproveitadas na página de vendas em modo demonstração)
    marketing/              -> seções da página de vendas
  lib/
    supabase/               -> client.ts, server.ts, admin.ts, database.types.ts
    fiscal/constantes.ts
    money.ts  dates.ts  pix.ts  availability.ts  whatsapp.ts  planos.ts  asaas.ts  demo-data.ts
    reports/                -> csv.ts, xlsx.ts, pdf/, livro-caixa.ts, receitas-mei.ts, dre.ts
  proxy.ts
supabase/migrations/
docs/prompt-saas-alicerce.md   -> este arquivo
CLAUDE.md
```

---

## FASE 0 — Projeto, design system e regras permanentes

### 0.1 Criar o projeto

A pasta já contém `docs/`. Se o `create-next-app` recusar a pasta por não estar vazia, crie o app numa pasta temporária e mova os arquivos para a raiz.

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npx shadcn@latest init
npx shadcn@latest add button card dialog sheet dropdown-menu input label select textarea table tabs badge switch separator accordion calendar popover sonner chart skeleton avatar tooltip
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers date-fns @date-fns/tz next-themes exceljs @react-pdf/renderer resend @dnd-kit/core server-only motion gsap @gsap/react lenis
npm install -D vitest @playwright/test supabase
npx supabase init
git init
```

O `.gitignore` do Next ignora `.env*`. Acrescente a linha `!.env.example` para versionar o modelo de variáveis.

### 0.2 `.env.example`

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=              # só no servidor, nunca com NEXT_PUBLIC
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
ASAAS_ENV=sandbox                 # sandbox | production
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=              # token próprio, diferente da chave da API
CRON_SECRET=
WHATSAPP_TOKEN=                   # FASE 7
WHATSAPP_PHONE_NUMBER_ID=         # FASE 7
```

### 0.3 `CLAUDE.md` (curto, carregado em toda sessão)

Crie na raiz com o conteúdo abaixo. Mantenha nomes que começam com `@` sempre entre crases: fora delas o Claude Code entende `@caminho` como importação de arquivo. Não importe este documento no `CLAUDE.md`, porque ele é grande; apenas aponte para ele.

```markdown
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
```

### 0.4 Design system — regra máxima: não pode parecer "feito por IA"

Sites genéricos de IA têm um padrão reconhecível: Inter em tudo sem hierarquia, gradiente roxo-azul decorativo, blobs 3D, fotos de banco de "pessoas sorrindo para o laptop", todos os cards com o mesmo arredondamento e nenhuma microinteração real. Faça o oposto.

**Proibido:** gradiente decorativo sem função; ilustração 3D genérica (blobs, robôs, foguetes, estrelinhas); foto de banco de imagens; a mesma fonte para título e corpo sem hierarquia; o mesmo `border-radius` e padding em tudo; seção sem nenhum movimento; frases vazias como "revolucione seu negócio" ou "o futuro da gestão".

**Obrigatório:** telas do produto feitas em código (nunca imagem); hierarquia tipográfica clara; cor com significado; ao menos uma interação real por seção; copy específica, com números e resultados.

**Tipografia:**
- Títulos: **Fraunces** (serifada, variável, com personalidade editorial; tracking negativo em tamanhos grandes).
- Interface e texto: **Geist** (alternativa à Inter usada pela Vercel).
- Números financeiros: **Geist Mono** com algarismos tabulares, como em sistemas financeiros de verdade.

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: "Alicerce — agenda e financeiro do seu negócio em um só lugar",
  description: "Agenda online, controle financeiro simples e relatórios prontos para o contador. Teste grátis por 7 dias, sem cartão.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Paleta "verde institucional, dourado e papel".** Parte do conceito da marca (alicerce = base sólida) e do setor (verde = dinheiro e crescimento; dourado = selo de confiança). Contraste conferido: todos os pares de texto passam no nível AA da WCAG. O dourado `--gold` (3,05:1 sobre o papel) serve só para fundo de selo com texto `--gold-foreground` (5,18:1 no claro, 9,36:1 no escuro), bordas e ícones grandes; para texto dourado use `--gold-ink` (6,04:1).

Atenção: no shadcn, `--accent` é a cor neutra de hover de menus. **Não** coloque o dourado nela; o dourado tem token próprio (`--gold`).

O `shadcn init` gera o `globals.css`. Mantenha a estrutura dele e substitua os valores por estes:

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(98.2% 0.007 88.6);          /* #FBF9F4 papel — nunca branco puro */
  --foreground: oklch(23.5% 0.006 156.8);         /* #1C1F1D grafite — nunca preto puro */
  --card: oklch(99.4% 0.007 88.6);                /* #FFFDF8 */
  --card-foreground: oklch(23.5% 0.006 156.8);
  --popover: oklch(99.4% 0.007 88.6);
  --popover-foreground: oklch(23.5% 0.006 156.8);
  --primary: oklch(32.4% 0.056 167.5);            /* #0F3D2E verde institucional */
  --primary-foreground: oklch(98.2% 0.007 88.6);
  --secondary: oklch(94.1% 0.013 86.8);           /* #EFEBE2 */
  --secondary-foreground: oklch(23.5% 0.006 156.8);
  --muted: oklch(94.1% 0.013 86.8);
  --muted-foreground: oklch(48.3% 0.010 145.4);   /* #5B605B */
  --accent: oklch(91.9% 0.017 88.0);              /* #E9E4D8 hover neutro */
  --accent-foreground: oklch(23.5% 0.006 156.8);
  --destructive: oklch(53.3% 0.151 33.7);         /* #B3432B terracota */
  --border: oklch(89.8% 0.018 89.4);              /* #E2DDD0 */
  --input: oklch(89.8% 0.018 89.4);
  --ring: oklch(32.4% 0.056 167.5);
  --gold: oklch(65.6% 0.120 78.9);                /* #B8872B fundo de selo, borda, ícone grande */
  --gold-foreground: oklch(23.5% 0.006 156.8);    /* texto sobre o dourado */
  --gold-ink: oklch(48.9% 0.091 81.3);            /* #7A5A17 dourado para texto */
  --success: oklch(52.0% 0.103 154.1);            /* #2F7A4D */
  --warning: oklch(54.9% 0.112 70.5);             /* #9A6412 */
  --chart-1: oklch(32.4% 0.056 167.5);
  --chart-2: oklch(65.6% 0.120 78.9);
  --chart-3: oklch(55% 0.060 250);
  --chart-4: oklch(53.3% 0.151 33.7);
  --chart-5: oklch(70% 0.020 90);
}

.dark {
  --background: oklch(19.6% 0.006 156.6);         /* #131614 */
  --foreground: oklch(95.8% 0.010 93.6);          /* #F3F1EA */
  --card: oklch(23.0% 0.007 164.3);               /* #1A1E1C */
  --card-foreground: oklch(95.8% 0.010 93.6);
  --popover: oklch(23.0% 0.007 164.3);
  --popover-foreground: oklch(95.8% 0.010 93.6);
  --primary: oklch(67.5% 0.132 158.5);            /* #3DAF78 */
  --primary-foreground: oklch(18.7% 0.028 160.7); /* #07170F */
  --secondary: oklch(26.7% 0.009 159.4);
  --secondary-foreground: oklch(95.8% 0.010 93.6);
  --muted: oklch(25.4% 0.009 159.4);
  --muted-foreground: oklch(72.5% 0.014 130.8);
  --accent: oklch(28.3% 0.009 159.5);
  --accent-foreground: oklch(95.8% 0.010 93.6);
  --destructive: oklch(68.1% 0.138 34.9);
  --border: oklch(31.0% 0.011 156.5);
  --input: oklch(31.0% 0.011 156.5);
  --ring: oklch(67.5% 0.132 158.5);
  --gold: oklch(78.9% 0.117 88.5);
  --gold-foreground: oklch(19.6% 0.006 156.6);
  --gold-ink: oklch(83.3% 0.100 88.4);
  --success: oklch(73.5% 0.136 159.3);
  --warning: oklch(76.7% 0.128 77.6);
  --chart-1: oklch(67.5% 0.132 158.5);
  --chart-2: oklch(78.9% 0.117 88.5);
  --chart-3: oklch(70% 0.080 250);
  --chart-4: oklch(68.1% 0.138 34.9);
  --chart-5: oklch(60% 0.020 90);
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-fraunces);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-gold: var(--gold);
  --color-gold-foreground: var(--gold-foreground);
  --color-gold-ink: var(--gold-ink);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans antialiased; }
  h1, h2, h3 { @apply font-display tracking-tight; }
  .tabular { font-variant-numeric: tabular-nums; }
}
```

**Uso semântico obrigatório:** verde = ação principal, dinheiro entrando, sucesso. Dourado = selo e destaque ("mais escolhido"), sempre em área pequena. Terracota = alerta e valor negativo. Nunca inverta esses significados.

**Forma e profundidade:** sombras direcionais reais (`shadow-2xl shadow-black/10`); arredondamento com intenção (mockups `rounded-xl`, selos `rounded-full`, cards `rounded-lg`); textura sutil (grade ou ruído a 2–3% de opacidade) nas seções de destaque.

**Tema:** a página de vendas usa o tema claro ("papel"). O sistema logado oferece claro/escuro nas configurações.

### Pronto quando
Projeto roda com `npm run dev`, tokens aplicados, fontes carregando, `CLAUDE.md` criado, primeiro commit feito.

---

## FASE 1 — Contas, empresas, permissões e onboarding

### 1.1 Papéis

| Papel | Pode |
|---|---|
| `dono` | Tudo, inclusive financeiro, equipe, assinatura e fechamento do mês. |
| `recepcao` | Agenda, clientes e registrar recebimentos. Não vê relatórios nem despesas. |
| `profissional` | A agenda e os clientes. Não vê financeiro. |
| `contador` | Só leitura do financeiro, fechamentos e relatórios; define códigos contábeis. **Não** vê telefone nem anotações de clientes (minimização da LGPD). |

### 1.2 Migração `0001_fundacao.sql`

```sql
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
grant usage on schema private to authenticated;

create type public.member_role as enum ('dono', 'profissional', 'recepcao', 'contador');
create type public.tax_regime as enum ('pf_autonomo', 'mei', 'simples_nacional', 'outro');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  segment text not null default 'outro'
    check (segment in ('salao', 'barbearia', 'clinica', 'consultorio', 'personal', 'terapeuta', 'outro')),
  tax_regime public.tax_regime not null default 'mei',
  document text,                                      -- CPF ou CNPJ, só números
  opened_on date,                                     -- data de abertura (limite proporcional do MEI)
  timezone text not null default 'America/Sao_Paulo',
  city text,
  state char(2),
  pix_key text,
  plan text not null default 'trial' check (plan in ('trial', 'essencial', 'profissional', 'negocio')),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on public.organization_members (user_id);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,               -- ex.: 'exportacao.livro_caixa', 'cliente.ver_anotacoes', 'fechamento.reaberto'
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Funções auxiliares das políticas (schema privado, fora da API)
create or replace function private.has_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create or replace function private.is_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

grant execute on function private.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.audit_logs enable row level security;

create policy "membros veem a empresa" on public.organizations
  for select to authenticated using (private.is_member(id));
create policy "dono edita a empresa" on public.organizations
  for update to authenticated
  using (private.has_role(id, array['dono']::public.member_role[]))
  with check (private.has_role(id, array['dono']::public.member_role[]));

-- O dono só edita dados cadastrais. Plano, status e teste grátis só mudam pelo servidor.
revoke update on public.organizations from authenticated;
grant update (name, slug, segment, tax_regime, document, opened_on, timezone, city, state, pix_key)
  on public.organizations to authenticated;

create policy "membros veem a equipe" on public.organization_members
  for select to authenticated using (private.is_member(organization_id));
create policy "dono altera papéis" on public.organization_members
  for update to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));
create policy "dono remove membros" on public.organization_members
  for delete to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]));
-- Entradas na equipe só pelas funções create_organization e accept_invite.

create policy "dono gerencia convites" on public.organization_invites
  for all to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

create policy "dono lê auditoria" on public.audit_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]));

-- Cria a empresa e coloca quem criou como dono
create or replace function public.create_organization(
  p_name text, p_slug text, p_segment text, p_tax_regime public.tax_regime, p_timezone text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.';
  end if;
  insert into public.organizations (name, slug, segment, tax_regime, timezone)
  values (p_name, p_slug, p_segment, p_tax_regime, p_timezone)
  returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, (select auth.uid()), 'dono');
  return v_org;
end;
$$;

-- Aceita convite (equipe ou contador) com o mesmo e-mail do convite
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.organization_invites;
  v_email text;
begin
  select email into v_email from auth.users where id = (select auth.uid());
  select * into v_inv from public.organization_invites
   where token = p_token and accepted_at is null and expires_at > now();
  if v_inv.id is null then
    raise exception 'Convite inválido ou expirado.';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'Este convite foi enviado para outro e-mail.';
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, (select auth.uid()), v_inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text, public.tax_regime, text) from public, anon;
grant execute on function public.create_organization(text, text, text, public.tax_regime, text) to authenticated;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
```

Regras de aplicação: impedir que a empresa fique sem nenhum `dono`; gravar em `audit_logs` (pelo servidor) exportações, reaberturas de mês e visualização de anotações de clientes.

### 1.3 Supabase no Next.js 16 (padrão oficial)

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // chamado de Server Component: o proxy renova a sessão
          }
        },
      },
    },
  );
}
```

```ts
// src/lib/supabase/admin.ts — só no servidor (webhooks, cron, agendamento público)
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

O exemplo oficial do Supabase manda **todas** as rotas para o login. Aqui só `/app` e `/contador` são protegidas; a página de vendas e `/agendar` são públicas.

```ts
// src/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTEGIDAS = ["/app", "/contador"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const protegida = PROTEGIDAS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && protegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("voltar", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Nunca use os métodos antigos `get`/`set`/`remove` nem o pacote `@supabase/auth-helpers-nextjs`.

### 1.4 Telas
- `/cadastro`, `/entrar` (e-mail e senha + link mágico), `/recuperar-senha`, `/convite/[token]`.
- **Onboarding em 5 passos** (barra de progresso, dá para pular e voltar):
  1. Tipo de negócio (ícones: salão, barbearia, clínica, consultório, personal, terapeuta).
  2. Como você trabalha: autônomo pessoa física, MEI, empresa do Simples ou outro (explique cada opção em uma linha).
  3. Horário de funcionamento e profissionais.
  4. Serviços com duração e preço (sugestões prontas por segmento).
  5. Convidar o contador (opcional) e copiar o link de agendamento.
- Seletor de empresa no topo para quem participa de mais de uma.
- Cabeçalho do sistema mostra os dias restantes do teste grátis.

### Pronto quando
Cadastro, login, onboarding e convite funcionam; um usuário de uma empresa não enxerga nada de outra (com teste automatizado provando isso).

---

## FASE 2 — Agenda e página pública de agendamento

### 2.1 Migração `0002_agenda.sql`

```sql
create type public.appointment_status as enum ('agendado', 'confirmado', 'concluido', 'faltou', 'cancelado');

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  color text not null default '#0F3D2E',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  duration_min int not null check (duration_min between 5 and 600),
  buffer_min int not null default 0 check (buffer_min between 0 and 120), -- preparo/limpeza após o atendimento
  price_cents bigint not null check (price_cents >= 0),
  bookable_online boolean not null default true,
  active boolean not null default true
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone_e164 text,                    -- +5566999999999
  email text,
  document text,                      -- CPF opcional (necessário para recibos e notas)
  payer_type text not null default 'pf' check (payer_type in ('pf', 'pj')),
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  notes text,                         -- anotações administrativas. NÃO é prontuário.
  no_show_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, phone_e164)
);

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id),
  client_id uuid not null references public.clients(id),
  service_id uuid not null references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,       -- já inclui o buffer do serviço
  status public.appointment_status not null default 'agendado',
  price_cents bigint not null check (price_cents >= 0),
  source text not null default 'interno' check (source in ('interno', 'link_publico')),
  confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- O banco impede dois atendimentos ativos no mesmo horário do mesmo profissional
  constraint sem_conflito_de_horario exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'confirmado'))
);
create index on public.appointments (organization_id, starts_at);

do $$
declare t text;
begin
  foreach t in array array['professionals', 'services', 'clients', 'working_hours', 'time_off', 'appointments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "equipe lê" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['clients', 'appointments', 'time_off'] loop
    execute format($p$create policy "equipe escreve" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['professionals', 'services', 'working_hours'] loop
    execute format($p$create policy "dono configura" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono']::public.member_role[]))$p$, t);
  end loop;
end $$;
```

Se o banco recusar um agendamento por conflito, o erro tem código `23P01`: mostre "Esse horário acabou de ser ocupado. Escolha outro."

### 2.2 Cálculo de horários livres (com teste)

```ts
// src/lib/availability.ts
import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { TZDate } from "@date-fns/tz";

export type Intervalo = { start: Date; end: Date };

export function gerarHorariosLivres(params: {
  dia: string;                                   // "2026-10-05", data local da empresa
  timezone: string;                              // "America/Cuiaba"
  expediente: { inicio: string; fim: string }[]; // faixas do dia da semana, ex.: [{ inicio: "08:00", fim: "12:00" }]
  ocupados: Intervalo[];                         // agendamentos ativos + folgas
  duracaoMin: number;                            // duração + buffer do serviço
  passoMin?: number;                             // de quanto em quanto oferecer horários
  agora?: Date;
  antecedenciaMinimaMin?: number;
}): Date[] {
  const { dia, timezone, expediente, ocupados, duracaoMin } = params;
  const passoMin = params.passoMin ?? 15;
  const limite = addMinutes(params.agora ?? new Date(), params.antecedenciaMinimaMin ?? 60);
  const [ano, mes, d] = dia.split("-").map(Number);
  const livres: Date[] = [];

  for (const faixa of expediente) {
    const [hi, mi] = faixa.inicio.split(":").map(Number);
    const [hf, mf] = faixa.fim.split(":").map(Number);
    const inicio = new TZDate(ano, mes - 1, d, hi, mi, 0, timezone).getTime();
    const fim = new TZDate(ano, mes - 1, d, hf, mf, 0, timezone).getTime();

    for (let t = inicio; t + duracaoMin * 60_000 <= fim; t += passoMin * 60_000) {
      const candidato = { start: new Date(t), end: new Date(t + duracaoMin * 60_000) };
      if (candidato.start < limite) continue;
      if (ocupados.some((o) => areIntervalsOverlapping(candidato, o))) continue;
      livres.push(candidato.start);
    }
  }
  return livres;
}
```

```ts
// src/lib/availability.test.ts
import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { gerarHorariosLivres } from "./availability";

describe("gerarHorariosLivres", () => {
  it("não oferece horário que conflita com atendimento existente", () => {
    const tz = "America/Cuiaba";
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "12:00" }],
      ocupados: [{ start: new TZDate(2026, 9, 5, 9, 0, 0, tz), end: new TZDate(2026, 9, 5, 10, 0, 0, tz) }],
      duracaoMin: 60,
      passoMin: 60,
      agora: new Date("2026-10-01T00:00:00Z"),
    });
    expect(livres.map((h) => new TZDate(h, tz).getHours())).toEqual([8, 10, 11]);
  });
});
```

### 2.3 Telas da agenda
- **Dia:** uma coluna por profissional (CSS grid), linha vermelha do "agora", clique no espaço vazio cria agendamento, arrastar remarca (`@dnd-kit/core`).
- **Semana** e **lista**, com filtro por profissional.
- Cores de status com significado: agendado (neutro), confirmado (verde), concluído (verde escuro), faltou (terracota), cancelado (riscado).
- Cartão do atendimento: cliente, serviço, valor, telefone, histórico de faltas, botões de ação.
- **Fluxo agenda → financeiro:** ao clicar em "Concluir", abre o modal "Registrar pagamento" (valor já preenchido, forma de pagamento, conta) e chama `concluir_atendimento` (FASE 3). Esse é o momento "uau" do produto: o dinheiro entra no financeiro sem digitar de novo.
- Ao marcar "faltou", somar em `clients.no_show_count` e mostrar o alerta no próximo agendamento desse cliente.

### 2.4 Lembrete sem custo (versão inicial)
Botão "Enviar lembrete" que abre o WhatsApp do próprio profissional com a mensagem pronta. Não precisa de API e não tem custo; a automação vem na FASE 7.

```ts
// src/lib/whatsapp.ts
export function linkWhatsApp(telefoneE164: string, mensagem: string) {
  return `https://wa.me/${telefoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

export const mensagemLembrete = (p: { cliente: string; servico: string; data: string; hora: string; empresa: string }) =>
  `Olá, ${p.cliente}! Passando para lembrar do seu horário de ${p.servico} em ${p.data}, às ${p.hora}, na ${p.empresa}. Posso confirmar?`;
```

### 2.5 Página pública `/agendar/[slug]`
Fluxo em 5 passos, rápido no celular: serviço → profissional (ou "qualquer um") → dia → horário → nome e WhatsApp.
- Checkbox **desmarcado** "Aceito receber lembretes pelo WhatsApp" (grava `whatsapp_opt_in` e a data).
- Link para a política de privacidade da empresa e do Alicerce.
- Proteção: Turnstile + limite de tentativas por IP e por telefone.
- A escrita usa o cliente admin **somente no servidor** e revalida o horário antes de gravar.

```ts
// src/app/agendar/[slug]/actions.ts
"use server";
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const Entrada = z.object({
  slug: z.string().min(3),
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  inicioISO: z.iso.datetime({ offset: true }),
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().regex(/^\+55\d{10,11}$/),
  aceitaWhatsApp: z.boolean(),
  turnstileToken: z.string().min(1),
});

export async function criarAgendamentoPublico(input: z.infer<typeof Entrada>) {
  const dados = Entrada.parse(input);

  const verificacao = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: dados.turnstileToken }),
  }).then((r) => r.json());
  if (!verificacao.success) return { ok: false, erro: "Não foi possível validar. Tente novamente." };

  const supabase = createAdminClient();
  // 1. Buscar empresa pelo slug e serviço ativo com bookable_online = true.
  // 2. Recalcular os horários livres com gerarHorariosLivres() e recusar se o horário não estiver mais livre.
  // 3. Encontrar ou criar o cliente pelo telefone dentro da empresa; gravar opt-in e data.
  // 4. Inserir o agendamento com source = 'link_publico', ends_at = início + duração + buffer.
  // 5. Se o erro tiver code '23P01', responder que o horário acabou de ser ocupado.
  // 6. Enviar e-mail/notificação para a empresa.
  void supabase;
  return { ok: true };
}
```

### Pronto quando
Dá para agendar pelo sistema e pelo link público; conflito de horário é impossível; o teste de horários passa; o lembrete abre o WhatsApp com a mensagem certa.

---

## FASE 3 — Financeiro (painel do dono)

### 3.1 Migração `0003_financeiro.sql`

```sql
create type public.tx_kind as enum ('receita', 'despesa');
create type public.tx_status as enum ('pendente', 'pago', 'cancelado');
create type public.payment_method as enum
  ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'banco' check (type in ('caixa', 'banco', 'maquininha')),
  accounting_code text,               -- código no plano de contas do contador
  active boolean not null default true
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind public.tx_kind not null,
  report_group text not null default 'operacional'
    check (report_group in ('operacional', 'imposto', 'financeiro', 'retirada')),
  deductible_hint boolean not null default false,  -- sugestão para o Livro-Caixa; o contador confirma
  accounting_code text,
  unique (organization_id, name, kind)
);

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  totals jsonb not null default '{}',
  package_path text,                  -- pacote de relatórios no Storage
  unique (organization_id, month)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.tx_kind not null,
  status public.tx_status not null default 'pago',
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  competence_date date not null,      -- mês a que pertence (competência)
  due_date date,
  paid_at date,                       -- data do pagamento (caixa; usada no Livro-Caixa)
  payment_method public.payment_method,
  category_id uuid references public.categories(id),
  account_id uuid references public.accounts(id),
  appointment_id uuid unique references public.appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  payer_type text check (payer_type in ('pf', 'pj')),
  revenue_type text not null default 'servico' check (revenue_type in ('servico', 'revenda', 'industrializado')),
  nota_fiscal_emitida boolean not null default false,
  receita_saude_emitido boolean not null default false,
  attachment_path text,               -- comprovante no bucket privado
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (status <> 'pago' or paid_at is not null)
);
create index on public.transactions (organization_id, paid_at);
create index on public.transactions (organization_id, competence_date);

-- Contas e categorias padrão (empresas novas e as que já existem)
create or replace function private.criar_padroes_para(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts (organization_id, name, type) values
    (p_org, 'Caixa', 'caixa'),
    (p_org, 'Conta bancária', 'banco');
  insert into public.categories (organization_id, name, kind, report_group, deductible_hint) values
    (p_org, 'Atendimentos', 'receita', 'operacional', false),
    (p_org, 'Venda de produtos', 'receita', 'operacional', false),
    (p_org, 'Outras receitas', 'receita', 'operacional', false),
    (p_org, 'Aluguel do espaço', 'despesa', 'operacional', true),
    (p_org, 'Energia, água e internet', 'despesa', 'operacional', true),
    (p_org, 'Materiais e insumos', 'despesa', 'operacional', true),
    (p_org, 'Salários e encargos', 'despesa', 'operacional', true),
    (p_org, 'Conselho de classe e sindicato', 'despesa', 'operacional', true),
    (p_org, 'Cursos, congressos e publicações', 'despesa', 'operacional', true),
    (p_org, 'Marketing', 'despesa', 'operacional', false),
    (p_org, 'Taxas de maquininha e bancárias', 'despesa', 'financeiro', false),
    (p_org, 'Impostos (DAS, ISS, Carnê-Leão)', 'despesa', 'imposto', false),
    (p_org, 'Retirada do dono', 'despesa', 'retirada', false),
    (p_org, 'Outras despesas', 'despesa', 'operacional', false)
  on conflict (organization_id, name, kind) do nothing;
end;
$$;

create or replace function private.trg_criar_padroes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.criar_padroes_para(new.id);
  return new;
end;
$$;

create trigger trg_padroes_financeiros
  after insert on public.organizations
  for each row execute function private.trg_criar_padroes();

select private.criar_padroes_para(id) from public.organizations; -- empresas criadas nas fases anteriores

-- Mês fechado não aceita inclusão, edição nem exclusão de lançamentos
create or replace function private.bloquear_mes_fechado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_meses date[] := '{}';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_org := new.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(new.paid_at, new.competence_date)::timestamp)::date;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_org := old.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(old.paid_at, old.competence_date)::timestamp)::date;
  end if;
  if exists (
    select 1 from public.monthly_closings c
    where c.organization_id = v_org and c.reopened_at is null and c.month = any (v_meses)
  ) then
    raise exception 'Mês fechado: reabra o fechamento para alterar este lançamento.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_bloquear_mes_fechado
  before insert or update or delete on public.transactions
  for each row execute function private.bloquear_mes_fechado();

do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'monthly_closings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['accounts', 'categories'] loop
    execute format($p$create policy "leitura" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'contador', 'recepcao']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['transactions', 'monthly_closings'] loop
    execute format($p$create policy "dono e contador leem" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['accounts', 'categories', 'transactions'] loop
    execute format($p$create policy "dono escreve" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono']::public.member_role[]))$p$, t);
  end loop;
end $$;

create policy "recepção registra recebimentos" on public.transactions
  for insert to authenticated
  with check (kind = 'receita' and private.has_role(organization_id, array['recepcao']::public.member_role[]));

-- Conclui o atendimento e lança o recebimento numa única operação
create or replace function public.concluir_atendimento(
  p_appointment uuid, p_metodo public.payment_method, p_valor_cents bigint, p_conta uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ag public.appointments;
  v_tz text;
  v_cat uuid;
  v_tx uuid;
begin
  select * into v_ag from public.appointments where id = p_appointment for update;
  if v_ag.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if not private.has_role(v_ag.organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_ag.status in ('concluido', 'cancelado') then
    raise exception 'Este atendimento não pode mais ser concluído.';
  end if;
  if p_valor_cents <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if p_conta is not null and not exists (
    select 1 from public.accounts where id = p_conta and organization_id = v_ag.organization_id
  ) then
    raise exception 'Conta inválida.';
  end if;

  select timezone into v_tz from public.organizations where id = v_ag.organization_id;
  select id into v_cat from public.categories
   where organization_id = v_ag.organization_id and kind = 'receita' and name = 'Atendimentos';

  update public.appointments set status = 'concluido' where id = p_appointment;

  insert into public.transactions (
    organization_id, kind, status, description, amount_cents, competence_date, paid_at,
    payment_method, category_id, account_id, appointment_id, client_id, payer_type, created_by
  )
  select v_ag.organization_id, 'receita', 'pago', s.name || ' — ' || c.name, p_valor_cents,
         (v_ag.starts_at at time zone v_tz)::date, (now() at time zone v_tz)::date,
         p_metodo, v_cat, p_conta, v_ag.id, c.id, c.payer_type, (select auth.uid())
    from public.services s
    join public.clients c on c.id = v_ag.client_id
   where s.id = v_ag.service_id
  returning id into v_tx;

  return v_tx;
end;
$$;

revoke execute on function public.concluir_atendimento(uuid, public.payment_method, bigint, uuid) from public, anon;
grant execute on function public.concluir_atendimento(uuid, public.payment_method, bigint, uuid) to authenticated;

-- Comprovantes: bucket privado, primeira pasta do caminho = id da empresa
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

create policy "comprovantes: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono', 'recepcao', 'contador']::public.member_role[]));
create policy "comprovantes: envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono', 'recepcao']::public.member_role[]));
```

### 3.2 Dinheiro

```ts
// src/lib/money.ts
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarBRL = (cents: number) => brl.format(cents / 100);

// Campo de valor no estilo app de banco: a pessoa digita só números e o valor preenche da direita.
// "12990" -> 12990 centavos -> R$ 129,90. Sem ambiguidade entre ponto e vírgula.
export const digitosParaCentavos = (texto: string) => Number(texto.replace(/\D/g, "") || "0");
```

### 3.3 Telas do financeiro
- **Painel "Entrou / Saiu / Sobrou"** do mês, em linguagem simples, com comparação com o mês anterior.
- Gráfico de barras dos últimos 6 meses (entradas × saídas) e ranking das maiores despesas.
- "A receber" e "A pagar" dos próximos 7 dias.
- **Termômetro do MEI** (só para MEI): receita bruta do ano × `LIMITE_MEI_ANUAL_CENTS` (ou limite proporcional pelo `opened_on`), com alertas em 70% e 90%.
- Lançamentos: filtros por período, categoria, conta e forma de pagamento; anexo de comprovante (foto pelo celular); lançamento recorrente (aluguel, internet).
- Categorias editáveis, com a marcação "costuma ser dedutível no Livro-Caixa — confirme com seu contador".
- **Pix copia e cola** no recebimento, gerado com a chave Pix da empresa. O pagamento continua sendo confirmado manualmente.

```ts
// src/lib/pix.ts — Pix "copia e cola" estático (BR Code), sem integração bancária.
// Chave: CPF/CNPJ só números, e-mail, telefone no formato +5566999999999, ou chave aleatória.
// Teste em apps de bancos reais antes de lançar.
function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const limpar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function pixCopiaECola(p: { chave: string; nome: string; cidade: string; valorCents?: number; txid?: string }) {
  const txid = (p.txid ?? "***").replace(/[^A-Za-z0-9*]/g, "").slice(0, 25) || "***";
  const payload =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", p.chave)) +
    campo("52", "0000") +
    campo("53", "986") +
    (p.valorCents ? campo("54", (p.valorCents / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", limpar(p.nome).slice(0, 25)) +
    campo("60", limpar(p.cidade).slice(0, 15)) +
    campo("62", campo("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
```

### Pronto quando
Concluir um atendimento cria o recebimento; o painel bate com a soma dos lançamentos; mês fechado não aceita edição; o Pix gerado é lido por um app de banco.

---

## FASE 4 — Contador: fechamento do mês, relatórios e portal

### 4.1 Fechamento do mês

```sql
-- supabase/migrations/0004_fechamento.sql
create or replace function public.fechar_mes(p_org uuid, p_mes date)
returns public.monthly_closings
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes::timestamp)::date;
  v_row public.monthly_closings;
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Apenas o dono pode fechar o mês.';
  end if;
  insert into public.monthly_closings (organization_id, month, closed_by, totals)
  select p_org, v_mes, (select auth.uid()), jsonb_build_object(
    'receitas_cents', coalesce(sum(t.amount_cents) filter (where t.kind = 'receita'), 0),
    'despesas_cents', coalesce(sum(t.amount_cents) filter (where t.kind = 'despesa'), 0),
    'lancamentos', count(*)
  )
  from public.transactions t
  where t.organization_id = p_org
    and t.status = 'pago'
    and t.paid_at >= v_mes
    and t.paid_at < (v_mes + interval '1 month')
  on conflict (organization_id, month) do update
    set closed_at = now(), closed_by = excluded.closed_by, reopened_at = null, totals = excluded.totals
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.reabrir_mes(p_org uuid, p_mes date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Apenas o dono pode reabrir o mês.';
  end if;
  update public.monthly_closings
     set reopened_at = now()
   where organization_id = p_org and month = date_trunc('month', p_mes::timestamp)::date;
  insert into public.audit_logs (organization_id, user_id, action, metadata)
  values (p_org, (select auth.uid()), 'fechamento.reaberto', jsonb_build_object('mes', p_mes));
end;
$$;

-- O contador só pode mexer no código contábil, nada mais
create or replace function public.definir_codigo_contabil(p_categoria uuid, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.categories where id = p_categoria;
  if v_org is null or not private.has_role(v_org, array['dono', 'contador']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  update public.categories set accounting_code = nullif(trim(p_codigo), '') where id = p_categoria;
end;
$$;

revoke execute on function public.fechar_mes(uuid, date) from public, anon;
grant execute on function public.fechar_mes(uuid, date) to authenticated;
revoke execute on function public.reabrir_mes(uuid, date) from public, anon;
grant execute on function public.reabrir_mes(uuid, date) to authenticated;
revoke execute on function public.definir_codigo_contabil(uuid, text) from public, anon;
grant execute on function public.definir_codigo_contabil(uuid, text) to authenticated;
```

**Fluxo "Fechar mês" (um clique para o dono):**
1. Checklist de pendências: lançamentos sem categoria, recebimentos sem forma de pagamento, comprovantes faltando, recibos do Receita Saúde pendentes.
2. Confirmar → `fechar_mes` trava o mês.
3. Gerar o pacote (PDF do resumo + Excel + CSV) e salvar em bucket privado `fechamentos/{organization_id}/{aaaa-mm}/`.
4. Enviar e-mail ao contador com link assinado que expira em 7 dias e registrar em `audit_logs`.

### 4.2 Relatórios (todos com filtro de período e exportação PDF, Excel e CSV)

| Relatório | Para quem | Conteúdo |
|---|---|---|
| Resumo do mês (DRE simplificada) | Todos | Receitas; despesas operacionais, financeiras e impostos; resultado; retiradas do dono em linha separada. |
| Livro-Caixa | Autônomo PF | Pela data de pagamento: data, histórico, receita de PF, receita de PJ, despesa, "dedutível (sugestão)". Aviso quando as dedutíveis passam da receita do mês. |
| Receitas brutas do MEI | MEI | Por mês: serviços, revenda e industrializados, cada um separado em "com nota fiscal" e "sem nota fiscal", e total. |
| Recibos Receita Saúde pendentes | Profissionais de saúde PF | Recebimentos de pacientes PF sem recibo: data, paciente, CPF, valor, botão "marcar como emitido". Texto: "emita no app Receita Saúde". |
| Contas a pagar e a receber | Todos | Vencimentos, atrasados, previsão de caixa de 30 dias. |
| Exportação contábil | Contador | CSV configurável (ver 4.3). |

### 4.3 Exportação para o sistema do contador
Cada sistema contábil (Domínio, Alterdata, Questor...) tem seu leiaute e ele muda entre versões. Não chute um formato: crie a tela "Configurar exportação", onde o contador escolhe a ordem das colunas, o separador e o formato de data a partir de um modelo que ele mesmo informa.
- Colunas disponíveis: data, conta débito, conta crédito, valor, histórico, documento, categoria, forma de pagamento.
- Contas e categorias usam o `accounting_code` definido pelo contador.
- Padrão brasileiro: separador `;`, decimal com vírgula, sem separador de milhar, UTF-8 com BOM (para o Excel abrir acentos corretamente).

```ts
// src/lib/reports/csv.ts
type Celula = string | number;

export function gerarCSV(cabecalho: string[], linhas: Celula[][]) {
  const formatar = (v: Celula) => {
    const s = typeof v === "number"
      ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
      : v;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [cabecalho, ...linhas].map((linha) => linha.map(formatar).join(";")).join("\r\n");
  return "﻿" + corpo;
}
```

### 4.4 Portal do contador (`/contador`)
- Lista de todas as empresas em que o usuário é `contador`, com o status do mês (fechado, aberto, com pendências) e botão de baixar o pacote.
- Dentro de cada empresa: relatórios, definição de códigos contábeis (`definir_codigo_contabil`) e botão "Pedir comprovante" (cria um pedido e notifica o dono por e-mail).
- O contador **não** vê telefone nem anotações dos clientes da empresa.
- **Canal de crescimento:** o acesso do contador é gratuito em todos os planos. No portal, um link "Indique para seus clientes" com código de indicação (guardar em `organizations.referred_by_accountant`, FASE 5). Prepare o terreno para um programa de parceria.

### Pronto quando
O dono fecha o mês e o contador recebe o e-mail; todos os relatórios exportam nos três formatos; os totais batem com o painel; o contador não enxerga dados pessoais dos clientes.

---

## FASE 5 — Assinatura do Alicerce e limites dos planos

### 5.1 Planos **[EXEMPLO de valores — mantenha a lógica]**

```ts
// src/lib/planos.ts
export const PLANOS = {
  essencial:    { nome: "Essencial",    mensalCents: 69_00,  anualCents: 690_00,   maxProfissionais: 1,        lembretesAutomaticosMes: 0,    nfse: false },
  profissional: { nome: "Profissional", mensalCents: 129_00, anualCents: 1_290_00, maxProfissionais: 5,        lembretesAutomaticosMes: 500,  nfse: false },
  negocio:      { nome: "Negócio",      mensalCents: 219_00, anualCents: 2_190_00, maxProfissionais: Infinity, lembretesAutomaticosMes: 2000, nfse: true },
} as const;
```

- Todos os planos têm agenda, link de agendamento, financeiro, fechamento do mês, relatórios e acesso gratuito do contador (esse é o diferencial; não esconda no plano caro).
- Anual = 10 mensalidades ("2 meses grátis").
- 7 dias grátis sem cartão. Aplique os limites no servidor (ao criar profissional, ao enviar lembrete automático, ao emitir nota).

### 5.2 Migração `0005_assinatura.sql`

```sql
alter table public.organizations
  add column asaas_customer_id text,
  add column asaas_subscription_id text,
  add column billing_cycle text check (billing_cycle in ('mensal', 'anual')),
  add column pending_plan text check (pending_plan in ('essencial', 'profissional', 'negocio')),
  add column referred_by_accountant uuid references auth.users(id);

create table public.billing_events (
  id text primary key,                -- id do evento do Asaas (idempotência)
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security; -- sem políticas: só o servidor acessa
```

### 5.3 Asaas
- Sandbox: `https://api-sandbox.asaas.com/v3` · Produção: `https://api.asaas.com/v3`. Autenticação pelo header `access_token`. Conta sandbox é separada da conta real.
- Criar cliente (`POST /customers`) quando o teste começa; criar assinatura (`POST /subscriptions`) no checkout, com `customer`, `billingType`, `value` (em reais), `nextDueDate` e `cycle` (`MONTHLY` ou `YEARLY`).
- Assinaturas aceitam boleto, Pix e cartão; só o cartão é debitado automaticamente. Para Pix recorrente sem ação do cliente, ofereça **Pix Automático** (autorização única por QR Code).

```ts
// src/lib/asaas.ts
import "server-only";

const BASE = process.env.ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

export async function asaas<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "alicerce-app",
      access_token: process.env.ASAAS_API_KEY!,
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Asaas ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
```

**Webhook:** o Asaas envia o token configurado no painel no header `asaas-access-token` (use um token próprio, nunca a chave da API). A entrega é "pelo menos uma vez": grave o `id` do evento antes de processar e ignore repetidos. Responda 200 rápido; após 15 falhas seguidas a fila é pausada, e os eventos ficam guardados por 14 dias.

```ts
// src/app/api/webhooks/asaas/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUS_POR_EVENTO: Record<string, "active" | "past_due" | undefined> = {
  PAYMENT_CONFIRMED: "active",
  PAYMENT_RECEIVED: "active",
  PAYMENT_OVERDUE: "past_due",
};

export async function POST(req: Request) {
  if (req.headers.get("asaas-access-token") !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const evento = await req.json();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("billing_events")
    .insert({ id: evento.id, type: evento.event, payload: evento });
  if (error?.code === "23505") return NextResponse.json({ ok: true }); // já processado
  if (error) return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });

  const assinatura: string | undefined = evento.payment?.subscription;
  const status = STATUS_POR_EVENTO[evento.event];
  if (assinatura && status) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, plan, pending_plan")
      .eq("asaas_subscription_id", assinatura)
      .maybeSingle();
    if (org) {
      await supabase
        .from("organizations")
        .update(
          status === "active"
            ? { subscription_status: status, plan: org.pending_plan ?? org.plan, pending_plan: null }
            : { subscription_status: status },
        )
        .eq("id", org.id);
    }
  }
  return NextResponse.json({ ok: true });
}
```

No checkout, grave `asaas_subscription_id` e o plano escolhido em `pending_plan`; o webhook aplica o plano quando o pagamento é confirmado. Outros eventos úteis: `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`.

### 5.4 Regras de acesso
- `trialing` vencido ou `past_due` há mais de 5 dias → **modo somente leitura**: nada é apagado, exportar continua liberado (confiança e LGPD), e um aviso claro leva ao pagamento.
- `canceled` → dados guardados por 90 dias **[EXEMPLO]**, com exportação liberada.
- Página `/app/assinatura`: plano atual, próxima cobrança, trocar de plano, cancelar (sem esconder o botão).

### 5.5 Conversão do teste grátis
- Ativação = criar o primeiro agendamento **e** registrar o primeiro recebimento em até 48 horas. Meça isso.
- E-mails **[EXEMPLO]**: dia 0 boas-vindas com o link de agendamento; dia 1 cadastrar serviços; dia 3 registrar o primeiro recebimento; dia 5 convidar o contador; dia 6 "seu teste acaba amanhã" com a oferta anual; dia 8 "seus dados estão guardados".
- Funil de eventos (ferramenta de analytics sem cookies, ou com banner de consentimento): visita → cadastro → onboarding concluído → ativação → assinatura.

### Pronto quando
Assinar no sandbox muda o status para `active`; boleto vencido leva a `past_due`; evento repetido não é processado duas vezes; os limites de cada plano são respeitados.

---

## FASE 6 — Página de vendas de alta conversão

Construa em `src/app/(marketing)`. As telas mostradas **são os componentes reais** de `src/components/app`, renderizados em modo demonstração (somente leitura, com `src/lib/demo-data.ts`: nomes, serviços e valores brasileiros realistas, como "Escova + hidratação — R$ 120,00"). Em "modo lista de espera", troque os botões de teste grátis por um formulário de interesse.

### 6.1 Voz e fórmulas de copy
- Título com no máximo **8 palavras / 44 caracteres**, falando do **resultado**, não da categoria. Errado: "Sistema de gestão para autônomos".
- Subtítulo é uma frase só, que não repete o título: quem, qual problema, como resolve.
- **Um CTA principal por dobra.** Dois CTAs concorrentes convertem pior que um bem feito.
- Seção de problema usa **PAS** (problema → agitação → solução); contraste antes/depois usa **BAB**.

Títulos para testar **[EXEMPLO]**:
1. "O alicerce da organização do seu negócio."
2. "Sua agenda cheia. Seu financeiro em ordem."
3. "Menos faltas na agenda, mais controle do dinheiro."

Subtítulo **[EXEMPLO]**: "Agenda online, financeiro sem planilha e relatório pronto para o seu contador — tudo em um só lugar."

### 6.2 Seções (nesta ordem)

1. **Cabeçalho fixo:** transparente no topo, ganha desfoque e borda ao rolar. Logo, no máximo 4 links, um único botão ("Testar 7 dias grátis").
2. **Hero:** título + subtítulo + CTA + linha de confiança ("Sem cartão de crédito · 7 dias grátis · Cancele quando quiser"). À direita, a tela real da agenda do dia dentro do `BrowserFrame`, com entrada suave e parallax leve.
3. **Problema (PAS):** "O cliente marca no WhatsApp, você anota no caderno, e no fim do mês ninguém sabe quanto entrou." Agite o custo: cadeira vazia por falta não confirmada, recibo perdido, contador pedindo comprovante toda semana. Layout dividido: "hoje" (ilustração de linha de caderno e mensagens soltas, nunca foto) × "com o Alicerce" (tela real). Itens entram em sequência ao rolar.
4. **Três pilares (BAB):** Agenda inteligente · Financeiro sem planilha · Pronto para o contador. Ícone Lucide, título curto, uma frase. Card sobe levemente no hover.
5. **"Por dentro do Alicerce" (tour com rolagem fixa):** no desktop, texto dos passos à esquerda e tela fixa à direita, que troca conforme a rolagem. No celular, passos empilhados, cada um com sua tela, sem fixar. Passos:
   1. O cliente agenda sozinho pelo link → agenda do dia enchendo.
   2. O lembrete sai no WhatsApp → atendimento confirmado.
   3. Você conclui o atendimento → o recebimento entra no financeiro sozinho.
   4. Fim do mês → fechamento em um clique e relatório enviado ao contador.
6. **Funcionalidades (grade bento assimétrica):** três grupos — Agenda, Financeiro, Contador. Inclua os diferenciais pesquisados: termômetro do limite do MEI, Livro-Caixa pronto para o Carnê-Leão, controle de recibos do Receita Saúde, Pix copia e cola, fechamento do mês travado, portal do contador.
7. **Para quem é:** cards por segmento (salão, barbearia, clínica, consultório, personal, terapeuta), cada um levando à página do segmento (`/para-saloes` etc.) com texto e CTA próprios.
8. **Prova social:** números animados + depoimentos com nome, profissão e cidade. Até existirem depoimentos reais, deixe o bloco oculto em produção e marcado no código com `{/* SUBSTITUIR POR DEPOIMENTO REAL */}`. Nunca publique nome, foto, número ou logo inventados.
9. **Comparativo:** Alicerce × caderno/planilha × sistema genérico de agenda. Linhas: agendamento online, lembrete no WhatsApp, controle de caixa, recebimento automático ao concluir, fechamento do mês, relatório para o contador, portal do contador, suporte em português. Coluna do Alicerce com fundo `muted` e check verde; as outras com traço terracota.
10. **Para contadores:** "Seus clientes organizados, sem pedir comprovante toda semana." Portal com todos os clientes, fechamento pronto, exportação configurável, acesso gratuito. CTA secundário: "Sou contador".
11. **Preços:** três planos (três opções convertem melhor que duas; quatro ou mais atrapalham). Selo dourado "Mais escolhido" **só** no plano do meio. Alternador mensal/anual com o selo "2 meses grátis" (fala de perda evitada, não só de porcentagem). Ao lado do botão de assinar: "7 dias grátis, sem cartão · Cancele quando quiser".
12. **Perguntas frequentes (acordeão):**
    - "Meus dados estão seguros?" (LGPD, servidores no Brasil, acesso por papel, backups)
    - "Preciso entender de contabilidade?" (não; a linguagem é "entrou, saiu, sobrou")
    - "O Alicerce substitui meu contador?" (**não**; ele entrega tudo organizado para o seu contador)
    - "Meu contador consegue usar os relatórios?" (sim; acesso gratuito e exportação configurável)
    - "Emite nota fiscal?" (responda conforme a FASE 7 estiver pronta; nunca prometa antes)
    - "Emite o recibo do Receita Saúde?" (não, a Receita não oferece integração; o Alicerce mostra quais recibos faltam emitir)
    - "Preciso de cartão para testar?" · "Posso cancelar quando quiser?" · "Consigo trazer meus clientes de outro sistema?" (importação por planilha) · "Funciona com mais de um profissional?"
13. **CTA final:** faixa em `bg-primary`, título curto reforçando o resultado (diferente do hero), um botão grande.
14. **Rodapé institucional:** logo, colunas de links, termos, privacidade, contato do encarregado de dados, CNPJ da empresa **[EXEMPLO]**.

### 6.3 BrowserFrame (moldura das telas reais)

```tsx
// src/components/marketing/browser-frame.tsx
import type { ReactNode } from "react";

export function BrowserFrame({ children, url = "app.alicerce.com.br" }: { children: ReactNode; url?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground">
          {url}
        </div>
      </div>
      <div className="pointer-events-none select-none" inert>
        {children}
      </div>
    </div>
  );
}
```

### 6.4 Animações (código)

Reveal em sequência ao entrar na tela:

```tsx
// src/components/marketing/reveal.tsx
"use client";
import { Children, type ReactNode } from "react";
import { motion, type Variants } from "motion/react";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={container} initial="hidden" whileInView="show"
      viewport={{ once: true, margin: "-80px" }}>
      {Children.toArray(children).map((child, i) => (
        <motion.div key={i} variants={item}>{child}</motion.div>
      ))}
    </motion.div>
  );
}
```

Parallax da tela do hero (entrada e parallax em elementos separados, para não brigarem pelo mesmo `y`):

```tsx
// src/components/marketing/hero-mockup.tsx
"use client";
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

export function HeroMockup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduzir ? 0 : 80]);

  return (
    <div ref={ref}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <motion.div style={{ y }}>{children}</motion.div>
      </motion.div>
    </div>
  );
}
```

Tour "Por dentro do Alicerce" (fixação por `sticky` do CSS; o GSAP só lê o progresso da rolagem):

```tsx
// src/components/marketing/tour-produto.tsx
"use client";
import { useRef, useState, type ComponentType } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "motion/react";
import { BrowserFrame } from "./browser-frame";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Passo = { titulo: string; texto: string; Tela: ComponentType };

export function TourProduto({ passos }: { passos: Passo[] }) {
  const secao = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(0);

  useGSAP(() => {
    gsap.matchMedia().add("(min-width: 768px)", () => {
      ScrollTrigger.create({
        trigger: secao.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => setAtivo(Math.min(passos.length - 1, Math.floor(self.progress * passos.length))),
      });
    });
  }, { scope: secao });

  const Tela = passos[ativo].Tela;

  return (
    <section ref={secao} aria-label="Por dentro do Alicerce" className="relative md:h-[400vh]">
      {/* Celular: passos empilhados, cada um com a sua tela */}
      <div className="space-y-12 md:hidden">
        {passos.map(({ titulo, texto, Tela: T }) => (
          <div key={titulo} className="space-y-4">
            <h3 className="text-2xl">{titulo}</h3>
            <p className="text-muted-foreground">{texto}</p>
            <BrowserFrame><T /></BrowserFrame>
          </div>
        ))}
      </div>

      {/* Desktop: texto à esquerda, tela fixa à direita */}
      <div className="sticky top-0 hidden h-screen items-center gap-12 md:grid md:grid-cols-2">
        <ol className="space-y-8">
          {passos.map((p, i) => (
            <li key={p.titulo} className={`transition-opacity duration-300 ${i === ativo ? "opacity-100" : "opacity-35"}`}>
              <h3 className="text-2xl">{p.titulo}</h3>
              <p className="text-muted-foreground">{p.texto}</p>
            </li>
          ))}
        </ol>
        <BrowserFrame>
          <AnimatePresence mode="wait">
            <motion.div key={ativo} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <Tela />
            </motion.div>
          </AnimatePresence>
        </BrowserFrame>
      </div>
    </section>
  );
}
```

A altura `md:h-[400vh]` corresponde a 4 passos; se mudar a quantidade, ajuste.

Números animados:

```tsx
// src/components/marketing/stat-counter.tsx
"use client";
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

export function StatCounter({ valor, sufixo = "" }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visivel = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const mola = useSpring(mv, { damping: 40, stiffness: 120 });

  useEffect(() => {
    if (visivel) mv.set(valor);
  }, [visivel, valor, mv]);

  useEffect(
    () => mola.on("change", (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("pt-BR") + sufixo;
    }),
    [mola, sufixo],
  );

  return <span ref={ref} className="font-mono tabular text-4xl font-semibold text-primary">0{sufixo}</span>;
}
```

Alternador mensal/anual:

```tsx
// src/components/marketing/alternador-preco.tsx
"use client";
import { motion } from "motion/react";

export function AlternadorPreco({ anual, onChange }: { anual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" role="switch" aria-checked={anual} aria-label="Cobrança anual"
        onClick={() => onChange(!anual)}
        className="relative grid h-10 w-48 grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium">
        <motion.span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-primary"
          animate={{ x: anual ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
        <span className={`relative z-10 self-center ${anual ? "" : "text-primary-foreground"}`}>Mensal</span>
        <span className={`relative z-10 self-center ${anual ? "text-primary-foreground" : ""}`}>Anual</span>
      </button>
      <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">2 meses grátis</span>
    </div>
  );
}
```

Rolagem suave (somente no layout de marketing, sincronizada com o ScrollTrigger):

```tsx
// src/components/marketing/smooth-scroll.tsx
"use client";
import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
  return <>{children}</>;
}
```

Regras: toda seção tem pelo menos uma animação ou interação real; nada de animação no sistema logado além de microtransições (abrir modal, salvar, arrastar).

### 6.5 Performance, SEO e acessibilidade
- Teste o hero e o tour em 375px de largura antes de considerar pronto. Lighthouse no celular ≥ 90 em desempenho e acessibilidade.
- Metadados completos, Open Graph (imagem gerada com `next/og` usando os tokens da marca), `schema.org/SoftwareApplication`, sitemap e robots.
- Páginas por segmento com título e descrição próprios.
- Contraste AA, navegação por teclado, `alt` em imagens, foco visível.

### Pronto quando
Todas as seções existem na ordem, as telas são componentes reais, o tour funciona no desktop e empilha no celular, e o checklist anti-"cara de IA" da FASE 0 passa.

---

## FASE 7 — Integrações: WhatsApp oficial, NFS-e e agenda no celular

### 7.1 Lembretes automáticos pelo WhatsApp (API oficial da Meta)
- Use a **WhatsApp Business Platform (Cloud API)**, direto com a Meta ou via parceiro oficial. **Não use APIs não oficiais**: violam os termos e podem banir o número do cliente.
- Cobrança por mensagem (desde julho de 2025). Modelos de **utilidade** entregues dentro da janela de atendimento de 24h são gratuitos; fora dela, são cobrados; marketing é sempre cobrado. A Meta só altera preços no primeiro dia de cada trimestre: confira a tabela vigente antes de definir as franquias dos planos.
- Modelo de utilidade `lembrete_agendamento` com variáveis (nome, serviço, data, hora) e botões "Confirmar" e "Remarcar". O webhook da Meta atualiza o agendamento para `confirmado`.
- Só envie para clientes com `whatsapp_opt_in = true`. Registre cada envio.

```sql
-- supabase/migrations/0007_integracoes.sql
create table public.message_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  channel text not null default 'whatsapp',
  template text not null,
  provider_message_id text,
  status text not null default 'enviado',
  created_at timestamptz not null default now()
);
alter table public.message_logs enable row level security;
create policy "dono e recepção leem envios" on public.message_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'recepcao']::public.member_role[]));

alter table public.professionals
  add column ical_token text unique default replace(gen_random_uuid()::text, '-', '');
```

**Agendamento a cada 5 minutos (Supabase Cron).** Habilite as extensões `pg_cron` e `pg_net` no painel do Supabase (Database → Extensions). Rode os dois `vault.create_secret` **manualmente** no SQL Editor, com os valores reais — nunca em arquivo de migração.

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

```ts
// src/app/api/cron/lembretes/route.ts
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("não autorizado", { status: 401 });
  }
  const supabase = createAdminClient();
  const agora = Date.now();
  const de = new Date(agora + 23 * 3_600_000).toISOString();
  const ate = new Date(agora + 24 * 3_600_000).toISOString();

  // "Reserva" os lembretes antes de enviar, para duas execuções nunca mandarem o mesmo lembrete.
  const { data: pendentes, error } = await supabase
    .from("appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("status", "agendado")
    .is("reminder_sent_at", null)
    .gte("starts_at", de)
    .lt("starts_at", ate)
    .select("id, organization_id, starts_at, client_id, service_id");
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  // Para cada pendente: conferir opt-in do cliente e franquia do plano, enviar o modelo
  // pela Cloud API, gravar em message_logs; em caso de falha, voltar reminder_sent_at para null.
  return Response.json({ reservados: pendentes?.length ?? 0 });
}
```

### 7.2 NFS-e (plano Negócio)
- Integre por **provedor especializado** (compare Focus NFe, PlugNotas/Tecnospeed, Nuvem Fiscal, Notaas em preço, cobertura, webhooks e suporte ao padrão nacional). O provedor cuida do leiaute nacional, do novo DANFSe (NT 008/2026) e dos campos de IBS/CBS.
- Normalmente é preciso o certificado digital da empresa: confirme com o provedor escolhido e explique ao usuário como enviar.
- O contador configura, por serviço, os códigos de tributação. O Alicerce não calcula imposto.
- Fluxo: recebimento registrado → "Emitir NFS-e" → envio ao provedor → webhook com o resultado → guardar XML e PDF no Storage → marcar `nota_fiscal_emitida`.
- Cronograma a comunicar: MEI já é obrigado ao padrão nacional; ME/EPP do Simples, a partir de 01/11/2026.

### 7.3 Agenda no celular
Endpoint `/api/ical/[token]` que devolve um arquivo `.ics` com os atendimentos do profissional (assinável no Google Agenda e no calendário do iPhone). Botão "Gerar novo link" troca o `ical_token`.

### Pronto quando
Lembrete automático chega no WhatsApp de teste e a resposta confirma o agendamento; nenhum lembrete sai duplicado; a nota de teste é emitida no ambiente de homologação do provedor.

---

## FASE 8 — Segurança, LGPD, testes e lançamento

**Testes**
- Vitest: horários livres, dinheiro, Pix (o CRC precisa bater com exemplos oficiais), CSV, totais dos relatórios.
- **Isolamento entre empresas:** crie duas empresas e prove, em teste automatizado, que um usuário de uma não lê nem altera nada da outra, e que o contador não lê telefone nem anotações.
- Playwright, fluxo completo: cadastro → onboarding → agendamento pelo link público → concluir com pagamento → fechar mês → exportar relatório.

**Segurança**
- Cabeçalhos de segurança (CSP, HSTS), limite de tentativas nos endpoints públicos, Turnstile, verificação em duas etapas (TOTP do Supabase) opcional para dono e contador.
- Chave secreta só em arquivos `server-only`; webhooks sempre validados; dependências atualizadas (Next.js teve release de segurança em agosto de 2026).

**LGPD**
- Termos de uso, política de privacidade e contrato de tratamento de dados (o Alicerce é operador; o negócio é controlador).
- Encarregado de dados com contato visível.
- Exportação dos dados da empresa e exclusão/anonimização de clientes (`deleted_at` + limpeza dos dados pessoais), preservando registros financeiros pelo prazo que o contador indicar.
- Aviso no campo de anotações: "Não registre informações clínicas aqui." Anotações visíveis só para dono e profissional, com registro de acesso em `audit_logs`.
- Analytics sem cookies ou com banner de consentimento.

**Operação**
- Backups diários do Supabase (plano pago) e recuperação pontual quando a receita permitir.
- Monitoramento de erros (ex.: Sentry) e alertas para falhas de webhook e do cron.

**Checklist de lançamento**
- [ ] Variáveis de produção na Vercel; projeto de produção do Supabase em São Paulo; migrações aplicadas.
- [ ] Chave de produção do Asaas e webhook apontando para o domínio final, com token próprio.
- [ ] Domínio com SSL; domínio de e-mail verificado no Resend (SPF e DKIM).
- [ ] Segredos do cron no Vault; job agendado e testado.
- [ ] Todos os **[EXEMPLO]** substituídos; depoimentos só reais.
- [ ] Textos fiscais revisados por contador; documentos de LGPD revisados por advogado.

---

## CRITÉRIO DE PRONTO GERAL

- [ ] Nenhum gradiente roxo/azul decorativo, ilustração 3D genérica ou foto de banco de imagens.
- [ ] Fraunces nos títulos, Geist no texto, Geist Mono nos números.
- [ ] Verde, dourado e terracota usados só com o significado definido.
- [ ] Toda tela do produto mostrada na página de vendas é componente real em modo demonstração.
- [ ] Toda seção da página de vendas tem movimento real e respeita `prefers-reduced-motion`.
- [ ] Dinheiro sempre em centavos; datas no fuso da empresa.
- [ ] RLS em todas as tabelas, com teste de isolamento passando.
- [ ] Concluir atendimento lança o recebimento; mês fechado fica travado; relatórios exportam em PDF, Excel e CSV.
- [ ] Nenhum texto promete substituir o contador, emitir o recibo do Receita Saúde ou calcular impostos.
- [ ] Lighthouse no celular ≥ 90 na página de vendas.

---

## FONTES DA PESQUISA

Conversão, copy e design:
- [10 SaaS Landing Page Trends for 2026 — SaaSFrame](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [AI Slop Web Design Guide — 925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide)
- [Pricing Page Psychology 2026 — Digital Applied](https://www.digitalapplied.com/blog/subscription-pricing-page-psychology-decision-framework-2026)
- [12 SaaS Design Trends for 2026 — Design Studio UI/UX](https://www.designstudiouiux.com/blog/top-saas-design-trends/)
- [SaaS Hero Section Design — Orbix Studio](https://www.orbix.studio/blogs/saas-hero-section-design)
- [SaaS Hero Section Design — Studio Maydit](https://studiomaydit.com/blog/saas-hero-section-design)
- [Tailwind 4 + Framer Motion + shadcn/ui — BuildMVPFast](https://www.buildmvpfast.com/blog/tailwind-framer-motion-shadcn-ui-indie-saas-design-stack-2026)

Mercado:
- [Vedius](https://vedius.com.br/)
- [Trinks — Planos e Preços](https://negocios.trinks.com/planos/)

Regras fiscais e LGPD:
- [Teto do MEI — gov.br](https://www.gov.br/memp/pt-br/teto-do-mei)
- [Carnê-Leão: deduções — Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/deducoes)
- [Receita Saúde — Asaas](https://blog.asaas.com/receita-saude/)
- [NFS-e Padrão Nacional: prazos — Conta Azul](https://contaazul.com/blog/nfse-padrao-nacional/)
- [NT 008/2026 sobre o DANFSe — CRC-MA](https://crcma.org.br/noticias/nota-tecnica-define-novo-padrao-nacional-do-danfse-e-suspende-api-atual-a-partir-de-julho-de-2026)
- [Orientações da Reforma Tributária para 2026 — Receita Federal](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026)
- [IBS e CBS: campos obrigatórios — Contmatic](https://simplifique.contmatic.com.br/blogs/ibs-cbs-nfe-campos-obrigatorios-agosto-2026)
- [Comparativo de APIs de NFS-e Nacional — Notaas](https://www.notaas.com.br/blog/post/api-nfse-nacional-melhor-provedor-emissao-nota-fiscal-de-servico-eletronica-nacional)
- [LGPD na saúde — Migalhas](https://www.migalhas.com.br/depeso/456531/lgpd-na-saude-prontuario-sigilo-e-direitos-do-paciente)

Tecnologia e integrações:
- [Next.js blog (versões e segurança)](https://nextjs.org/blog)
- [Next.js 16 + Supabase Auth — Supabase](https://supabase.com/docs/guides/getting-started/ai-prompts/nextjs-supabase-auth)
- [Agendar funções com pg_cron e pg_net — Supabase](https://supabase.com/docs/guides/functions/schedule-functions)
- [Limites de cron da Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Asaas: criar assinatura](https://docs.asaas.com/docs/criando-uma-assinatura) · [webhooks](https://docs.asaas.com/docs/sobre-os-webhooks) · [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas) · [sandbox](https://docs.asaas.com/docs/sandbox) · [Pix Automático × assinaturas](https://docs.asaas.com/docs/diferen%C3%A7a-entre-pix-autom%C3%A1tico-e-assinaturas-1)
- [Preços da WhatsApp Business Platform — Meta](https://developers.facebook.com/docs/whatsapp/pricing)
- [CLAUDE.md e memória do projeto — Claude Code](https://code.claude.com/docs/en/memory)
