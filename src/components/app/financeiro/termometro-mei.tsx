import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALERTAS_LIMITE_MEI } from "@/lib/fiscal/constantes";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Termômetro do limite do MEI. Os alertas em 70% e 90% vêm de
 * src/lib/fiscal/constantes.ts, que é o único lugar com valores legais.
 */
export function TermometroMEI({
  ano,
  recebidoCents,
  limiteCents,
  proporcional,
}: {
  ano: number;
  recebidoCents: number;
  limiteCents: number;
  proporcional: boolean;
}) {
  const fracao = limiteCents > 0 ? recebidoCents / limiteCents : 0;
  const percentual = Math.min(fracao, 1);
  const [aviso, alerta] = ALERTAS_LIMITE_MEI;

  const nivel = fracao >= alerta ? "critico" : fracao >= aviso ? "atencao" : "tranquilo";
  const Icone = nivel === "critico" ? CircleAlert : nivel === "atencao" ? AlertTriangle : CheckCircle2;

  const mensagem =
    nivel === "critico"
      ? "Você passou de 90% do limite. Fale com seu contador agora: passar do teto obriga a mudar de regime."
      : nivel === "atencao"
        ? "Você já passou de 70% do limite do ano. Vale conversar com seu contador."
        : "Dentro do limite do ano.";

  const cor =
    nivel === "critico" ? "bg-destructive" : nivel === "atencao" ? "bg-warning" : "bg-success";
  const tinta =
    nivel === "critico" ? "text-destructive" : nivel === "atencao" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardDescription>Limite do MEI em {ano}</CardDescription>
        <CardTitle className="text-base">
          {formatarBRL(recebidoCents)}{" "}
          <span className="font-normal text-muted-foreground">de {formatarBRL(limiteCents)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width]", cor)}
            style={{ width: `${percentual * 100}%` }}
            role="meter"
            aria-valuenow={Math.round(percentual * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Percentual do limite do MEI já usado"
          />
          {/* Marcas dos alertas: o número aparece junto da cor, nunca só a cor. */}
          {[aviso, alerta].map((marca) => (
            <span
              key={marca}
              className="absolute top-0 h-full w-px bg-foreground/30"
              style={{ left: `${marca * 100}%` }}
              aria-hidden
            />
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular text-muted-foreground">
          <span>0</span>
          <span>70%</span>
          <span>90%</span>
          <span>100%</span>
        </div>

        <p className={cn("flex items-start gap-2 text-sm", tinta)}>
          <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {mensagem}
            {proporcional ? (
              <span className="block text-muted-foreground">
                Limite proporcional aos meses de atividade no ano de abertura.
              </span>
            ) : null}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
