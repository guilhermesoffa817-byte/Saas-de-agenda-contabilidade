import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * As respostas fiscais seguem a pesquisa de setembro de 2026 registrada na
 * especificação. Nada aqui promete o que o sistema não faz.
 */
const PERGUNTAS = [
  {
    pergunta: "Meus dados estão seguros?",
    resposta:
      "Sim. Os dados ficam em servidores na região de São Paulo, cada pessoa da equipe tem senha própria e o que ela vê depende do papel: a recepção não vê relatórios, o profissional não vê o financeiro e o contador não vê telefone nem anotação dos seus clientes. O banco aplica essas regras linha por linha, e exportações e reaberturas de mês ficam registradas.",
  },
  {
    pergunta: "Preciso entender de contabilidade?",
    resposta:
      "Não. O painel fala em entrou, saiu e sobrou. Você registra o que aconteceu no dia; a parte técnica fica com o seu contador, que recebe tudo organizado.",
  },
  {
    pergunta: "O Alicerce substitui meu contador?",
    resposta:
      "Não, e não é essa a ideia. O Alicerce organiza seus lançamentos e entrega o mês fechado para o escritório. Apuração, guias e escrituração continuam com o seu contador.",
  },
  {
    pergunta: "Meu contador consegue usar os relatórios?",
    resposta:
      "Sim. O acesso dele é gratuito em todos os planos, e ele configura o leiaute da exportação com o plano de contas do escritório, escolhendo a ordem das colunas, o separador e o formato de data.",
  },
  {
    pergunta: "O Alicerce emite nota fiscal?",
    resposta:
      "Emite, no plano Negócio, por meio de provedor especializado. Depende de contratar o provedor e, na maioria das prefeituras, de certificado digital da empresa — a gente explica o passo a passo na hora de ligar. Os códigos de tributação de cada serviço quem preenche é o seu contador, pelo portal dele: o Alicerce não calcula imposto, só repassa o que foi configurado.",
  },
  {
    pergunta: "Emite o recibo do Receita Saúde?",
    resposta:
      "Não. Desde 2025, médicos, psicólogos, dentistas, fisioterapeutas, fonoaudiólogos e terapeutas ocupacionais que atendem como pessoa física emitem o recibo no app Receita Saúde, no Carnê-Leão Web ou no e-CAC, e a Receita Federal não oferece integração. O Alicerce lista quais recebimentos ainda estão sem recibo e deixa você marcar os que já emitiu.",
  },
  {
    pergunta: "Preciso de cartão de crédito para testar?",
    resposta:
      "Não. São 7 dias grátis sem cartão. Se você não assinar, a conta fica somente leitura: nada é apagado e você pode exportar tudo.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta:
      "Sim, pelo próprio sistema, em Assinatura, sem ligar para ninguém. A cobrança para na hora e seus dados ficam guardados para exportação.",
  },
  {
    pergunta: "Consigo trazer meus clientes de outro sistema?",
    resposta:
      "Sim, por planilha: você exporta do sistema atual e importa no Alicerce. Se precisar, a gente ajuda a ajustar o arquivo.",
  },
  {
    pergunta: "Funciona com mais de um profissional?",
    resposta:
      "Funciona. A agenda mostra uma coluna por profissional, cada um com o próprio horário de trabalho, e o plano define quantas pessoas cabem.",
  },
];

export function Perguntas() {
  return (
    <section id="perguntas" className="border-y border-border bg-secondary/30">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-20">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="text-lg text-muted-foreground">
            O que as pessoas perguntam antes de começar.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {PERGUNTAS.map((item, indice) => (
            <AccordionItem key={item.pergunta} value={`pergunta-${indice}`}>
              <AccordionTrigger className="text-left text-base">{item.pergunta}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.resposta}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export const PERGUNTAS_FREQUENTES = PERGUNTAS;
