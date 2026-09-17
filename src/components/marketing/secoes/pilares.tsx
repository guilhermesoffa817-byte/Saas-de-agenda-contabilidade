import { CalendarCheck, FileSpreadsheet, Wallet } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";

const PILARES = [
  {
    icone: CalendarCheck,
    titulo: "Agenda inteligente",
    texto:
      "Link próprio de agendamento, confirmação, lembrete no WhatsApp e vários profissionais na mesma tela.",
  },
  {
    icone: Wallet,
    titulo: "Financeiro sem planilha",
    texto:
      "Entrou, saiu, sobrou. Ao concluir o atendimento, o recebimento entra no caixa sem você digitar de novo.",
  },
  {
    icone: FileSpreadsheet,
    titulo: "Pronto para o contador",
    texto:
      "Fechamento do mês em um clique e relatórios em PDF, Excel e CSV no formato que o escritório já usa.",
  },
];

export function Pilares() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Três coisas no lugar, e o negócio para de vazar dinheiro.
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            É o mesmo sistema: a agenda alimenta o financeiro, e o financeiro alimenta o relatório.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {PILARES.map(({ icone: Icone, titulo, texto }) => (
            <div
              key={titulo}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icone className="size-5" aria-hidden />
              </span>
              <h3 className="font-display text-xl font-semibold">{titulo}</h3>
              <p className="text-sm text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
