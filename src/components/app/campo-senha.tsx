"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Campo de senha com o olho para mostrar o que foi digitado. */
export function CampoSenha({ className, ...props }: ComponentProps<typeof Input>) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={aberto ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={aberto ? "Esconder a senha" : "Mostrar a senha"}
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
        onClick={() => setAberto((valor) => !valor)}
      >
        {aberto ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  );
}
