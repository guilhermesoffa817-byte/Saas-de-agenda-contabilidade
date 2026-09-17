"use client";

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { salvarModeloDeExportacao } from "@/app/(app)/app/relatorios/exportacao/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COLUNAS_DISPONIVEIS, type ChaveDeColuna } from "@/lib/reports/exportacao-contabil";

const SEPARADORES = [
  { valor: ";", rotulo: "Ponto e vírgula (;) — padrão brasileiro" },
  { valor: ",", rotulo: "Vírgula (,)" },
  { valor: "|", rotulo: "Barra vertical (|)" },
  { valor: "\t", rotulo: "Tabulação" },
];

const FORMATOS = [
  { valor: "dd/MM/yyyy", rotulo: "31/12/2026" },
  { valor: "yyyy-MM-dd", rotulo: "2026-12-31" },
  { valor: "ddMMyyyy", rotulo: "31122026" },
];

/**
 * Cada sistema contábil tem leiaute próprio e muda entre versões. Em vez de
 * chutar um formato, o contador monta o dele aqui.
 */
export function ConfigurarExportacao({
  empresaId,
  inicial,
}: {
  empresaId: string;
  inicial: {
    colunas: ChaveDeColuna[];
    separador: string;
    formatoDeData: string;
    decimalComVirgula: boolean;
  };
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [colunas, setColunas] = useState<ChaveDeColuna[]>(inicial.colunas);
  const [separador, setSeparador] = useState(inicial.separador);
  const [formato, setFormato] = useState(inicial.formatoDeData);
  const [decimalComVirgula, setDecimalComVirgula] = useState(inicial.decimalComVirgula);

  function alternar(chave: ChaveDeColuna, marcado: boolean) {
    setColunas((atuais) =>
      marcado ? [...atuais, chave] : atuais.filter((coluna) => coluna !== chave),
    );
  }

  function mover(chave: ChaveDeColuna, direcao: -1 | 1) {
    setColunas((atuais) => {
      const indice = atuais.indexOf(chave);
      const destino = indice + direcao;
      if (indice < 0 || destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  const exemplo = [
    ...colunas.map((chave) => {
      const valores: Record<ChaveDeColuna, string> = {
        data: formato === "yyyy-MM-dd" ? "2026-09-05" : formato === "ddMMyyyy" ? "05092026" : "05/09/2026",
        conta_debito: "1.1.01",
        conta_credito: "3.1.01",
        valor: decimalComVirgula ? "200,00" : "200.00",
        historico: "Consulta particular",
        documento: "12345678901",
        categoria: "Atendimentos",
        forma_pagamento: "pix",
      };
      return valores[chave];
    }),
  ].join(separador === "\t" ? "→" : separador);

  return (
    <div className="flex flex-col gap-8">
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <Label>Colunas do arquivo</Label>
        <div className="flex flex-col gap-2">
          {COLUNAS_DISPONIVEIS.map((coluna) => {
            const marcado = colunas.includes(coluna.chave);
            const posicao = colunas.indexOf(coluna.chave);
            return (
              <div
                key={coluna.chave}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <Checkbox
                  id={`coluna-${coluna.chave}`}
                  checked={marcado}
                  onCheckedChange={(valor) => alternar(coluna.chave, valor === true)}
                />
                <Label htmlFor={`coluna-${coluna.chave}`} className="flex-1 font-normal">
                  {coluna.rotulo}
                </Label>
                {marcado ? (
                  <>
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {posicao + 1}ª
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Subir ${coluna.rotulo}`}
                      disabled={posicao === 0}
                      onClick={() => mover(coluna.chave, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Descer ${coluna.rotulo}`}
                      disabled={posicao === colunas.length - 1}
                      onClick={() => mover(coluna.chave, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="separador">Separador</Label>
          <Select value={separador} onValueChange={setSeparador}>
            <SelectTrigger id="separador" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEPARADORES.map((item) => (
                <SelectItem key={item.valor} value={item.valor}>
                  {item.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="formato-data">Formato de data</Label>
          <Select value={formato} onValueChange={setFormato}>
            <SelectTrigger id="formato-data" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATOS.map((item) => (
                <SelectItem key={item.valor} value={item.valor}>
                  {item.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <Switch
          id="decimal-virgula"
          checked={decimalComVirgula}
          onCheckedChange={setDecimalComVirgula}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="decimal-virgula" className="font-normal">
            Decimal com vírgula (200,00)
          </Label>
          <span className="text-xs text-muted-foreground">
            {separador === ","
              ? "Com separador vírgula, o recomendado é usar ponto decimal — senão cada valor sai entre aspas."
              : "Desligue se o sistema do escritório espera ponto (200.00)."}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Como o arquivo vai sair</Label>
        <code className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs whitespace-pre">
          {colunas
            .map(
              (chave) =>
                COLUNAS_DISPONIVEIS.find((coluna) => coluna.chave === chave)?.rotulo ?? chave,
            )
            .join(separador === "\t" ? "→" : separador)}
          {"\n"}
          {exemplo}
        </code>
        <p className="text-xs text-muted-foreground">
          O arquivo sai em UTF-8 com BOM, para o Excel abrir os acentos corretamente. As contas usam
          o código do plano de contas cadastrado nas categorias e nas contas.
        </p>
      </div>

      <Button
        className="w-fit"
        disabled={salvando || colunas.length === 0}
        onClick={async () => {
          setErro(null);
          setSalvando(true);
          const resposta = await salvarModeloDeExportacao({
            empresaId,
            colunas,
            separador: separador as ";",
            formatoDeData: formato as "dd/MM/yyyy",
            decimalComVirgula,
          });
          setSalvando(false);
          if (resposta.erro) {
            setErro(resposta.erro);
            return;
          }
          toast.success(resposta.aviso ?? "Modelo salvo.");
        }}
      >
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar modelo
      </Button>
    </div>
  );
}
