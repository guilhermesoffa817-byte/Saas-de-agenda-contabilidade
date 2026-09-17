import { Reveal } from "@/components/marketing/reveal";
import { StatCounter } from "@/components/marketing/stat-counter";

/**
 * Números do produto, não de clientes: nada aqui é inventado.
 * O bloco de depoimentos fica oculto até existirem depoimentos reais — a
 * especificação proíbe publicar nome, foto ou número que não seja verdadeiro.
 */
const NUMEROS = [
  { valor: 5, sufixo: "", rotulo: "toques para o cliente marcar pelo link" },
  { valor: 1, sufixo: "", rotulo: "clique para fechar o mês e avisar o contador" },
  { valor: 3, sufixo: "", rotulo: "formatos de relatório: PDF, Excel e CSV" },
  { valor: 7, sufixo: "", rotulo: "dias de teste grátis, sem cartão" },
];

export function ProvaSocial() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Menos passos, menos retrabalho
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            O trabalho que hoje é manual vira rotina do sistema.
          </p>
        </div>

        <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {NUMEROS.map((numero) => (
            <div key={numero.rotulo} className="flex flex-col gap-2 border-t-2 border-primary pt-4">
              <dt className="sr-only">{numero.rotulo}</dt>
              <dd className="flex flex-col gap-1">
                <StatCounter valor={numero.valor} sufixo={numero.sufixo} />
                <span className="text-sm text-muted-foreground">{numero.rotulo}</span>
              </dd>
            </div>
          ))}
        </dl>

        {/* SUBSTITUIR POR DEPOIMENTO REAL
            Depoimentos entram aqui com nome, profissão e cidade de clientes de
            verdade, com autorização. Enquanto não existirem, o bloco não é
            publicado: inventar prova social é enganar quem está decidindo. */}
      </Reveal>
    </section>
  );
}
