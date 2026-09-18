import { Download } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Portabilidade e saída: o dono baixa tudo o que é dele, quando quiser, sem
 * pedir para ninguém. É exigência da LGPD e é o jeito honesto de tratar quem
 * decidir ir embora.
 */
export function SeusDados({ encarregado }: { encarregado: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Seus dados</h2>
        <p className="text-sm text-muted-foreground">
          Tudo o que está aqui é seu. Baixe quando quiser, num arquivo só: agenda, clientes,
          serviços, lançamentos, fechamentos, notas e registros de envio.
        </p>
      </div>

      <div>
        <Button asChild variant="outline">
          <a href="/api/dados/exportar" download>
            <Download aria-hidden />
            Baixar todos os dados (JSON)
          </a>
        </Button>
      </div>

      <Alert>
        <AlertDescription>
          Para apagar os dados pessoais de um cliente a pedido dele, use o botão de apagar na tela de
          Clientes: o nome, o telefone, o e-mail, o CPF e as anotações somem, e o histórico
          financeiro continua sem identificar a pessoa — que é o que o seu contador precisa guardar.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Encarregado de dados</p>
        <p className="mt-1">
          Dúvida sobre privacidade ou pedido de titular:{" "}
          <a className="underline underline-offset-4" href={`mailto:${encarregado}`}>
            {encarregado}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
