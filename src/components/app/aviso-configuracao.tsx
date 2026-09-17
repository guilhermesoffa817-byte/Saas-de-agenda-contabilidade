import { KeyRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Tela mostrada quando as chaves do Supabase ainda não estão no .env.local.
 * Evita a página de erro e explica, em português, o que falta fazer.
 */
export function AvisoConfiguracao() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <Alert>
        <KeyRound aria-hidden />
        <AlertTitle>Falta ligar o banco de dados</AlertTitle>
        <AlertDescription>
          O sistema já está pronto, mas ainda não sabe onde guardar os dados.
        </AlertDescription>
      </Alert>

      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3">
          <span className="font-mono text-muted-foreground">1.</span>
          <span>
            Crie uma conta em <strong>supabase.com</strong> e um projeto novo. Na pergunta da região,
            escolha <strong>South America (São Paulo)</strong> — é o que deixa o sistema rápido no
            Brasil e mantém os dados no país.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-muted-foreground">2.</span>
          <span>
            No painel do projeto, abra <strong>Project Settings → API Keys</strong> e copie a URL do
            projeto, a chave pública (<em>publishable</em>) e a chave secreta (<em>secret</em>).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-muted-foreground">3.</span>
          <span>
            Na pasta do projeto, copie o arquivo <code className="font-mono">.env.example</code> para{" "}
            <code className="font-mono">.env.local</code> e preencha:
            <code className="mt-2 block rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              NEXT_PUBLIC_SUPABASE_URL=
              <br />
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
              <br />
              SUPABASE_SECRET_KEY=
            </code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-muted-foreground">4.</span>
          <span>
            Aplique as tabelas no banco com{" "}
            <code className="font-mono">npx supabase link</code> e depois{" "}
            <code className="font-mono">npm run db:push</code>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-muted-foreground">5.</span>
          <span>
            Pare e rode de novo <code className="font-mono">npm run dev</code>. Esta tela desaparece.
          </span>
        </li>
      </ol>

      <p className="text-xs text-muted-foreground">
        A chave secreta nunca leva o prefixo <code className="font-mono">NEXT_PUBLIC</code> e nunca vai
        para o navegador.
      </p>
    </div>
  );
}
