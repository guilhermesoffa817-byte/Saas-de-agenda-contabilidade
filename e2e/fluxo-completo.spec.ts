import { expect, test } from "@playwright/test";

/**
 * O caminho inteiro, do zero ao relatório: cadastro → onboarding → agendamento
 * pelo link público → concluir com pagamento → fechar o mês → exportar.
 *
 * Precisa de um Supabase de verdade (as chaves no .env.local) porque cada passo
 * grava no banco. Sem as chaves, o teste é pulado com um aviso claro em vez de
 * falhar por um motivo que não é culpa do código.
 */
const temSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

test.describe("fluxo completo", () => {
  test.skip(
    !temSupabase,
    "Precisa das chaves do Supabase no .env.local (NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
  );

  // Cada execução cria a própria empresa, para os testes não colidirem.
  const marca = Date.now().toString(36);
  const email = `teste.${marca}@exemplo.com.br`;
  const senha = "alicerce-teste-2026";
  const slug = `studio-teste-${marca}`;

  test("do cadastro ao relatório exportado", async ({ page }) => {
    test.setTimeout(180_000);

    await test.step("cadastro", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome").fill("Ana Ribeiro");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha", { exact: true }).fill(senha);
      await page.getByRole("button", { name: "Criar conta" }).click();
      // Com confirmação de e-mail ligada, a pessoa cai no aviso; sem ela, no onboarding.
      await page.waitForURL(/\/(comecar|cadastro|entrar)/, { timeout: 30_000 });
    });

    await test.step("onboarding em cinco passos", async () => {
      if (!page.url().includes("/comecar")) {
        await page.goto("/entrar");
        await page.getByLabel("E-mail").fill(email);
        await page.getByLabel("Senha", { exact: true }).fill(senha);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.waitForURL(/\/(comecar|app)/, { timeout: 30_000 });
      }
      if (!page.url().includes("/comecar")) return;

      await page.getByLabel("Nome do negócio").fill("Studio Ana Ribeiro");
      const campoSlug = page.getByLabel(/link|endereço/i).first();
      if (await campoSlug.isVisible().catch(() => false)) await campoSlug.fill(slug);
      await page.getByRole("button", { name: /Continuar|Próximo/ }).first().click();

      // Os passos seguintes já vêm preenchidos com padrões bons: seguir em frente.
      for (let passo = 0; passo < 4; passo += 1) {
        const seguir = page.getByRole("button", { name: /Continuar|Próximo|Concluir|Começar/ }).first();
        if (!(await seguir.isVisible().catch(() => false))) break;
        await seguir.click();
        await page.waitForTimeout(600);
      }
      await page.waitForURL(/\/app/, { timeout: 30_000 });
    });

    await test.step("agendamento pelo link público", async () => {
      await page.goto(`/agendar/${slug}`);
      await expect(page.getByRole("heading").first()).toBeVisible();

      // Escolhe o primeiro serviço, o primeiro profissional e o primeiro horário livre.
      await page.getByRole("button").filter({ hasText: /R\$/ }).first().click();
      await page.waitForTimeout(500);
      const profissional = page.getByRole("button").filter({ hasText: /Ana|Qualquer/ }).first();
      if (await profissional.isVisible().catch(() => false)) await profissional.click();
      await page.waitForTimeout(800);

      const horario = page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
      await expect(horario).toBeVisible({ timeout: 20_000 });
      await horario.click();

      await page.getByLabel(/Nome/).first().fill("Marina Alves");
      await page.getByLabel(/WhatsApp|Telefone/).first().fill("65999990001");
      await page.getByRole("button", { name: /Confirmar|Agendar/ }).first().click();

      await expect(page.getByText(/confirmad|marcad/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step("concluir o atendimento com pagamento", async () => {
      await page.goto("/app/agenda");
      const atendimento = page.getByText("Marina Alves").first();
      await expect(atendimento).toBeVisible({ timeout: 20_000 });
      await atendimento.click();

      const concluir = page.getByRole("button", { name: /Concluir/ }).first();
      await expect(concluir).toBeVisible({ timeout: 10_000 });
      await concluir.click();

      const registrar = page.getByRole("button", { name: /Registrar|Confirmar/ }).first();
      if (await registrar.isVisible().catch(() => false)) await registrar.click();
      await page.waitForTimeout(1500);
    });

    await test.step("o recebimento aparece no financeiro", async () => {
      await page.goto("/app/financeiro");
      await expect(page.getByText(/Entrou/).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/R\$/).first()).toBeVisible();
    });

    await test.step("fechar o mês", async () => {
      await page.goto("/app/financeiro/fechamento");
      const fechar = page.getByRole("button", { name: /Fechar o mês|Fechar mês/ }).first();
      if (await fechar.isVisible().catch(() => false)) {
        await fechar.click();
        const confirmar = page.getByRole("button", { name: /Fechar|Confirmar/ }).last();
        if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
        await expect(page.getByText(/Fechado/i).first()).toBeVisible({ timeout: 30_000 });
      }
    });

    await test.step("exportar o relatório", async () => {
      await page.goto("/app/relatorios");
      const baixar = page.getByRole("link", { name: /PDF|Excel|CSV/ }).first();
      await expect(baixar).toBeVisible({ timeout: 20_000 });

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        baixar.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.(pdf|xlsx|csv)$/);
    });
  });
});
