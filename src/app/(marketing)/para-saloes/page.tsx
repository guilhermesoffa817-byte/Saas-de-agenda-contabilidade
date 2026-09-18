import { Scissors } from "lucide-react";
import type { Metadata } from "next";

import { PaginaDeSegmento } from "@/components/marketing/pagina-de-segmento";
import { ALERTAS_LIMITE_MEI, LIMITE_MEI_ANUAL_CENTS } from "@/lib/fiscal/constantes";
import { formatarBRL } from "@/lib/money";

export const metadata: Metadata = {
  title: "Alicerce para salões e barbearias — agenda e caixa no mesmo lugar",
  description:
    "Agenda por profissional, link para o cliente marcar sozinho, lembrete no WhatsApp e o caixa do dia fechando sem planilha. Teste 7 dias grátis.",
  alternates: { canonical: "/para-saloes" },
};

export default function PaginaParaSaloes() {
  return (
    <PaginaDeSegmento
      conteudo={{
        eyebrow: "Salões e barbearias",
        icone: Scissors,
        titulo: "A cadeira cheia e o caixa fechado no fim do dia.",
        subtitulo:
          "O cliente marca pelo link sem travar o seu WhatsApp, cada profissional tem a própria coluna na agenda, e o que foi atendido já entra no caixa.",
        dores: [
          {
            titulo: "Falta sem avisar",
            texto: "O horário fica vazio e você só descobre quando o cliente não aparece.",
          },
          {
            titulo: "WhatsApp virou agenda",
            texto: "Cinquenta mensagens por dia para marcar, remarcar e confirmar.",
          },
          {
            titulo: "Comissão no caderno",
            texto: "No fim do mês ninguém sabe quanto entrou por profissional.",
          },
        ],
        ganhos: [
          "Uma coluna por profissional, com o horário de trabalho de cada um",
          "Arrastar para remarcar, sem apagar e digitar de novo",
          "Tempo de preparo entre atendimentos (limpeza, escova secando)",
          "Histórico de faltas do cliente na hora de marcar",
          "Serviços com duração e preço próprios, prontos no link",
          "Pix copia e cola gerado com a chave do salão",
        ],
        fiscal: {
          titulo: "MEI de olho no limite",
          texto:
            `Salão que fatura bem chega perto do teto do MEI sem perceber. O termômetro avisa em ${ALERTAS_LIMITE_MEI.map((f) => `${f * 100}%`).join(" e ")} do limite de ${formatarBRL(LIMITE_MEI_ANUAL_CENTS)} por ano, e o relatório mensal de receitas sai pronto para o contador decidir a hora de mudar de regime.`,
        },
      }}
    />
  );
}
