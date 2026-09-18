"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MUITAS_TENTATIVAS, podeTentar } from "@/lib/limite-de-tentativas";
import { mensagemDeErro } from "@/lib/supabase/erros";
import { COOKIE_EMPRESA } from "@/lib/supabase/sessao";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoSite } from "@/lib/url";
import {
  esquemaCadastro,
  esquemaEntrar,
  esquemaNovaSenha,
  esquemaSoEmail,
  type CadastroInput,
  type EntrarInput,
  type NovaSenhaInput,
  type SoEmailInput,
} from "@/lib/validacao/auth";

export type Resposta = { erro?: string; aviso?: string };

const DADOS_INVALIDOS: Resposta = { erro: "Confira os dados digitados." };

/** Só aceita caminhos internos como destino depois do login. */
function destinoSeguro(voltar?: string) {
  if (!voltar || !voltar.startsWith("/") || voltar.startsWith("//")) return "/app";
  return voltar;
}

export async function entrarComSenha(dados: EntrarInput, voltar?: string): Promise<Resposta> {
  const validado = esquemaEntrar.safeParse(dados);
  if (!validado.success) return DADOS_INVALIDOS;

  if (!(await podeTentar("entrar", validado.data.email))) return { erro: MUITAS_TENTATIVAS };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: validado.data.email,
    password: validado.data.senha,
  });
  if (error) return { erro: mensagemDeErro(error) };

  redirect(destinoSeguro(voltar));
}

export async function entrarComLink(dados: SoEmailInput, voltar?: string): Promise<Resposta> {
  const validado = esquemaSoEmail.safeParse(dados);
  if (!validado.success) return DADOS_INVALIDOS;

  if (!(await podeTentar("entrar", validado.data.email))) return { erro: MUITAS_TENTATIVAS };

  const supabase = await createClient();
  const destino = new URL("/auth/confirmar", await enderecoDoSite());
  destino.searchParams.set("voltar", destinoSeguro(voltar));

  const { error } = await supabase.auth.signInWithOtp({
    email: validado.data.email,
    options: { emailRedirectTo: destino.toString(), shouldCreateUser: false },
  });
  if (error) return { erro: mensagemDeErro(error) };

  return { aviso: "Enviamos um link de acesso para o seu e-mail. Ele vale por 1 hora." };
}

export async function cadastrar(dados: CadastroInput): Promise<Resposta> {
  const validado = esquemaCadastro.safeParse(dados);
  if (!validado.success) return DADOS_INVALIDOS;

  if (!(await podeTentar("cadastro", validado.data.email))) return { erro: MUITAS_TENTATIVAS };

  const supabase = await createClient();
  const destino = new URL("/auth/confirmar", await enderecoDoSite());
  destino.searchParams.set("voltar", "/app/comecar");

  const { data, error } = await supabase.auth.signUp({
    email: validado.data.email,
    password: validado.data.senha,
    options: {
      data: { nome: validado.data.nome },
      emailRedirectTo: destino.toString(),
    },
  });
  if (error) return { erro: mensagemDeErro(error) };

  // Quando a confirmação de e-mail está ligada no Supabase, ainda não há sessão.
  if (!data.session) {
    return {
      aviso: "Conta criada. Confirme seu e-mail pelo link que acabamos de enviar para entrar.",
    };
  }

  redirect("/app/comecar");
}

export async function pedirRecuperacaoDeSenha(dados: SoEmailInput): Promise<Resposta> {
  const validado = esquemaSoEmail.safeParse(dados);
  if (!validado.success) return DADOS_INVALIDOS;

  // Passou do limite? A resposta é a mesma de sempre: quem está tentando
  // descobrir quais e-mails têm conta não aprende nada aqui.
  if (!(await podeTentar("recuperar", validado.data.email))) {
    return {
      aviso:
        "Se existir uma conta com esse e-mail, o link para criar uma nova senha chega em instantes.",
    };
  }

  const supabase = await createClient();
  const destino = new URL("/auth/confirmar", await enderecoDoSite());
  destino.searchParams.set("voltar", "/nova-senha");

  const { error } = await supabase.auth.resetPasswordForEmail(validado.data.email, {
    redirectTo: destino.toString(),
  });
  if (error) return { erro: mensagemDeErro(error) };

  return {
    aviso: "Se existir uma conta com esse e-mail, o link para criar uma nova senha chega em instantes.",
  };
}

export async function definirNovaSenha(dados: NovaSenhaInput): Promise<Resposta> {
  const validado = esquemaNovaSenha.safeParse(dados);
  if (!validado.success) return DADOS_INVALIDOS;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "O link expirou. Peça um novo e-mail de recuperação." };

  const { error } = await supabase.auth.updateUser({ password: validado.data.senha });
  if (error) return { erro: mensagemDeErro(error) };

  redirect("/app");
}

export async function aceitarConvite(token: string): Promise<Resposta> {
  const supabase = await createClient();
  const { data: empresaId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) return { erro: error.message };

  const { data: membro } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", empresaId)
    .maybeSingle();

  // Deixa a empresa recém-aceita selecionada no seletor do topo.
  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(membro?.role === "contador" ? "/contador" : "/app");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
