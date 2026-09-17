"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Alterna entre o tema claro ("papel") e o escuro.
 * O rótulo troca por CSS, e não por estado, para não divergir na hidratação.
 */
export function AlternarTema() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Alternar entre tema claro e escuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon aria-hidden className="dark:hidden" />
      <Sun aria-hidden className="hidden dark:block" />
      <span className="dark:hidden">Tema escuro</span>
      <span className="hidden dark:inline">Tema claro</span>
    </Button>
  );
}
