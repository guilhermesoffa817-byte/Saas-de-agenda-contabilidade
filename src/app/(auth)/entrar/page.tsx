import type { Metadata } from "next";
import Link from "next/link";

import { FormularioEntrar } from "./formulario";

export const metadata: Metadata = { title: "Entrar — Alicerce" };

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const { voltar } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Entrar no Alicerce</h1>
        <p className="text-sm text-muted-foreground">
          Sua agenda e seu financeiro, no mesmo lugar.
        </p>
      </div>

      <FormularioEntrar voltar={voltar} />

      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-foreground underline underline-offset-4">
          Criar conta grátis
        </Link>
      </p>
    </div>
  );
}
