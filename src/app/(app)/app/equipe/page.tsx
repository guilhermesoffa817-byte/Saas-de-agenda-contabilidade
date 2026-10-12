import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Info } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  basesDoMes,
  carregarAusenciasDoMes,
  carregarColaboradores,
  carregarPagamentosDoMes,
  carregarProfissionais,
} from "./dados";
import { carregarContas, mesesFechados } from "@/app/(app)/app/financeiro/dados";
import { GestaoDaEquipe } from "@/components/app/equipe/gestao-equipe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { hojeNaEmpresa } from "@/lib/dates";
import { alertasDaEquipe, ativoNoMes, contratosDoSegmento } from "@/lib/equipe";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Equipe — Bossa" };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaEquipe({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const empresa = vinculo.empresa;
  const parametros = await searchParams;
  const hoje = hojeNaEmpresa(empresa.timezone);
  const mes = parametros.mes && MES.test(parametros.mes) ? parametros.mes : hoje.slice(0, 7);
  const rotuloDoMes = format(new Date(`${mes}-01T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });

  const [colaboradores, profissionais, ausencias, pagamentos, contas, fechados] = await Promise.all([
    carregarColaboradores(empresa.id),
    carregarProfissionais(empresa.id),
    carregarAusenciasDoMes(empresa.id, mes),
    carregarPagamentosDoMes(empresa.id, mes),
    carregarContas(empresa.id),
    mesesFechados(empresa.id),
  ]);

  const doMes = colaboradores.filter((c) => !c.removido && ativoNoMes(c, mes));
  const bases = await basesDoMes(empresa.id, doMes, mes);

  const alertas = alertasDaEquipe({
    regime: empresa.tax_regime,
    hoje,
    colaboradores: colaboradores.map((c) => ({
      id: c.id,
      nome: c.nome,
      contrato: c.contrato,
      inicio: c.inicio,
      fim: c.fim,
      removido: c.removido,
    })),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Sua equipe e o que você paga a cada um, num lugar só. A folha oficial continua com o seu
          contador.
        </p>
      </div>

      {alertas.length ? (
        <div className="flex flex-col gap-3">
          {alertas.map((alerta) => (
            <Alert
              key={alerta.chave}
              className={alerta.nivel === "atencao" ? "border-warning/50 text-warning" : undefined}
            >
              {alerta.nivel === "atencao" ? (
                <AlertTriangle aria-hidden />
              ) : (
                <Info aria-hidden />
              )}
              <AlertTitle>{alerta.titulo}</AlertTitle>
              <AlertDescription>{alerta.texto}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      <GestaoDaEquipe
        mes={mes}
        rotuloDoMes={rotuloDoMes}
        hoje={hoje}
        contratos={contratosDoSegmento(empresa.segment)}
        colaboradores={colaboradores}
        profissionais={profissionais}
        ausencias={ausencias}
        pagamentos={pagamentos}
        bases={bases}
        contas={contas.filter((conta) => conta.active).map((conta) => ({ id: conta.id, nome: conta.name }))}
        mesesFechados={fechados}
      />
    </div>
  );
}
