import { expect, test } from "@playwright/test";

/**
 * Estes testes rodam sem as chaves do Supabase: cobrem as telas públicas e o
 * aviso de configuração que aparece no lugar de uma página de erro.
 */

test("a tela de entrar mostra os dois jeitos de acessar", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Entrar no Alicerce" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receber um link de acesso por e-mail" }),
  ).toBeVisible();
});

test("o cadastro valida e-mail e senha antes de enviar", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByLabel("E-mail").fill("nao-e-email");
  await page.getByLabel("Senha", { exact: true }).fill("123");
  await page.getByRole("button", { name: /Criar conta/ }).click();

  await expect(page.getByText("Digite um e-mail válido.")).toBeVisible();
  await expect(page.getByText("A senha precisa de pelo menos 8 caracteres.")).toBeVisible();
});

test("a política de privacidade diz quem é controlador e quem é operador", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de privacidade" })).toBeVisible();
  await expect(page.getByText(/é operador/)).toBeVisible();
  await expect(page.getByText(/não é prontuário eletrônico/)).toBeVisible();
});

test("sem as chaves do Supabase, o sistema explica o que configurar", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("Falta ligar o banco de dados")).toBeVisible();
  await expect(page.getByText(/South America \(São Paulo\)/)).toBeVisible();
});
