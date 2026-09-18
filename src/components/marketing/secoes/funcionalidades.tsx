import {
  CalendarClock,
  CalendarOff,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  Link2,
  Paperclip,
  QrCode,
  Receipt,
  Repeat,
  Users,
  Wallet,
} from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils";

type Item = {
  icone: typeof Wallet;
  titulo: string;
  texto: string;
  /** Peso na grade bento: o item grande é o diferencial do grupo. */
  grande?: boolean;
};

const GRUPOS: { nome: string; itens: Item[] }[] = [
  {
    nome: "Agenda",
    itens: [
      {
        icone: Link2,
        titulo: "Link de agendamento próprio",
        texto:
          "alicerce.com.br/agendar/seu-negocio na bio do Instagram. O cliente marca em cinco toques, pelo celular.",
        grande: true,
      },
      {
        icone: Users,
        titulo: "Vários profissionais",
        texto: "Uma coluna por pessoa, arrastar para remarcar.",
      },
      {
        icone: CalendarOff,
        titulo: "Bloqueio de horário",
        texto: "Almoço, médico, folga: some do link na hora.",
      },
      {
        icone: CalendarClock,
        titulo: "Lembrete no WhatsApp",
        texto: "Sai sozinho um dia antes, pela API oficial da Meta. O cliente confirma no botão e a agenda já mostra confirmado.",
      },
    ],
  },
  {
    nome: "Financeiro",
    itens: [
      {
        icone: Wallet,
        titulo: "Entrou, saiu, sobrou",
        texto:
          "Sem termo de contador: o painel fala a sua língua, compara com o mês passado e mostra as maiores despesas.",
        grande: true,
      },
      {
        icone: Gauge,
        titulo: "Termômetro do MEI",
        texto: "Aviso em 70% e 90% do limite de R$ 81.000 por ano.",
      },
      {
        icone: QrCode,
        titulo: "Pix copia e cola",
        texto: "Gerado com a sua chave, direto no recebimento.",
      },
      {
        icone: Paperclip,
        titulo: "Comprovante por foto",
        texto: "Tira a foto do recibo e ele fica no lançamento.",
      },
      {
        icone: Repeat,
        titulo: "Contas que repetem",
        texto: "Aluguel e internet lançados por 12 meses de uma vez.",
      },
    ],
  },
  {
    nome: "Contador",
    itens: [
      {
        icone: FileSpreadsheet,
        titulo: "Fechamento do mês travado",
        texto:
          "Fechou, ninguém mexe: nem você, nem a recepção. Reabrir é possível e fica registrado em auditoria.",
        grande: true,
      },
      {
        icone: FileCheck2,
        titulo: "Livro-Caixa e receitas do MEI",
        texto: "Relatórios por regime, em PDF, Excel e CSV.",
      },
      {
        icone: Receipt,
        titulo: "Controle do Receita Saúde",
        texto: "Lista quais recibos faltam emitir e marca os prontos.",
      },
      {
        icone: Users,
        titulo: "Portal do contador, de graça",
        texto: "Todos os clientes dele num lugar, em qualquer plano.",
      },
    ],
  },
];

export function Funcionalidades() {
  return (
    <section id="funcionalidades" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="flex flex-col gap-12">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            O que você ganha em cada frente
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Nada de lista genérica: cada item aqui resolve um problema que aparece na semana.
          </p>
        </div>

        {GRUPOS.map((grupo) => (
          <div key={grupo.nome} className="flex flex-col gap-4">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {grupo.nome}
            </span>

            <Reveal className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {grupo.itens.map(({ icone: Icone, titulo, texto, grande }) => (
                <div
                  key={titulo}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-lg border border-border p-5 transition-colors",
                    grande
                      ? "bg-primary text-primary-foreground md:col-span-2 lg:row-span-2"
                      : "bg-card hover:border-primary/40",
                  )}
                >
                  <Icone
                    className={cn("size-5", grande ? "text-primary-foreground/80" : "text-primary")}
                    aria-hidden
                  />
                  <h3
                    className={cn(
                      "font-display font-semibold",
                      grande ? "text-2xl" : "text-base",
                    )}
                  >
                    {titulo}
                  </h3>
                  <p
                    className={cn(
                      "text-sm",
                      grande ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {texto}
                  </p>
                </div>
              ))}
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}
