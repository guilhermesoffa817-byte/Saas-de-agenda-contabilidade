import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-20 text-center">
        <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          Comece hoje e chegue no fim do mês sem susto.
        </h2>
        <p className="max-w-xl text-lg text-primary-foreground/80">
          Em poucos minutos sua agenda está no ar e o seu contador já tem por onde começar.
        </p>
        <Button asChild size="lg" variant="secondary" className="text-base">
          <Link href="/cadastro">
            Testar 7 dias grátis
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <span className="text-xs text-primary-foreground/70">
          Sem cartão de crédito · Seus dados são seus, e você exporta quando quiser
        </span>
      </div>
    </section>
  );
}
