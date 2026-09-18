# Lançamento do Alicerce

O que precisa estar pronto antes de abrir para o primeiro cliente pagante, e o
que já está conferido no código.

## Antes de abrir

### Infraestrutura
- [ ] Projeto de produção do Supabase criado na região **South America (São Paulo)**.
- [ ] Migrações aplicadas em produção: `npx supabase db push`.
- [ ] Tipos regerados a partir do projeto real: `npm run db:types`.
- [ ] Backups diários ligados (plano pago do Supabase). Recuperação pontual quando a receita permitir.
- [ ] Variáveis de ambiente na Vercel, copiadas de `.env.example`. `SUPABASE_SECRET_KEY` **nunca** com prefixo `NEXT_PUBLIC`.
- [ ] Domínio com SSL apontando para a Vercel.

### Cobrança (Asaas)
- [ ] Chave de **produção** em `ASAAS_API_KEY` e `ASAAS_ENV=production`.
- [ ] Webhook apontando para `https://<dominio>/api/webhooks/asaas`, com `ASAAS_WEBHOOK_TOKEN` próprio (diferente da chave da API).
- [ ] Uma cobrança de teste percorrida de ponta a ponta no sandbox antes de virar a chave.

### E-mail (Resend)
- [ ] Domínio verificado, com SPF e DKIM publicados.
- [ ] `RESEND_FROM` no formato `Alicerce <nao-responda@seudominio.com.br>`.

### Lembretes (WhatsApp Cloud API)
- [ ] App da Meta criado, número ligado, `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` preenchidos.
- [ ] Modelo de utilidade `lembrete_agendamento` aprovado em `pt_BR`, com quatro variáveis na ordem (nome, serviço, data, hora) e os botões "Confirmar" e "Remarcar".
- [ ] Webhook em `https://<dominio>/api/webhooks/whatsapp`, com `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`.
- [ ] Extensões `pg_cron` e `pg_net` habilitadas no Supabase.
- [ ] Segredos no Vault (`app_url` e `cron_secret`) criados **à mão** no SQL Editor, nunca em migração.
- [ ] Job `lembretes-whatsapp` agendado e testado com um agendamento de verdade a 23h30 do horário.
- [ ] Tabela de preços da Meta conferida antes de definir as franquias em `src/lib/planos.ts` (os preços só mudam no primeiro dia de cada trimestre).

### NFS-e (plano Negócio)
- [ ] Provedor contratado e comparado (Focus NFe, PlugNotas/Tecnospeed, Nuvem Fiscal, Notaas): preço, cobertura de municípios, webhooks e suporte ao padrão nacional.
- [ ] `NFSE_PROVIDER`, `NFSE_API_KEY`, `NFSE_WEBHOOK_TOKEN` preenchidos; começar com `NFSE_ENV=homologacao`.
- [ ] Certificado digital da empresa enviado ao provedor, quando ele exigir.
- [ ] **Nota de teste emitida em homologação** antes de ligar em produção.
- [ ] Cronograma comunicado: MEI já obrigado ao padrão nacional; ME/EPP do Simples a partir de 01/11/2026.

### Conteúdo e documentos
- [ ] Todos os `[EXEMPLO]` trocados. Hoje eles estão em: `src/lib/contato.ts`, `src/components/marketing/rodape.tsx`, `src/app/(marketing)/termos/page.tsx`, `src/app/(marketing)/privacidade/page.tsx` e os valores dos planos em `src/lib/planos.ts`.
- [ ] Depoimentos: só de cliente real, com autorização por escrito. O lugar deles está marcado no código com `{/* SUBSTITUIR POR DEPOIMENTO REAL */}` — publicar vazio é melhor que publicar inventado.
- [ ] Textos fiscais revisados por contador (`src/lib/fiscal/constantes.ts`, com fonte e data de cada valor).
- [ ] Termos de uso, política de privacidade e contrato de tratamento de dados revisados por advogado.
- [ ] Encarregado de dados (DPO) definido, com e-mail que alguém lê.

### Monitoramento
- [ ] Erros em produção (Sentry ou equivalente).
- [ ] Alerta para falha de webhook (Asaas, Meta, NFS-e) e para o cron dos lembretes parar de rodar.

## Já conferido no código

Cada linha abaixo tem teste automatizado ou verificação registrada.

### Dinheiro e datas
- [x] Dinheiro só em centavos inteiros (`*_cents bigint`), formatado na tela com Intl pt-BR/BRL. Nunca ponto flutuante.
- [x] Datas gravadas em `timestamptz` e exibidas no fuso da empresa (`organizations.timezone`).
- [x] Concluir atendimento lança o recebimento com a competência certa no fuso da empresa.

### Isolamento e permissões
- [x] RLS ativa em toda tabela com dado de empresa.
- [x] Duas empresas: nenhuma lê nem altera nada da outra (`tests/db/seguranca.test.ts`).
- [x] O contador não lê telefone, e-mail nem anotações — só a visão com nome, CPF e tipo de pagador.
- [x] Recepção não vê relatório; profissional não vê financeiro.
- [x] Convite só é aceito pelo e-mail convidado, e convite vencido não vale.
- [x] Chave secreta do Supabase só em arquivos com `import "server-only"`.

### Agenda e financeiro
- [x] Dois atendimentos no mesmo horário do mesmo profissional são impossíveis (restrição de exclusão no banco, erro `23P01`).
- [x] Mês fechado trava edição; reabrir fica registrado em auditoria.
- [x] Relatórios saem em PDF, Excel e CSV, com os valores conferidos lendo o arquivo gerado de volta.
- [x] Pix copia e cola com CRC conferido contra exemplos oficiais.

### Integrações
- [x] Lembrete duplicado é impossível: a reserva acontece antes do envio, num `update ... returning`.
- [x] Webhook da Meta confere a assinatura `X-Hub-Signature-256` em tempo constante.
- [x] Webhook do Asaas e o da NFS-e recusam quem não traz o token combinado e são idempotentes.
- [x] O link da agenda no celular é sorteado, não pode ser escolhido na mão e só o dono troca.

### Segurança
- [x] CSP com nonce por requisição nas rotas dinâmicas (sistema, conta, portal do contador), sem `unsafe-inline` em script. Conferido no navegador: zero violação.
- [x] HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy` em toda resposta.
- [x] Limite de tentativas por e-mail e por IP em entrar, cadastrar e recuperar senha — com resposta igual para e-mail que existe e que não existe.
- [x] Verificação em duas etapas (TOTP) disponível para dono e contador.
- [x] `npm audit`: 0 vulnerabilidades.

### LGPD
- [x] Papéis de controlador e operador escritos na política, com a lista de suboperadores e o que vai para cada um.
- [x] Portabilidade: o dono baixa a empresa inteira em JSON (Configurações → Seus dados).
- [x] Direito de eliminação: apagar os dados pessoais do cliente preservando o registro financeiro, com o ato registrado em auditoria.
- [x] Quem abre a anotação de um cliente fica registrado.
- [x] Aviso no campo de anotações: não é prontuário, não registre dado de saúde.
- [x] Sem cookie de analytics e sem rastreador de terceiros.

### Página de vendas
- [x] Sem gradiente roxo/azul decorativo, sem ilustração 3D genérica, sem foto de banco de imagens.
- [x] Fraunces nos títulos, Geist no texto, Geist Mono nos números.
- [x] Toda tela do produto mostrada é o componente real, em modo demonstração, com dados brasileiros coerentes.
- [x] Toda seção tem movimento, e `prefers-reduced-motion` desliga tudo (verificado no navegador).
- [x] Uma só chamada principal, acessibilidade 100, SEO 100, sem rolagem lateral em 375px.
- [x] Nenhum texto promete substituir o contador, emitir o recibo do Receita Saúde nem calcular imposto.

## O que ainda não dá para verificar aqui

Depende de conta de terceiro e fica para o dia da configuração:

- Envio real de lembrete pela Meta e clique no botão "Confirmar" chegando pelo webhook.
- Emissão de nota em homologação do provedor de NFS-e.
- Cobrança de verdade no Asaas e o webhook dela.
- E-mail saindo pelo Resend com SPF e DKIM.
- O teste ponta a ponta do fluxo completo (`e2e/fluxo-completo.spec.ts`) — ele se pula sozinho sem as chaves do Supabase e roda inteiro assim que elas existirem.

## Nota sobre o Lighthouse

A especificação pede nota ≥ 90 no celular para a página de vendas. Medido dentro
do contêiner de desenvolvimento, o resultado é:

| Como foi medido | Desempenho | LCP |
| --- | --- | --- |
| Lighthouse padrão (4G simulado + CPU 4×) | 77 | 3,9 s |
| Lighthouse sem simulação de rede/CPU | 98 | 0,2 s |
| Rolagem real com 4G e CPU 4× de verdade, medindo o LCP no navegador | — | 1,26 s |

Acessibilidade 100, Boas práticas 96 e SEO 100 em qualquer um dos modos.

O LCP real sob a mesma lentidão que o Lighthouse simula é **1,26 s** — dentro do
"bom" (< 2,5 s). A diferença vem do estimador do Lighthouse, que parte de um
traço sem freio e extrapola; num contêiner compartilhado e já lento, essa
extrapolação infla. **Meça de novo depois do primeiro deploy na Vercel**, com
PageSpeed Insights no domínio de verdade, antes de dar o item por fechado.

O que foi feito de verdade para o peso da página, e vale em produção também:
o JavaScript da página inicial caiu de 536 KB para 378 KB, o tempo de bloqueio
caiu de 740 ms para 400 ms e o Speed Index de 2,4 s para 1,6 s. O gráfico
(Recharts) e o tour (GSAP) só são baixados quando a pessoa chega perto deles, e
a entrada do topo é animação de CSS — o maior elemento da dobra não espera
JavaScript para aparecer.
