import { Check, Minus } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils";

const LINHAS: { recurso: string; alicerce: boolean; caderno: boolean; agenda: boolean }[] = [
  { recurso: "Agendamento online por link", alicerce: true, caderno: false, agenda: true },
  { recurso: "Lembrete no WhatsApp", alicerce: true, caderno: false, agenda: true },
  { recurso: "Controle de caixa do dono", alicerce: true, caderno: true, agenda: false },
  { recurso: "Recebimento automático ao concluir", alicerce: true, caderno: false, agenda: false },
  { recurso: "Fechamento do mês", alicerce: true, caderno: false, agenda: false },
  { recurso: "Relatório pronto para o contador", alicerce: true, caderno: false, agenda: false },
  { recurso: "Portal do contador", alicerce: true, caderno: false, agenda: false },
  { recurso: "Suporte em português", alicerce: true, caderno: false, agenda: true },
];

function Marca({ tem, destaque }: { tem: boolean; destaque?: boolean }) {
  return tem ? (
    <Check
      className={cn("mx-auto size-5", destaque ? "text-primary" : "text-success")}
      aria-label="Tem"
    />
  ) : (
    <Minus className="mx-auto size-5 text-destructive/70" aria-label="Não tem" />
  );
}

export function Comparativo() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-20">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Por que não continuar como está
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Caderno e planilha dão conta de uma parte. Agenda genérica dá conta de outra. Falta quem
            junte as duas com o contador.
          </p>
        </div>

        <Reveal>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <caption className="sr-only">
                Comparação entre o Alicerce, caderno com planilha e sistemas de agenda genéricos
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    O que você precisa
                  </th>
                  <th scope="col" className="bg-muted px-4 py-3 text-center font-medium">
                    Alicerce
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Caderno + planilha
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Agenda genérica
                  </th>
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((linha) => (
                  <tr key={linha.recurso} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {linha.recurso}
                    </th>
                    <td className="bg-muted px-4 py-3">
                      <Marca tem={linha.alicerce} destaque />
                    </td>
                    <td className="px-4 py-3">
                      <Marca tem={linha.caderno} />
                    </td>
                    <td className="px-4 py-3">
                      <Marca tem={linha.agenda} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="text-xs text-muted-foreground">
          Comparação feita com o que cada alternativa entrega ao dono do negócio, não com nomes de
          concorrentes.
        </p>
      </div>
    </section>
  );
}
