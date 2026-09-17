"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { cadastrar } from "@/app/(auth)/acoes";
import { CampoSenha } from "@/components/app/campo-senha";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { esquemaCadastro, type CadastroInput } from "@/lib/validacao/auth";

export function FormularioCadastro() {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const form = useForm<CadastroInput>({
    resolver: zodResolver(esquemaCadastro),
    defaultValues: { nome: "", email: "", senha: "" },
  });

  function enviar(valores: CadastroInput) {
    setErro(null);
    iniciar(async () => {
      const resposta = await cadastrar(valores);
      if (resposta?.erro) setErro(resposta.erro);
      if (resposta?.aviso) setAviso(resposta.aviso);
    });
  }

  if (aviso) {
    return (
      <Alert>
        <CheckCircle2 aria-hidden />
        <AlertTitle>Falta um passo</AlertTitle>
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
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="name" placeholder="Ana Ribeiro" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <CampoSenha {...field} autoComplete="new-password" placeholder="Crie uma senha" />
              </FormControl>
              <FormDescription>Pelo menos 8 caracteres.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Criar conta e começar o teste grátis
        </Button>

        <p className="text-xs text-muted-foreground">
          7 dias grátis, sem cartão de crédito. Ao criar a conta você aceita os termos de uso e a
          política de privacidade do Alicerce.
        </p>
      </form>
    </Form>
  );
}
