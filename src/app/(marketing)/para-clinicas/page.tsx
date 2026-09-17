import { Stethoscope } from "lucide-react";
import type { Metadata } from "next";

import { PaginaDeSegmento } from "@/components/marketing/pagina-de-segmento";

export const metadata: Metadata = {
  title: "Alicerce para clínicas e consultórios — agenda, caixa e Livro-Caixa",
  description:
    "Agenda com vários profissionais, controle do que entra e sai e Livro-Caixa pronto para o Carnê-Leão, com acompanhamento dos recibos do Receita Saúde.",
  alternates: { canonical: "/para-clinicas" },
};

export default function PaginaParaClinicas() {
  return (
    <PaginaDeSegmento
      conteudo={{
        eyebrow: "Clínicas e consultórios",
        icone: Stethoscope,
        titulo: "Atendimento em ordem, Carnê-Leão sem correria.",
        subtitulo:
          "A secretária marca, o paciente confirma, o recebimento entra no caixa e o Livro-Caixa do mês fica pronto para o contador — sem misturar nada com prontuário.",
        dores: [
          {
            titulo: "Recibo do Receita Saúde esquecido",
            texto: "Você atende no CPF e depois não sabe para quem já emitiu recibo.",
          },
          {
            titulo: "Dedução no escuro",
            texto: "Aluguel, material, conselho de classe: o que pode entrar no Livro-Caixa?",
          },
          {
            titulo: "Agenda de vários profissionais",
            texto: "Retorno, primeira consulta e avaliação com durações diferentes.",
          },
        ],
        ganhos: [
          "Serviços com duração própria: primeira consulta, retorno, avaliação",
          "Recepção com acesso à agenda, mas sem ver relatórios nem despesas",
          "Lista dos recebimentos de pacientes pessoa física ainda sem recibo",
          "Categorias com a marcação de quando a despesa costuma ser dedutível",
          "Contador com acesso gratuito, sem ver telefone nem anotação de paciente",
          "Anotações administrativas separadas: o Alicerce não é prontuário",
        ],
        fiscal: {
          titulo: "Livro-Caixa e Receita Saúde",
          texto:
            "O Livro-Caixa sai pela data de pagamento, separando receita de pessoa física e de empresa, com a sugestão de dedutível em cada despesa e o aviso quando a dedução passa do rendimento do mês. Os recibos do Receita Saúde continuam sendo emitidos por você no app da Receita — a Receita Federal não oferece integração — e o Alicerce mostra quais estão faltando.",
        },
      }}
    />
  );
}
