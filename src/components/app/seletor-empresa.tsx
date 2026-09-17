"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { selecionarEmpresa } from "@/app/(app)/app/acoes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Seletor de empresa para quem cuida de mais de um negócio. */
export function SeletorEmpresa({
  empresas,
  atual,
}: {
  empresas: { id: string; nome: string }[];
  atual: string;
}) {
  const router = useRouter();
  const [trocando, iniciar] = useTransition();

  if (empresas.length < 2) return null;

  return (
    <Select
      value={atual}
      disabled={trocando}
      onValueChange={(valor) =>
        iniciar(async () => {
          await selecionarEmpresa(valor);
          router.refresh();
        })
      }
    >
      <SelectTrigger className="w-full max-w-56" aria-label="Escolher empresa">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {empresas.map((empresa) => (
          <SelectItem key={empresa.id} value={empresa.id}>
            {empresa.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
