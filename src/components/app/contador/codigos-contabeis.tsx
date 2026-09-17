"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { definirCodigoContabil } from "@/app/contador/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Item = { id: string; nome: string; codigo: string | null };

function LinhaDeCodigo({ item, aoSalvar }: { item: Item; aoSalvar: (codigo: string) => Promise<void> }) {
  const [codigo, setCodigo] = useState(item.codigo ?? "");
  const [salvando, setSalvando] = useState(false);
  const mudou = (item.codigo ?? "") !== codigo.trim();

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Label htmlFor={`codigo-${item.id}`} className="min-w-0 flex-1 truncate font-normal">
        {item.nome}
      </Label>
      <Input
        id={`codigo-${item.id}`}
        value={codigo}
        placeholder="—"
        className="w-28 font-mono text-xs"
        onChange={(evento) => setCodigo(evento.target.value)}
      />
      <Button
        type="button"
        variant={mudou ? "default" : "ghost"}
        size="icon-sm"
        aria-label={`Salvar código de ${item.nome}`}
        disabled={!mudou || salvando}
        onClick={async () => {
          setSalvando(true);
          await aoSalvar(codigo.trim());
          setSalvando(false);
        }}
      >
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      </Button>
    </div>
  );
}

/**
 * Códigos do plano de contas do escritório. É a única coisa que o contador
 * altera no cadastro do cliente — a função no banco garante o resto.
 */
export function CodigosContabeis({
  categorias,
  contas,
}: {
  categorias: { id: string; nome: string; tipo: "receita" | "despesa"; codigo: string | null }[];
  contas: Item[];
}) {
  async function salvarCategoria(categoriaId: string, codigo: string) {
    const resposta = await definirCodigoContabil({ categoriaId, codigo });
    if (resposta.erro) toast.error(resposta.erro);
    else toast.success(resposta.aviso ?? "Código salvo.");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Plano de contas</h2>
        <p className="text-xs text-muted-foreground">
          Os códigos que você cadastrar aqui saem na exportação contábil.
        </p>
      </div>

      <Tabs defaultValue="receitas">
        <TabsList>
          <TabsTrigger value="receitas">Entradas</TabsTrigger>
          <TabsTrigger value="despesas">Saídas</TabsTrigger>
          <TabsTrigger value="contas">Contas</TabsTrigger>
        </TabsList>

        {(["receita", "despesa"] as const).map((tipo) => (
          <TabsContent key={tipo} value={tipo === "receita" ? "receitas" : "despesas"} className="pt-4">
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {categorias
                .filter((categoria) => categoria.tipo === tipo)
                .map((categoria) => (
                  <LinhaDeCodigo
                    key={categoria.id}
                    item={categoria}
                    aoSalvar={(codigo) => salvarCategoria(categoria.id, codigo)}
                  />
                ))}
            </div>
          </TabsContent>
        ))}

        <TabsContent value="contas" className="pt-4">
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {contas.map((conta) => (
              <div key={conta.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{conta.nome}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {conta.codigo ?? "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            O código das contas é cadastrado pelo dono, em Categorias e contas.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
