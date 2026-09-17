"use client";

import { Input } from "@/components/ui/input";
import { digitosParaCentavos, formatarValor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Campo de valor no estilo app de banco: a pessoa digita só números e o valor
 * preenche da direita. Guarda sempre centavos inteiros.
 */
export function CampoDinheiro({
  valor,
  onChange,
  className,
  id,
  "aria-label": rotulo,
}: {
  valor: number;
  onChange: (centavos: number) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        id={id}
        aria-label={rotulo}
        inputMode="numeric"
        className={cn("pl-9 font-mono tabular", className)}
        value={formatarValor(valor)}
        onChange={(evento) => onChange(digitosParaCentavos(evento.target.value))}
      />
    </div>
  );
}
