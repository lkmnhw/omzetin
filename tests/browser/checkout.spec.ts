import { test, expect } from "@playwright/test";
test("kasir: shift, pembayaran, rekap, laporan dan layout ponsel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(page.getByRole("heading", { name: "Kasir." })).toBeVisible();
  await page.getByRole("button", { name: "Buka shift", exact: true }).click();
  await page.locator("input[name=opening]").fill("100000");
  await page.getByLabel("Nama shift").selectOption("Shift 1");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Kopi Susu Aren/ }).click();
  await page.getByRole("button", { name: "Lanjut pembayaran" }).click();
  await page.locator("input[name=tendered]").fill("50000");
  await page.getByLabel("Diskon pesanan", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Konfirmasi pembayaran" }).click();
  await expect(
    page.getByRole("heading", { name: "Detail pesanan" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Rp 27.000");
  await page.screenshot({ path: ".local/receipt-checked.png" });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("button", { name: /^Pesanan/ }).click();
  await page
    .getByRole("button", { name: "Serahkan", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Serahkan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Kasir", exact: true }).click();
  await page
    .getByRole("button", { name: "Shift aktif · tutup shift", exact: true })
    .click();
  await page.locator("input[name=counted]").fill("123000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rekap & pengajuan", exact: true })
    .click();
  await expect(page.locator(".core-doc-list")).toContainText("Shift 1");
  await expect(page.locator(".core-doc-list")).toContainText(
    "Menunggu approval",
  );
  await page
    .getByRole("button", { name: "Aplikasi Manager", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Periksa", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Simpan pemeriksaan" }).click();
  await expect(page.locator(".core-doc-list")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Aplikasi Laporan", exact: true })
    .click();
  await page.getByRole("button", { name: "Tampilkan draft" }).click();
  await expect(page.locator(".core-report")).toContainText("Rp 23.000");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor CSV" }).click();
  expect((await download).suggestedFilename()).toContain("omzetin-");
  await page.screenshot({
    path: ".local/desktop-report-checked.png",
    fullPage: true,
  });
  for (const size of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: ".local/mobile-report-checked.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Aplikasi Kasir", exact: true })
    .click();
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
