"use client";

import {
  CalendarDays,
  CreditCard,
  FileBarChart,
  IdCard,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Scissors,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Papel } from "@/lib/supabase/sessao";
import { cn } from "@/lib/utils";

const ICONES = {
  LayoutDashboard,
  CalendarDays,
  Users,
  Scissors,
  IdCard,
  Wallet,
  FileBarChart,
  MessageSquareText,
  CreditCard,
  Settings,
} satisfies Record<string, LucideIcon>;

/** O nome do ícone é conferido pelo TypeScript: um ícone que não está em ICONES não compila. */
export type ItemDeMenu = { href: string; rotulo: string; icone: keyof typeof ICONES };

/** Itens visíveis para cada papel. O contador tem portal próprio, em /contador. */
export function itensPorPapel(papel: Papel): ItemDeMenu[] {
  const agenda: ItemDeMenu[] = [
    { href: "/app", rotulo: "Painel", icone: "LayoutDashboard" },
    { href: "/app/agenda", rotulo: "Agenda", icone: "CalendarDays" },
    { href: "/app/clientes", rotulo: "Clientes", icone: "Users" },
  ];

  if (papel === "dono") {
    return [
      ...agenda,
      { href: "/app/financeiro", rotulo: "Financeiro", icone: "Wallet" },
      { href: "/app/relatorios", rotulo: "Relatórios", icone: "FileBarChart" },
      // O assistente lê o financeiro e tem custo por pergunta: só o dono.
      { href: "/app/assistente", rotulo: "Assistente", icone: "MessageSquareText" },
      { href: "/app/servicos", rotulo: "Serviços", icone: "Scissors" },
      // Remuneração, CPF e Pix da equipe: só o dono (o contador vê o necessário no portal dele).
      { href: "/app/equipe", rotulo: "Equipe", icone: "IdCard" },
      { href: "/app/assinatura", rotulo: "Assinatura", icone: "CreditCard" },
      { href: "/app/configuracoes", rotulo: "Configurações", icone: "Settings" },
    ];
  }

  if (papel === "recepcao") {
    // A recepção registra recebimentos, mas não vê relatórios nem despesas.
    return [...agenda, { href: "/app/financeiro/lancamentos", rotulo: "Recebimentos", icone: "Wallet" }];
  }

  return agenda;
}

function Itens({ itens, aoClicar }: { itens: ItemDeMenu[]; aoClicar?: () => void }) {
  const caminho = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {itens.map((item) => {
        const Icone = ICONES[item.icone];
        const ativo = item.href === "/app" ? caminho === "/app" : caminho.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={aoClicar}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              ativo
                ? "bg-primary/10 font-medium text-primary dark:bg-primary/15"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icone className="size-4" aria-hidden />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavegacaoLateral({ itens }: { itens: ItemDeMenu[] }) {
  return (
    <div className="hidden w-60 shrink-0 border-r border-border bg-card/60 p-4 md:block">
      <Itens itens={itens} />
    </div>
  );
}

export function NavegacaoCelular({ itens }: { itens: ItemDeMenu[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir o menu">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="px-0">
          <SheetTitle className="font-display text-lg">Bossa</SheetTitle>
        </SheetHeader>
        <Itens itens={itens} aoClicar={() => setAberto(false)} />
      </SheetContent>
    </Sheet>
  );
}
