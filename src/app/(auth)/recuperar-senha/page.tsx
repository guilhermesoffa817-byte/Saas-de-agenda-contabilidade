import type { Metadata } from "next";
import Link from "next/link";

import { FormularioRecuperarSenha } from "./formulario";

export const metadata: Metadata = { title: "Recuperar senha — Alicerce" };

export default function PaginaRecuperarSenha() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite o e-mail da sua conta e enviamos um link para você criar uma nova senha.
        </p>
      </div>

      <FormularioRecuperarSenha />

      <p className="text-sm text-muted-foreground">
        <Link href="/entrar" className="font-medium text-foreground underline underline-offset-4">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
