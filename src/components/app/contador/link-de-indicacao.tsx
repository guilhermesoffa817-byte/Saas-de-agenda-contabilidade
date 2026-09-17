"use client";

import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Canal de crescimento: o contador indica o Alicerce para os clientes dele. */
export function LinkDeIndicacao({ link }: { link: string }) {
  return (
    <Card className="border-gold/50">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Share2 className="size-4" aria-hidden />
          Indique para seus clientes
        </CardDescription>
        <CardTitle className="text-base">
          Cliente organizado é fechamento sem corre-corre
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Mande este link para os clientes que hoje te entregam caderno e planilha. Seu acesso
          continua gratuito, e as indicações ficam registradas no seu nome — o programa de parceria
          está sendo preparado.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {link}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Link de indicação copiado.");
              } catch {
                toast.error("Não foi possível copiar.");
              }
            }}
          >
            <Copy aria-hidden />
            Copiar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
