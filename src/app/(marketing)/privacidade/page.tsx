import type { Metadata } from "next";
import { ENCARREGADO_DE_DADOS, IDENTIDADE, rotuloDoDocumento } from "@/lib/contato";

export const metadata: Metadata = {
  title: "Política de privacidade — Alicerce",
  description:
    "Como o Alicerce trata dados pessoais: papéis de controlador e operador, base legal, retenção e direitos do titular.",
};

/**
 * Texto de referência, escrito para ser revisado por advogado antes do lançamento
 * (veja a FASE 8 da especificação). Tudo marcado como [EXEMPLO] precisa ser trocado.
 */
export default function PaginaPrivacidade() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Política de privacidade</h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: setembro de 2026 · Versão para revisão jurídica
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Quem é responsável pelos dados</h2>
        <p className="text-sm leading-relaxed">
          O negócio que usa o Alicerce (o salão, a clínica, o consultório) é o{" "}
          <strong>controlador</strong> dos dados dos clientes dele: é quem decide coletar nome,
          telefone e histórico de atendimentos. O Alicerce é <strong>operador</strong>: trata esses
          dados seguindo as instruções do negócio, para fazer a agenda e o controle financeiro
          funcionarem.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Quais dados são tratados</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>De quem usa o sistema:</strong> nome, e-mail e senha (guardada com algoritmo de
            hash pelo provedor de autenticação).
          </li>
          <li>
            <strong>Do negócio:</strong> razão social ou nome, CPF ou CNPJ, cidade, regime de
            tributação e chave Pix.
          </li>
          <li>
            <strong>Dos clientes do negócio:</strong> nome, WhatsApp, e-mail e CPF quando informados,
            histórico de atendimentos e anotações administrativas.
          </li>
          <li>
            <strong>Do agendamento online:</strong> registro da tentativa (endereço IP em forma
            embaralhada e telefone) para conter abuso.
          </li>
        </ul>
        <p className="text-sm leading-relaxed">
          O Alicerce <strong>não é prontuário eletrônico</strong> e não deve receber dados de saúde.
          Anotações clínicas ficam no sistema próprio do profissional.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Lembretes pelo WhatsApp</h2>
        <p className="text-sm leading-relaxed">
          O lembrete só é enviado para quem autorizou. A autorização é registrada com data e hora e
          pode ser retirada a qualquer momento, pedindo ao negócio ou respondendo à mensagem.
        </p>
        <p className="text-sm leading-relaxed">
          O envio é feito pela plataforma oficial da Meta (WhatsApp Business Platform). Para isso,
          nome do cliente, telefone, serviço, data e hora do atendimento são transmitidos à Meta. O
          Alicerce guarda o registro de cada envio — para quem, qual modelo, quando e se foi entregue
          — por 12 meses, para auditoria e para a contagem da franquia do plano.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Quem mais trata esses dados</h2>
        <p className="text-sm leading-relaxed">
          O Alicerce se apoia em fornecedores, todos como suboperadores, e só manda a cada um o que
          ele precisa para funcionar:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Supabase:</strong> banco de dados, autenticação e arquivos.
          </li>
          <li>
            <strong>Meta (WhatsApp Business Platform):</strong> envio dos lembretes, quando o negócio
            liga essa função.
          </li>
          <li>
            <strong>Resend:</strong> e-mails do sistema (convite, recuperação de senha, pacote do mês
            para o contador).
          </li>
          <li>
            <strong>Asaas:</strong> cobrança da assinatura do próprio Alicerce. Os clientes do negócio
            não passam por lá.
          </li>
          <li>
            <strong>Provedor de NFS-e:</strong> só no plano Negócio e só quando o negócio pede a
            emissão. Vão o valor, a descrição do serviço, os códigos de tributação que o contador
            configurou e, quando informados, nome e documento do tomador.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Seus direitos e como exercer</h2>
        <p className="text-sm leading-relaxed">
          O titular pode pedir confirmação do tratamento, acesso, correção, portabilidade,
          eliminação e informação sobre com quem os dados foram compartilhados. O pedido vai ao
          negócio que atende essa pessoa, que é o controlador; o Alicerce dá as ferramentas para ele
          responder:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Levar tudo embora:</strong> em Configurações → Seus dados, o dono baixa a empresa
            inteira num arquivo JSON — agenda, clientes, serviços, lançamentos, fechamentos, notas e
            registros de envio.
          </li>
          <li>
            <strong>Apagar os dados de um cliente:</strong> na tela de Clientes, o dono apaga nome,
            telefone, e-mail, CPF e anotações, e retira a autorização de lembrete. Os atendimentos e
            os lançamentos continuam sem identificar a pessoa, porque o registro financeiro precisa
            ser guardado pelo prazo que a lei e o contador indicarem.
          </li>
          <li>
            <strong>Retirar a autorização do WhatsApp:</strong> a qualquer momento, pedindo ao
            negócio ou respondendo à mensagem.
          </li>
        </ul>
        <p className="text-sm leading-relaxed">
          Cada abertura de anotação de cliente fica registrada com quem abriu e quando, junto das
          exportações e das reaberturas de mês.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Agenda no celular</h2>
        <p className="text-sm leading-relaxed">
          O profissional pode assinar a própria agenda no calendário do celular por um endereço
          secreto. Quem tiver esse endereço enxerga os atendimentos daquele profissional, sem senha —
          por isso o link nunca aparece em página pública e o dono pode trocá-lo quando quiser, o que
          derruba o anterior na hora. O arquivo leva serviço, cliente, data e hora, e não leva
          telefone nem anotações.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Segurança e acesso</h2>
        <p className="text-sm leading-relaxed">
          Cada pessoa da equipe tem senha própria e um papel que limita o que ela vê: a recepção não
          enxerga relatórios, o profissional não enxerga o financeiro e o contador não enxerga
          telefone nem anotações dos clientes. O banco de dados aplica essas regras por empresa, linha
          por linha, e registra em log as exportações e as reaberturas de mês.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Onde os dados ficam</h2>
        <p className="text-sm leading-relaxed">
          Os dados ficam em servidores na região de São Paulo, no Brasil. Serviços de terceiros usados
          para operar o sistema (envio de e-mail, cobrança da assinatura, proteção contra robôs)
          recebem apenas o mínimo necessário.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Por quanto tempo</h2>
        <p className="text-sm leading-relaxed">
          Lançamentos e comprovantes ficam guardados pelo prazo exigido pela legislação fiscal
          <strong> [EXEMPLO: 5 anos]</strong>. Registros de tentativas de agendamento são apagados em
          7 dias. Encerrada a conta, os dados são excluídos ou devolvidos em até{" "}
          <strong>[EXEMPLO: 30 dias]</strong>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Seus direitos</h2>
        <p className="text-sm leading-relaxed">
          Você pode pedir confirmação de tratamento, acesso, correção, portabilidade e exclusão dos
          seus dados. Se você é cliente de um negócio que usa o Alicerce, o pedido deve ir primeiro ao
          negócio, que é o controlador. O Alicerce ajuda o negócio a responder.
        </p>
        <p className="text-sm leading-relaxed">
          O Alicerce é operado por <strong>{IDENTIDADE.nome}</strong>, {rotuloDoDocumento()}{" "}
          <strong>{IDENTIDADE.documento}</strong>. Encarregado de dados (DPO):{" "}
          <strong>{ENCARREGADO_DE_DADOS}</strong>.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Este texto precisa de revisão por advogado antes do lançamento e os trechos marcados como
        [EXEMPLO] precisam ser preenchidos com os seus dados reais (em `src/lib/contato.ts`).
      </p>
    </main>
  );
}
