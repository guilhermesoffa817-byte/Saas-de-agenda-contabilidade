import { expect, test } from "@playwright/test";

test("a página de vendas abre em português e mostra a promessa", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("link", { name: "Alicerce", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sua agenda cheia");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("financeiro em ordem");
});

test("a página de vendas tem uma chamada única e a linha de confiança", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Testar 7 dias grátis" }).first()).toBeVisible();
  await expect(page.getByText("Sem cartão de crédito").first()).toBeVisible();
  await expect(page.getByText("Cancele quando quiser").first()).toBeVisible();
});

test("a página de vendas não rola de lado no celular", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBe(375);
});

test("o botão de tema alterna entre claro e escuro", async ({ page }) => {
  await page.goto("/entrar");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Alternar entre tema claro e escuro" }).click();
  await expect(html).toHaveClass(/dark/);
});
