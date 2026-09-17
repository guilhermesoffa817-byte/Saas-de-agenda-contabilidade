import { ArrowRight, Briefcase, Check, FileSpreadsheet, Lock, Share2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { CtaFinal } from "@/components/marketing/secoes/cta-final";
import { Reveal } from "@/components/marketing/reveal";
import { TelaRelatorio } from "@/components/marketing/telas/tela-relatorio";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Alicerce para contadores — acesso gratuito ao mês fechado do cliente",
  description:
    "Portal com todos os seus clientes, mês fechado e travado, exportação no leiaute do seu sistema e pedido de comprovante por e-mail. Acesso gratuito.",
  alternates: { canonical: "/para-contadores" },
};

const BENEFICIOS = [
  {
    icone: Lock,
    titulo: "Mês fechado é mês travado",
    texto:
      "Depois que o cliente fecha, ninguém altera lançamento daquele período. Reabrir é possível e fica registrado em auditoria, com data e autor.",
  },
  {
    icone: FileSpreadsheet,
    titulo: "Exportação no seu leiaute",
    texto:
      "Você escolhe a ordem das colunas, o separador e o formato de data, e usa o seu plano de contas. Sem formato chutado por nós.",
  },
  {
    icone: Briefcase,
    titulo: "Um lugar para todos os clientes",
    texto:
      "A lista mostra quem já fechou o mês, quem está em aberto e quem tem pendência — sem você precisar cobrar um por um.",
  },
  {
    icone: Share2,
    titulo: "Acesso gratuito, sempre",
    texto:
      "Em todos os planos, sem limite de clientes. E você tem um link de indicação para os clientes que ainda te entregam caderno e planilha.",
  },
];

const PRIVACIDADE = [
  "Você vê lançamentos, fechamentos e relatórios",
  "Você define os códigos do plano de contas",
  "Você não vê telefone nem anotação dos clientes do seu cliente",
  "Toda exportação fica registrada, com autor e data",
];

export default function PaginaParaContadores() {
  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 pt-12 pb-16 lg:grid-cols-[5fr_6fr] lg:items-center lg:pt-20">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
            <Briefcase className="size-3.5" aria-hidden />
            Para escritórios de contabilidade
          </span>

          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
            Seus clientes organizados, sem cobrar comprovante.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground">
            O dono do negócio lança no dia a dia, o mês fecha travado, e você recebe o pacote pronto
            no formato que o seu sistema espera.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/cadastro">
                Criar meu acesso gratuito
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              Gratuito em todos os planos · Sem limite de clientes
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <BrowserFrame url="app.alicerce.com.br/contador">
            <TelaRelatorio />
          </BrowserFrame>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance">
            O que muda no seu fechamento
          </h2>

          <Reveal className="grid gap-4 md:grid-cols-2">
            {BENEFICIOS.map(({ icone: Icone, titulo, texto }) => (
              <div key={titulo} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
                <Icone className="size-5 text-primary" aria-hidden />
                <h3 className="font-display text-lg font-semibold">{titulo}</h3>
                <p className="text-sm text-muted-foreground">{texto}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            O que o seu acesso mostra — e o que não mostra
          </h2>
          <ul className="flex flex-col gap-2.5">
            {PRIVACIDADE.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            É a minimização de dados que a LGPD pede: você recebe o que precisa para fechar o mês, e
            nada além disso.
          </p>
        </div>
      </section>

      <CtaFinal />
    </>
  );
}
