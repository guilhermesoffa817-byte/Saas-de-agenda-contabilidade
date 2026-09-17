import Link from "next/link";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

export default function LayoutAutenticacao({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-secondary/40">
      <header className="px-6 py-6">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Alicerce
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-6 pb-8 text-center text-xs text-muted-foreground">
        Agenda e financeiro para autônomos e pequenos negócios.
        <br />
        Precisa de ajuda? Escreva para{" "}
        <a className="underline underline-offset-4" href="mailto:suporte@alicerce.com.br">
          suporte@alicerce.com.br
        </a>
      </footer>
      <Toaster position="top-center" />
    </div>
  );
}
