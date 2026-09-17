"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { entrarComLink, entrarComSenha } from "@/app/(auth)/acoes";
import { CampoSenha } from "@/components/app/campo-senha";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { esquemaEntrar, type EntrarInput } from "@/lib/validacao/auth";

export function FormularioEntrar({ voltar }: { voltar?: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [enviandoLink, setEnviandoLink] = useState(false);

  const form = useForm<EntrarInput>({
    resolver: zodResolver(esquemaEntrar),
    defaultValues: { email: "", senha: "" },
  });

  function enviar(valores: EntrarInput) {
    setErro(null);
    iniciar(async () => {
      const resposta = await entrarComSenha(valores, voltar);
      if (resposta?.erro) setErro(resposta.erro);
    });
  }

  async function pedirLink() {
    const email = form.getValues("email");
    const valido = await form.trigger("email");
    if (!valido) return;

    setErro(null);
    setEnviandoLink(true);
    const resposta = await entrarComLink({ email }, voltar);
    setEnviandoLink(false);
    if (resposta?.erro) setErro(resposta.erro);
    if (resposta?.aviso) toast.success(resposta.aviso);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-5" noValidate>
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@seunegocio.com.br"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="senha"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-baseline justify-between gap-3">
                <FormLabel>Senha</FormLabel>
                <Link
                  href="/recuperar-senha"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <FormControl>
                <CampoSenha {...field} autoComplete="current-password" placeholder="Sua senha" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={enviando || enviandoLink} className="w-full">
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Entrar
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={enviando || enviandoLink}
          onClick={pedirLink}
        >
          {enviandoLink ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
          Receber um link de acesso por e-mail
        </Button>
      </form>
    </Form>
  );
}
