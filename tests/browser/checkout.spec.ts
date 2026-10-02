import { test, expect } from "@playwright/test";
test("login, shift, bayar, serahkan, laporan, dan layout ponsel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(
    page.getByRole("heading", { name: "Setiap angka, punya cerita." }),
  ).toBeVisible();
  // Repeated runs continue the isolated demo database rather than touching local business data.
  await page.getByRole("button", { name: "Kasir", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "Buka shift", exact: true })
      .isVisible()
  ) {
    await page.getByRole("button", { name: "Buka shift", exact: true }).click();
    await page.locator("input[name=opening]").fill("100000");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: /Kopi Susu Aren/ }).click();
  await page.getByRole("button", { name: "Lanjut pembayaran" }).click();
  await page.locator("input[name=tendered]").fill("50000");
  await page.getByLabel("Diskon pesanan", { exact: true }).fill("1000");
  expect(await page.locator("input[name=tendered]").inputValue()).toBe("50000");
  await page.getByRole("button", { name: "Konfirmasi pembayaran" }).click();
  await expect(
    page.getByRole("heading", { name: "Detail pesanan" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Rp 27.000");
  await page.screenshot({ path: ".local/receipt-checked.png" });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /^Pesanan/ })
    .click();
  await page
    .getByRole("button", { name: "Serahkan", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Serahkan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Laporan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hasil usaha tercatat" }),
  ).toBeVisible();
  await expect(page.locator(".profit-report")).toContainText("Rp 5.860");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor CSV" }).click();
  expect((await download).suggestedFilename()).toContain("omzetin-laporan");
  for (const name of [
    "Persediaan",
    "Keuangan",
    "Menu & resep",
    "Pengaturan",
    "Ringkasan",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("main")).toBeVisible();
  }
  await page.screenshot({ path: ".local/desktop-checked.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/mobile-checked.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Kasir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Lanjut pembayaran" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/mobile-pos-checked.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
