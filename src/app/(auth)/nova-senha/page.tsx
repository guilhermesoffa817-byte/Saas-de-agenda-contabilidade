import type { Metadata } from "next";

import { FormularioNovaSenha } from "./formulario";

export const metadata: Metadata = { title: "Nova senha — Alicerce" };

export default function PaginaNovaSenha() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Criar nova senha</h1>
        <p className="text-sm text-muted-foreground">
          Escolha a senha que você vai usar para entrar no Alicerce.
        </p>
      </div>

      <FormularioNovaSenha />
    </div>
  );
}
