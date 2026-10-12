"use client";

import { useSearchParams } from "next/navigation";

import { AbaAusencias } from "./aba-ausencias";
import { AbaColaboradores } from "./aba-colaboradores";
import { AbaPagamentos } from "./aba-pagamentos";
import type {
  AusenciaDaTela,
  BaseDoMes,
  ColaboradorDaTela,
  ContaSimples,
  PagamentoDaTela,
  ProfissionalDaAgenda,
} from "./tipos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Contrato } from "@/lib/equipe";

const ABAS = ["equipe", "ausencias", "pagamentos"] as const;
type Aba = (typeof ABAS)[number];

function abaValida(valor: string | null): Aba {
  return ABAS.find((aba) => aba === valor) ?? "equipe";
}

export function GestaoDaEquipe({
  mes,
  rotuloDoMes,
  hoje,
  contratos,
  colaboradores,
  profissionais,
  ausencias,
  pagamentos,
  bases,
  contas,
  mesesFechados,
}: {
  mes: string;
  rotuloDoMes: string;
  hoje: string;
  contratos: Contrato[];
  colaboradores: ColaboradorDaTela[];
  profissionais: ProfissionalDaAgenda[];
  ausencias: AusenciaDaTela[];
  pagamentos: PagamentoDaTela[];
  bases: Record<string, BaseDoMes>;
  contas: ContaSimples[];
  mesesFechados: string[];
}) {
  const parametros = useSearchParams();
  const aba = abaValida(parametros.get("aba"));

  // A aba fica na URL (sem recarregar a página): o seletor de mês e o recarregar a preservam.
  function trocarAba(valor: string) {
    const novos = new URLSearchParams(parametros.toString());
    novos.set("aba", abaValida(valor));
    window.history.replaceState(null, "", `?${novos.toString()}`);
  }

  return (
    <Tabs value={aba} onValueChange={trocarAba}>
      <TabsList>
        <TabsTrigger value="equipe">Equipe</TabsTrigger>
        <TabsTrigger value="ausencias">Ausências</TabsTrigger>
        <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
      </TabsList>

      <TabsContent value="equipe" className="pt-6">
        <AbaColaboradores
          colaboradores={colaboradores}
          profissionais={profissionais}
          contratos={contratos}
          hoje={hoje}
        />
      </TabsContent>

      <TabsContent value="ausencias" className="pt-6">
        <AbaAusencias
          mes={mes}
          rotuloDoMes={rotuloDoMes}
          hoje={hoje}
          ausencias={ausencias}
          colaboradores={colaboradores}
        />
      </TabsContent>

      <TabsContent value="pagamentos" className="pt-6">
        <AbaPagamentos
          mes={mes}
          rotuloDoMes={rotuloDoMes}
          hoje={hoje}
          colaboradores={colaboradores}
          pagamentos={pagamentos}
          bases={bases}
          contas={contas}
          mesesFechados={mesesFechados}
        />
      </TabsContent>
    </Tabs>
  );
}
