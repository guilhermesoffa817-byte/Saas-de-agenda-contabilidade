import { CalendarX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatarDia } from "@/lib/equipe";

/** Quem sai não pode seguir recebendo agendamento online pelo perfil da agenda. */
export function AvisoDaAgenda({ nome, fim, hoje }: { nome: string; fim: string; hoje: string }) {
  return (
    <Alert>
      <CalendarX aria-hidden />
      <AlertDescription>
        {fim && fim <= hoje
          ? `O perfil de ${nome} na agenda será desativado e deixa de receber agendamentos online. Os atendimentos já marcados continuam lá: remarque ou cancele se precisar.`
          : `${nome} continua recebendo agendamentos online até você desativar o profissional em Serviços e equipe. Faça isso depois de ${formatarDia(fim)}.`}
      </AlertDescription>
    </Alert>
  );
}
