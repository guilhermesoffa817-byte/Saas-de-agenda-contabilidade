import { expect, test } from "@playwright/test";

test("a página inicial abre em português e mostra a marca", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByText("Alicerce", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Agenda e financeiro");
});

test("o botão de tema alterna entre claro e escuro", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Alternar entre tema claro e escuro" }).click();
  await expect(html).toHaveClass(/dark/);
});
