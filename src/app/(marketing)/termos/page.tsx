import type { Metadata } from "next";
import { CONTATO, IDENTIDADE, rotuloDoDocumento } from "@/lib/contato";

export const metadata: Metadata = {
  title: "Termos de uso — Alicerce",
  description: "Condições de uso do Alicerce: o que o sistema faz, o que não faz e como é a cobrança.",
};

/** Texto de referência para revisão jurídica (FASE 8). Trocar tudo marcado como [EXEMPLO]. */
export default function PaginaTermos() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Termos de uso</h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: setembro de 2026 · Versão para revisão jurídica
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">O que o Alicerce faz</h2>
        <p className="text-sm leading-relaxed">
          O Alicerce é um sistema de agenda e controle financeiro para autônomos e pequenos negócios.
          Ele organiza atendimentos, registra o que entra e o que sai e prepara relatórios para o seu
          contador.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">O que o Alicerce não faz</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>Não substitui o contador nem presta serviço de contabilidade.</li>
          <li>Não calcula impostos por conta própria.</li>
          <li>Não é prontuário eletrônico.</li>
          <li>Não emite o recibo do Receita Saúde, que é feito nos canais da Receita Federal.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Assinatura e cobrança</h2>
        <p className="text-sm leading-relaxed">
          O teste grátis dura 7 dias e não pede cartão de crédito. Depois disso, a assinatura é
          cobrada conforme o plano escolhido e pode ser cancelada a qualquer momento, sem multa. O
          valor pago no período já iniciado não é devolvido <strong>[EXEMPLO]</strong>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Responsabilidades de quem usa</h2>
        <p className="text-sm leading-relaxed">
          Você é responsável pela veracidade dos dados que lança no sistema, por manter sua senha em
          segredo e por obter o consentimento dos seus clientes antes de enviar lembretes.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Contato</h2>
        <p className="text-sm leading-relaxed">
          O Alicerce é oferecido por <strong>{IDENTIDADE.nome}</strong>,{" "}
          {rotuloDoDocumento()} <strong>{IDENTIDADE.documento}</strong>, com contato em{" "}
          <a className="underline underline-offset-4" href={`mailto:${CONTATO}`}>
            {CONTATO}
          </a>
          .
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Este texto precisa de revisão por advogado antes do lançamento.
      </p>
    </main>
  );
}
