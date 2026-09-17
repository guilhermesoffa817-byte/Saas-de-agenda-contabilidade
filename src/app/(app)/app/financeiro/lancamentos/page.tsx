import { endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { carregarCategorias, carregarContas, carregarLancamentos, mesesFechados } from "../dados";
import { ListaDeLancamentos } from "@/components/app/financeiro/lista-lancamentos";
import { SeletorDeMes } from "@/components/app/financeiro/seletor-mes";
import { Button } from "@/components/ui/button";
import { empresaAtual } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Lançamentos — Alicerce" };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipo?: string; categoria?: string; situacao?: string }>;
}) {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono" && vinculo.papel !== "recepcao") redirect("/app");

  const empresa = vinculo.empresa;
  const parametros = await searchParams;

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: empresa.timezone }).format(new Date());
  const mes = parametros.mes && MES.test(parametros.mes) ? parametros.mes : hoje.slice(0, 7);
  const de = `${mes}-01`;
  const ate = format(endOfMonth(new Date(`${de}T12:00:00Z`)), "yyyy-MM-dd");

  const tipo = parametros.tipo === "receita" || parametros.tipo === "despesa" ? parametros.tipo : undefined;
  const situacao =
    parametros.situacao === "pago" || parametros.situacao === "pendente" || parametros.situacao === "cancelado"
      ? parametros.situacao
      : undefined;

  const [lancamentos, categorias, contas, fechados] = await Promise.all([
    carregarLancamentos({
      empresaId: empresa.id,
      de,
      ate,
      tipo,
      situacao,
      categoriaId: parametros.categoria,
    }),
    carregarCategorias(empresa.id),
    carregarContas(empresa.id),
    mesesFechados(empresa.id),
  ]);

  const rotuloDoMes = format(new Date(`${de}T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={rotuloDoMes} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/financeiro?mes=${mes}`}>
            <ArrowLeft aria-hidden />
            Voltar ao painel
          </Link>
        </Button>
      </div>

      <ListaDeLancamentos
        empresaId={empresa.id}
        fuso={empresa.timezone}
        lancamentos={lancamentos}
        categorias={categorias.map((categoria) => ({
          id: categoria.id,
          nome: categoria.name,
          tipo: categoria.kind,
          dedutivel: categoria.deductible_hint,
        }))}
        contas={contas
          .filter((conta) => conta.active)
          .map((conta) => ({ id: conta.id, nome: conta.name }))}
        filtros={{
          tipo: parametros.tipo,
          categoria: parametros.categoria,
          situacao: parametros.situacao,
        }}
        mesFechado={fechados.includes(mes)}
      />
    </div>
  );
}
