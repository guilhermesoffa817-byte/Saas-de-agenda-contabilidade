"use client";

import { Check, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { definirNaturezaDoLancamento } from "@/app/(app)/app/financeiro/custos/acoes";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NATUREZAS,
  ROTULO_DA_NATUREZA,
  ROTULO_DA_ORIGEM,
  type DespesaClassificada,
  type Natureza,
} from "@/lib/custos/calculo";
import { motivoParaTela } from "@/lib/custos/regras";
import { formatarData } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";

import { SeloNatureza } from "./selo-natureza";

type Escolha = Natureza | "padrao";

function LinhaDaDespesa({
  despesa,
  fuso,
  podeAlterar,
}: {
  despesa: DespesaClassificada;
  fuso: string;
  podeAlterar: boolean;
}) {
  const [salvando, iniciar] = useTransition();
  const sugestao = despesa.origem === "ia" || despesa.origem === "regra";
  const escolhaAtual: Escolha = despesa.excecao ? despesa.excecao.natureza : "padrao";
  const padraoDaCategoria = despesa.naturezaDaCategoria
    ? `Seguir a categoria (${ROTULO_DA_NATUREZA[despesa.naturezaDaCategoria].toLowerCase()})`
    : "Seguir a categoria (sem classificação)";

  function escolher(natureza: Escolha) {
    iniciar(async () => {
      const resposta = await definirNaturezaDoLancamento({ transacaoId: despesa.id, natureza });
      if (resposta.erro) toast.error(resposta.erro);
      else toast.success(resposta.aviso ?? "Classificação salva.");
    });
  }

  const motivo = motivoParaTela(despesa.motivo);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs tabular">
        {formatarData(`${despesa.pagoEm}T12:00:00Z`, fuso)}
      </TableCell>
      <TableCell className="min-w-48">
        <span className="block">{despesa.descricao}</span>
        <span className="text-xs text-muted-foreground">{despesa.categoria ?? "Sem categoria"}</span>
      </TableCell>
      <TableCell className="text-right font-mono tabular">{formatarBRL(despesa.valorCents)}</TableCell>
      <TableCell>
        <SeloNatureza natureza={despesa.natureza} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {despesa.origem ? ROTULO_DA_ORIGEM[despesa.origem] : "—"}
      </TableCell>
      <TableCell className="max-w-64 text-xs text-muted-foreground">{motivo ?? "—"}</TableCell>
      <TableCell>
        {podeAlterar ? (
          <div className="flex items-center justify-end gap-1">
            {sugestao && despesa.natureza ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Confirmar ${ROTULO_DA_NATUREZA[despesa.natureza].toLowerCase()} para ${despesa.descricao}`}
                title="Confirmar a sugestão"
                disabled={salvando}
                onClick={() => escolher(despesa.natureza!)}
              >
                <Check aria-hidden />
              </Button>
            ) : null}
            <Select value={escolhaAtual} onValueChange={(valor) => escolher(valor as Escolha)} disabled={salvando}>
              <SelectTrigger
                className="w-52"
                size="sm"
                aria-label={`Classificação de ${despesa.descricao}`}
              >
                {salvando ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">{padraoDaCategoria}</SelectItem>
                {NATUREZAS.map((natureza) => (
                  <SelectItem key={natureza} value={natureza}>
                    {ROTULO_DA_NATUREZA[natureza]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function TabelaDeDespesas({
  despesas,
  fuso,
  podeAlterar,
}: {
  despesas: DespesaClassificada[];
  fuso: string;
  podeAlterar: boolean;
}) {
  if (despesas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma despesa paga neste mês.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pago em</TableHead>
            <TableHead>Despesa</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Natureza</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">{podeAlterar ? "Corrigir" : ""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {despesas.map((despesa) => (
            <LinhaDaDespesa key={despesa.id} despesa={despesa} fuso={fuso} podeAlterar={podeAlterar} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
