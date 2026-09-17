import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

function Comparacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) {
    return <span className="text-xs text-muted-foreground">Sem base do mês anterior</span>;
  }

  const variacao = (atual - anterior) / Math.abs(anterior);
  const percentual = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Math.abs(variacao));

  const igual = Math.abs(variacao) < 0.005;
  const Icone = igual ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icone className="size-3.5" aria-hidden />
      {igual ? "igual ao mês anterior" : `${percentual} ${variacao > 0 ? "a mais" : "a menos"} que no mês anterior`}
    </span>
  );
}

/**
 * "Entrou, saiu, sobrou" — a linguagem que o dono do negócio usa.
 * Os números são o assunto da tela, então ganham o maior tamanho.
 */
export function CartoesDeResumo({
  atual,
  anterior,
}: {
  atual: { entrouCents: number; saiuCents: number; sobrouCents: number };
  anterior: { entrouCents: number; saiuCents: number; sobrouCents: number };
}) {
  const cartoes = [
    {
      titulo: "Entrou",
      descricao: "Recebido no mês",
      valor: atual.entrouCents,
      base: anterior.entrouCents,
      classe: "text-success",
    },
    {
      titulo: "Saiu",
      descricao: "Pago no mês",
      valor: atual.saiuCents,
      base: anterior.saiuCents,
      classe: "text-destructive",
    },
    {
      titulo: "Sobrou",
      descricao: "O que ficou no caixa",
      valor: atual.sobrouCents,
      base: anterior.sobrouCents,
      classe: atual.sobrouCents < 0 ? "text-destructive" : "",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cartoes.map((cartao) => (
        <Card key={cartao.titulo} className={cartao.titulo === "Sobrou" ? "border-primary/40" : ""}>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm font-medium">{cartao.titulo}</CardTitle>
            <CardDescription>{cartao.descricao}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className={cn("font-mono text-3xl tabular", cartao.classe)}>
              {formatarBRL(cartao.valor)}
            </span>
            <Comparacao atual={cartao.valor} anterior={cartao.base} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
