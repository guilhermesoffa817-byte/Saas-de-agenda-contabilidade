"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { pedirRecuperacaoDeSenha } from "@/app/(auth)/acoes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { esquemaSoEmail, type SoEmailInput } from "@/lib/validacao/auth";

export function FormularioRecuperarSenha() {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const form = useForm<SoEmailInput>({
    resolver: zodResolver(esquemaSoEmail),
    defaultValues: { email: "" },
  });

  function enviar(valores: SoEmailInput) {
    setErro(null);
    iniciar(async () => {
      const resposta = await pedirRecuperacaoDeSenha(valores);
      if (resposta?.erro) setErro(resposta.erro);
      if (resposta?.aviso) setAviso(resposta.aviso);
    });
  }

  if (aviso) {
    return (
      <Alert>
        <CheckCircle2 aria-hidden />
        <AlertTitle>E-mail enviado</AlertTitle>
        <AlertDescription>{aviso}</AlertDescription>
      </Alert>
    );
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
              <FormLabel>E-mail da conta</FormLabel>
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

        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Enviar link para criar nova senha
        </Button>
      </form>
    </Form>
  );
}
