import { ArrowRight, Bean, Dumbbell, Flower2, HeartPulse, Scissors, Stethoscope } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/marketing/reveal";

const SEGMENTOS = [
  {
    icone: Scissors,
    nome: "Salões de beleza",
    texto: "Agenda por profissional, comissão organizada e cliente que confirma sozinho.",
    href: "/para-saloes",
  },
  {
    icone: Bean,
    nome: "Barbearias",
    texto: "Encaixe rápido, corte + barba no mesmo horário e fila do sábado sob controle.",
    href: "/para-saloes",
  },
  {
    icone: Stethoscope,
    nome: "Clínicas",
    texto: "Vários profissionais, sala e retorno no lugar certo, sem prontuário misturado.",
    href: "/para-clinicas",
  },
  {
    icone: HeartPulse,
    nome: "Consultórios",
    texto: "Livro-Caixa do Carnê-Leão e controle dos recibos do Receita Saúde.",
    href: "/para-clinicas",
  },
  {
    icone: Dumbbell,
    nome: "Personal trainers",
    texto: "Treino individual ou em dupla, pacote mensal e recebimento em dia.",
    href: "/para-personal",
  },
  {
    icone: Flower2,
    nome: "Terapeutas",
    texto: "Sessões com duração própria, lembrete gentil e financeiro simples.",
    href: "/para-personal",
  },
];

export function ParaQuem() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Feito para quem atende com hora marcada
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Escolha o seu caso e veja como fica o dia a dia.
          </p>
        </div>

        <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEGMENTOS.map(({ icone: Icone, nome, texto, href }) => (
            <Link
              key={nome}
              href={href}
              className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-black/5"
            >
              <Icone className="size-5 text-primary" aria-hidden />
              <span className="font-display text-lg font-semibold">{nome}</span>
              <span className="text-sm text-muted-foreground">{texto}</span>
              <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-medium text-primary">
                Ver detalhes
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
