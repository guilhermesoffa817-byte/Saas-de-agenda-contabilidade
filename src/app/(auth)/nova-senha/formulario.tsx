"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { definirNovaSenha } from "@/app/(auth)/acoes";
import { CampoSenha } from "@/components/app/campo-senha";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { esquemaNovaSenha, type NovaSenhaInput } from "@/lib/validacao/auth";

export function FormularioNovaSenha() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const form = useForm<NovaSenhaInput>({
    resolver: zodResolver(esquemaNovaSenha),
    defaultValues: { senha: "", confirmacao: "" },
  });

  function enviar(valores: NovaSenhaInput) {
    setErro(null);
    iniciar(async () => {
      const resposta = await definirNovaSenha(valores);
      if (resposta?.erro) setErro(resposta.erro);
    });
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
          name="senha"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <CampoSenha {...field} autoComplete="new-password" placeholder="Nova senha" />
              </FormControl>
              <FormDescription>Pelo menos 8 caracteres.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repita a nova senha</FormLabel>
              <FormControl>
                <CampoSenha {...field} autoComplete="new-password" placeholder="Repita a senha" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar nova senha
        </Button>
      </form>
    </Form>
  );
}
