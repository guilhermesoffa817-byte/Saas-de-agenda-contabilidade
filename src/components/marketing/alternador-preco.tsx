"use client";

/**
 * Mensal ou anual. O botão inteiro é um `switch`, e o pino desliza com
 * transição de CSS — não vale carregar um motor de animação por causa dele.
 */
export function AlternadorPreco({
  anual,
  onChange,
}: {
  anual: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={anual}
        aria-label="Cobrança anual"
        onClick={() => onChange(!anual)}
        className="relative grid h-10 w-48 grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-primary motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          style={{ transform: anual ? "translateX(100%)" : "translateX(0%)" }}
        />
        <span className={`relative z-10 self-center ${anual ? "" : "text-primary-foreground"}`}>
          Mensal
        </span>
        <span className={`relative z-10 self-center ${anual ? "text-primary-foreground" : ""}`}>
          Anual
        </span>
      </button>
      <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
        2 meses grátis
      </span>
    </div>
  );
}
