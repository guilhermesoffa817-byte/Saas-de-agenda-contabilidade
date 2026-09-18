import Link from "next/link";
import { ENCARREGADO_DE_DADOS } from "@/lib/contato";

const COLUNAS = [
  {
    titulo: "Produto",
    links: [
      { href: "/#por-dentro", rotulo: "Como funciona" },
      { href: "/#funcionalidades", rotulo: "Funcionalidades" },
      { href: "/precos", rotulo: "Preços" },
      { href: "/#perguntas", rotulo: "Perguntas frequentes" },
    ],
  },
  {
    titulo: "Para quem",
    links: [
      { href: "/para-saloes", rotulo: "Salões e barbearias" },
      { href: "/para-clinicas", rotulo: "Clínicas e consultórios" },
      { href: "/para-personal", rotulo: "Personal e terapeutas" },
      { href: "/para-contadores", rotulo: "Contadores" },
    ],
  },
  {
    titulo: "Conta",
    links: [
      { href: "/cadastro", rotulo: "Criar conta" },
      { href: "/entrar", rotulo: "Entrar" },
      { href: "/contador", rotulo: "Portal do contador" },
    ],
  },
  {
    titulo: "Legal",
    links: [
      { href: "/termos", rotulo: "Termos de uso" },
      { href: "/privacidade", rotulo: "Política de privacidade" },
    ],
  },
];

export function RodapeMarketing() {
  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-3 lg:col-span-1">
            <span className="font-display text-xl font-semibold tracking-tight">Alicerce</span>
            <p className="text-sm text-muted-foreground">
              Agenda e financeiro para autônomos e pequenos negócios, com relatório pronto para o
              contador.
            </p>
          </div>

          {COLUNAS.map((coluna) => (
            <nav key={coluna.titulo} aria-label={coluna.titulo} className="flex flex-col gap-3">
              <span className="text-sm font-medium">{coluna.titulo}</span>
              <ul className="flex flex-col gap-2">
                {coluna.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-8 text-xs text-muted-foreground">
          <p>
            O Alicerce não substitui o contador, não calcula impostos por conta própria e não é
            prontuário eletrônico.
          </p>
          <p>
            <strong>[EXEMPLO]</strong> Alicerce Tecnologia LTDA · CNPJ 00.000.000/0000-00 · Cuiabá,
            MT · contato@alicerce.com.br
          </p>
          <p>
            Encarregado de dados (DPO): <strong>[EXEMPLO]</strong> {ENCARREGADO_DE_DADOS}
          </p>
        </div>
      </div>
    </footer>
  );
}
