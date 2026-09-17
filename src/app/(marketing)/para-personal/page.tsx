import { Dumbbell } from "lucide-react";
import type { Metadata } from "next";

import { PaginaDeSegmento } from "@/components/marketing/pagina-de-segmento";

export const metadata: Metadata = {
  title: "Alicerce para personal trainers e terapeutas — agenda e financeiro",
  description:
    "Treinos e sessões com hora marcada, lembrete no WhatsApp, pacote mensal controlado e o financeiro do mês fechando sozinho. Teste 7 dias grátis.",
  alternates: { canonical: "/para-personal" },
};

export default function PaginaParaPersonal() {
  return (
    <PaginaDeSegmento
      conteudo={{
        eyebrow: "Personal trainers e terapeutas",
        icone: Dumbbell,
        titulo: "Sua semana organizada e o recebimento em dia.",
        subtitulo:
          "Você atende em horários espalhados, em lugares diferentes. O Alicerce junta os atendimentos, os lembretes e o dinheiro num lugar só.",
        dores: [
          {
            titulo: "Aluno que falta e não avisa",
            texto: "Você já está no local quando descobre que a sessão caiu.",
          },
          {
            titulo: "Pacote sem controle",
            texto: "Quantas sessões do mês já foram usadas e quanto falta receber?",
          },
          {
            titulo: "Nota e imposto no fim do ano",
            texto: "Sem registro do que entrou, o Carnê-Leão vira um problema em abril.",
          },
        ],
        ganhos: [
          "Sessões individuais, em dupla ou avaliação, cada uma com sua duração",
          "Bloqueio de horário para o seu treino, deslocamento ou descanso",
          "Lembrete no WhatsApp com a mensagem pronta, sem custo por mensagem",
          "Histórico de faltas para decidir política de cancelamento",
          "Recebimento registrado na hora da sessão, com Pix copia e cola",
          "Livro-Caixa e relatórios prontos, se você atende como pessoa física",
        ],
        fiscal: {
          titulo: "Autônomo pessoa física",
          texto:
            "Atendendo no CPF, o que vale é a data do pagamento. O Alicerce organiza o Livro-Caixa nesse formato, separa receita de pessoa física e de empresa e marca as despesas que costumam ser dedutíveis — como anuidade de conselho, congresso e material de trabalho.",
        },
      }}
    />
  );
}
