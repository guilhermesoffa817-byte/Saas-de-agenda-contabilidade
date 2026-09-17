"use client";

import { FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Período e os três formatos de download, iguais em todos os relatórios. */
export function BarraDeRelatorios({
  de,
  ate,
  tipo,
  empresaId,
}: {
  de: string;
  ate: string;
  tipo: string;
  empresaId?: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  function trocar(chave: string, valor: string) {
    const novos = new URLSearchParams(parametros.toString());
    novos.set(chave, valor);
    router.push(`${caminho}?${novos.toString()}`);
  }

  function baixar(formato: "pdf" | "xlsx" | "csv") {
    const destino = new URLSearchParams({ tipo, formato, de, ate });
    if (empresaId) destino.set("empresa", empresaId);
    window.open(`/app/relatorios/exportar?${destino.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo-de" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input
            id="periodo-de"
            type="date"
            value={de}
            className="w-40 font-mono tabular"
            onChange={(evento) => trocar("de", evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo-ate" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input
            id="periodo-ate"
            type="date"
            value={ate}
            className="w-40 font-mono tabular"
            onChange={(evento) => trocar("ate", evento.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => baixar("pdf")}>
          <FileText aria-hidden />
          PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => baixar("xlsx")}>
          <FileSpreadsheet aria-hidden />
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => baixar("csv")}>
          <Table2 aria-hidden />
          CSV
        </Button>
      </div>
    </div>
  );
}
