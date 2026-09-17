import type { Metadata } from "next";
import Link from "next/link";

import { FormularioCadastro } from "./formulario";

export const metadata: Metadata = { title: "Criar conta — Alicerce" };

export default function PaginaCadastro() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Em poucos minutos sua agenda está no ar e seu financeiro organizado.
        </p>
      </div>

      <FormularioCadastro />

      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-foreground underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  );
}
