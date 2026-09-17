"use client";

import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useTransition } from "react";

import { sair } from "@/app/(auth)/acoes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MenuUsuario({ nome, email, papel }: { nome: string; email: string; papel: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [saindo, iniciar] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sua conta">
          <UserRound aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>{nome}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
          <span className="text-xs font-normal text-muted-foreground">Acesso: {papel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Moon className="dark:hidden" aria-hidden />
          <Sun className="hidden dark:block" aria-hidden />
          <span className="dark:hidden">Tema escuro</span>
          <span className="hidden dark:inline">Tema claro</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={saindo}
          onSelect={(evento) => {
            evento.preventDefault();
            iniciar(() => {
              void sair();
            });
          }}
        >
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
