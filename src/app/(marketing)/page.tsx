import { CalendarCheck, FileSpreadsheet, Wallet } from "lucide-react";

import { AlternarTema } from "@/components/app/alternar-tema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const pilares = [
  {
    icone: CalendarCheck,
    titulo: "Agenda",
    texto:
      "Link de agendamento próprio, confirmação e lembrete no WhatsApp, vários profissionais na mesma tela.",
  },
  {
    icone: Wallet,
    titulo: "Financeiro do dono",
    texto:
      "Entrou, saiu, sobrou. O atendimento concluído virou recebimento — sem digitar duas vezes, sem planilha.",
  },
  {
    icone: FileSpreadsheet,
    titulo: "Ponte com o contador",
    texto:
      "Fechamento do mês em um clique e relatórios em PDF, Excel e CSV no formato que o escritório já usa.",
  },
];

const tokens = [
  { nome: "Verde institucional", uso: "ação principal e dinheiro entrando", classe: "bg-primary" },
  { nome: "Dourado", uso: "selo e destaque, sempre em área pequena", classe: "bg-gold" },
  { nome: "Terracota", uso: "alerta e valor negativo", classe: "bg-destructive" },
  { nome: "Papel", uso: "fundo das telas claras", classe: "bg-background border border-border" },
];

export default function PaginaInicial() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-16 px-6 py-14">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <span className="font-display text-xl font-semibold tracking-tight">Alicerce</span>
        <AlternarTema />
      </header>

      <section className="flex flex-col gap-6">
        <Badge
          variant="outline"
          className="w-fit border-gold text-gold-ink dark:text-gold-ink"
        >
          Fase 0 concluída — base do projeto e design system
        </Badge>
        <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          Agenda e financeiro do seu negócio no mesmo lugar.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          O Alicerce junta o que hoje está espalhado entre caderno, planilha e WhatsApp: a agenda dos
          atendimentos, o dinheiro que entra e sai, e o relatório que o seu contador pede todo mês.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          As telas do sistema entram nas próximas fases. O Alicerce não substitui o contador, não
          calcula impostos por conta própria e não é prontuário eletrônico.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {pilares.map(({ icone: Icone, titulo, texto }) => (
          <Card key={titulo} className="border-border/80">
            <CardHeader>
              <Icone className="size-6 text-primary" aria-hidden />
              <CardTitle className="font-display text-xl">{titulo}</CardTitle>
              <CardDescription>{texto}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Separator />

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold tracking-tight">Design system em uso</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cor com significado</CardTitle>
              <CardDescription>Cada cor tem um papel fixo e não é trocado.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tokens.map(({ nome, uso, classe }) => (
                <div key={nome} className="flex items-center gap-3">
                  <span className={`size-8 shrink-0 rounded-md ${classe}`} aria-hidden />
                  <span className="text-sm">
                    <span className="font-medium">{nome}</span>
                    <span className="text-muted-foreground"> — {uso}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Número financeiro alinhado</CardTitle>
              <CardDescription>
                Geist Mono com algarismos tabulares: as colunas não dançam de linha em linha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 font-mono text-sm tabular">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-sans text-muted-foreground">Entrou em agosto</dt>
                  <dd className="text-success">R$ 18.430,00</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-sans text-muted-foreground">Saiu em agosto</dt>
                  <dd className="text-destructive">R$ 7.112,45</dd>
                </div>
                <Separator />
                <div className="flex items-baseline justify-between gap-4 text-base">
                  <dt className="font-sans font-medium">Sobrou</dt>
                  <dd className="font-medium">R$ 11.317,55</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
