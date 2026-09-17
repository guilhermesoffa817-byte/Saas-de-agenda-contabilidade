"use client";

import { TourProduto } from "@/components/marketing/tour-produto";
import { TelaAgenda } from "@/components/marketing/telas/tela-agenda";
import { TelaAgendamento } from "@/components/marketing/telas/tela-agendamento";
import { TelaFechamento } from "@/components/marketing/telas/tela-fechamento";
import { TelaLembrete } from "@/components/marketing/telas/tela-lembrete";

const PASSOS = [
  {
    titulo: "O cliente agenda sozinho",
    texto:
      "Você manda o link uma vez. Ele escolhe serviço, profissional e horário — e só aparece o que está livre de verdade.",
    Tela: TelaAgendamento,
  },
  {
    titulo: "O lembrete sai no WhatsApp",
    texto:
      "Um toque e a mensagem vai pronta, com data e hora. Quando o cliente confirma, a agenda já mostra confirmado.",
    Tela: TelaLembrete,
  },
  {
    titulo: "Atendeu? O dinheiro entra sozinho",
    texto:
      "Ao concluir o atendimento, você registra como recebeu e o valor entra no financeiro. Sem digitar duas vezes.",
    Tela: TelaAgenda,
  },
  {
    titulo: "Fim do mês em um clique",
    texto:
      "O Alicerce confere o que ficou faltando, trava o mês e manda o pacote de relatórios para o seu contador.",
    Tela: TelaFechamento,
  },
];

export function Tour() {
  return (
    <div id="por-dentro" className="border-y border-border bg-secondary/30">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-10 flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Por dentro do Alicerce
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Quatro passos que acontecem no seu dia. Role para ver cada tela.
          </p>
        </div>

        <TourProduto passos={PASSOS} />
      </div>
    </div>
  );
}
