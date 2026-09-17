"use client";

import { GradeDoDia } from "@/components/app/agenda/grade-dia";
import {
  EMPRESA_DEMO,
  PROFISSIONAIS_DEMO,
  atendimentosDemo,
  bloqueiosDemo,
} from "@/lib/demo-data";

const DIA = "2026-10-05";

/**
 * A agenda da página de vendas é o componente real do sistema, com dados de
 * demonstração. Nada de imagem: o que o visitante vê é o que ele vai usar.
 */
export function TelaAgenda() {
  const expediente = PROFISSIONAIS_DEMO.map((profissional) => ({
    profissionalId: profissional.id,
    diaSemana: new Date(`${DIA}T12:00:00Z`).getUTCDay(),
    inicio: "09:00",
    fim: "18:00",
  }));

  return (
    <div className="max-h-[420px] w-full min-w-0 overflow-hidden">
      <GradeDoDia
        dia={DIA}
        fuso={EMPRESA_DEMO.fuso}
        nomeDaEmpresa={EMPRESA_DEMO.nome}
        financeiro={{ contas: [], chavePix: null, cidade: EMPRESA_DEMO.cidade }}
        profissionais={PROFISSIONAIS_DEMO}
        atendimentos={atendimentosDemo(DIA)}
        bloqueios={bloqueiosDemo(DIA)}
        expediente={expediente}
        aoClicarVazio={() => {}}
      />
    </div>
  );
}
