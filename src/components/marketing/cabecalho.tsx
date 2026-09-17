"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#por-dentro", rotulo: "Como funciona" },
  { href: "/#funcionalidades", rotulo: "Funcionalidades" },
  { href: "/precos", rotulo: "Preços" },
  { href: "/para-contadores", rotulo: "Para contadores" },
];

/** Transparente no topo, com desfoque e borda ao rolar. Um só botão principal. */
export function CabecalhoMarketing() {
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 24);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-300",
        rolou ? "border-b border-border bg-background/85 backdrop-blur" : "border-b border-transparent",
      )}
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Alicerce
        </Link>

        <nav aria-label="Seções do site" className="hidden flex-1 items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.rotulo}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/entrar">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/cadastro">Testar 7 dias grátis</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={aberto ? "Fechar o menu" : "Abrir o menu"}
            aria-expanded={aberto}
            onClick={() => setAberto((valor) => !valor)}
          >
            {aberto ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      {aberto ? (
        <nav
          aria-label="Seções do site"
          className="flex flex-col gap-1 border-t border-border bg-background px-6 pb-4 md:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setAberto(false)}
              className="rounded-md px-2 py-2.5 text-sm hover:bg-accent"
            >
              {link.rotulo}
            </Link>
          ))}
          <Link
            href="/entrar"
            onClick={() => setAberto(false)}
            className="rounded-md px-2 py-2.5 text-sm hover:bg-accent"
          >
            Entrar
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
