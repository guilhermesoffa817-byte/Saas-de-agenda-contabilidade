import type { Metadata } from "next";
import Link from "next/link";

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
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Alicerce
        </Link>
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
          Encarregado de dados (DPO): <strong>[EXEMPLO: privacidade@alicerce.com.br]</strong>.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Este texto precisa de revisão por advogado antes do lançamento e os trechos marcados como
        [EXEMPLO] precisam ser preenchidos com os dados reais da empresa.
      </p>
    </main>
  );
}
