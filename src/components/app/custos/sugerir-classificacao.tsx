"use client";

import { Lightbulb, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { sugerirClassificacao } from "@/app/(app)/app/financeiro/custos/acoes";
import { Button } from "@/components/ui/button";
import type { CotaDeIa } from "@/lib/ia/cota";

export function SugerirClassificacao({
  mes,
  pendentes,
  iaConfigurada,
  cota,
  podeAlterar,
}: {
  mes: string;
  /** Despesas do mês sem classificação. */
  pendentes: number;
  iaConfigurada: boolean;
  cota: CotaDeIa | null;
  podeAlterar: boolean;
}) {
  const [rodando, iniciar] = useTransition();

  function sugerir() {
    iniciar(async () => {
      const resposta = await sugerirClassificacao(mes);
      if (resposta.erro) toast.error(resposta.erro);
      else toast.success(resposta.aviso ?? "Classificação sugerida.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={sugerir} disabled={rodando || pendentes === 0 || !podeAlterar}>
          {rodando ? <Loader2 className="animate-spin" aria-hidden /> : <Lightbulb aria-hidden />}
          {rodando ? "Classificando…" : "Sugerir classificação"}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {pendentes === 0
            ? "Todas as despesas do mês já estão classificadas."
            : pendentes === 1
              ? "1 despesa sem classificação."
              : `${pendentes} despesas sem classificação.`}
        </span>
      </div>

      {iaConfigurada ? (
        <>
          {cota ? (
            <p className="text-xs text-muted-foreground">
              Franquia de IA do mês:{" "}
              <span className="font-mono tabular">
                {cota.usados} de {cota.limite}
              </span>{" "}
              despesas classificadas. As regras automáticas não contam na franquia.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Primeiro valem as regras automáticas (aluguel, comissão, juros e outras). O que sobrar
            vai para a IA Claude, da Anthropic, com processamento fora do Brasil: só a descrição sem
            CPF, telefone ou e-mail, a categoria, o valor e a forma de pagamento. A IA só sugere;
            você confirma ou corrige na tabela.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          A IA não está configurada nesta instalação: o botão aplica só as regras automáticas
          (aluguel, comissão, juros e outras). O que elas não resolverem, classifique na tabela.
        </p>
      )}
    </div>
  );
}
