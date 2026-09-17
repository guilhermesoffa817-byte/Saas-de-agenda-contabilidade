"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

/** Navegação por mês, no formato aaaa-mm. */
export function SeletorDeMes({ mes, rotulo }: { mes: string; rotulo: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  function ir(delta: number) {
    const [ano, mesNumero] = mes.split("-").map(Number);
    const data = new Date(Date.UTC(ano, mesNumero - 1 + delta, 1));
    const novo = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
    const novos = new URLSearchParams(parametros.toString());
    novos.set("mes", novo);
    router.push(`${caminho}?${novos.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => ir(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <Button variant="outline" size="icon" aria-label="Mês seguinte" onClick={() => ir(1)}>
        <ChevronRight aria-hidden />
      </Button>
      <span className="ml-2 text-lg font-semibold tracking-tight first-letter:uppercase">
        {rotulo}
      </span>
    </div>
  );
}
