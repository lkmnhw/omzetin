import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("approval kasir, final platform, laporan terbit, dividen dan akses investor", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  async function post(path: string, body: any) {
    const r = await page.request.post("/api" + path, {
      data: body,
      headers: {
        Origin: "http://127.0.0.1:5174",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(r.status(), await r.text()).toBe(path === "/register" ? 201 : 200);
    return r.json();
  }
  await post("/register", {
    name: "Warung Alur Inti",
    outlet: "Outlet Pusat",
    owner: "Management Inti",
    email: "core-owner@browser.local",
    password: "IntiPassword123!",
    timezone: "Asia/Makassar",
    capital: 100000,
  });
  const state = await (await page.request.get("/api/state")).json();
  const employee = await post("/core/members", {
    name: "Karyawan Inti",
    email: "core-employee@browser.local",
    password: "IntiPassword123!",
    role: "employee",
    outletIds: [state.business.id],
  });
  const investor = await post("/core/members", {
    name: "Investor Inti",
    email: "core-investor@browser.local",
    password: "IntiPassword123!",
    role: "investor",
  });
  await post("/logout", {});
  await page.reload();
  async function login(email: string) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Kata sandi", { exact: true })
      .fill("IntiPassword123!");
    await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
    await expect(
      page.getByRole("button", { name: "Keluar akun" }),
    ).toBeVisible();
  }
  await login("core-employee@browser.local");
  await expect(
    page.getByRole("button", { name: "Aplikasi Manager", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Absensi", exact: true }).click();
  await page.getByRole("button", { name: "Absen masuk", exact: true }).click();
  await expect(page.locator(".core-table-wrap")).toContainText("Karyawan Inti");
  await page.getByRole("button", { name: "Absen pulang", exact: true }).click();
  await page.getByRole("button", { name: "Rekap & pengajuan" }).click();
  await page
    .getByRole("button", { name: "Catat pengeluaran", exact: true })
    .click();
  await page.getByLabel("Nominal kotor / pengeluaran").fill("10000");
  await page
    .getByLabel("Keterangan", { exact: true })
    .fill("Belanja bahan inti");
  await page
    .getByRole("button", { name: "Simpan & ajukan", exact: true })
    .click();
  await expect(page.locator(".core-doc-list")).toContainText(
    "Menunggu approval",
  );
  await page.getByRole("button", { name: "Keluar akun" }).click();
  await login("core-owner@browser.local");
  await page
    .getByRole("button", { name: "Aplikasi Manager", exact: true })
    .click();
  await page.getByRole("button", { name: "Periksa", exact: true }).click();
  await page.getByRole("button", { name: "Simpan pemeriksaan" }).click();
  await expect(page.locator(".core-doc-list")).toHaveCount(0);
  await page.getByRole("button", { name: "Pendapatan", exact: true }).click();
  await page
    .getByRole("button", { name: "Catat pendapatan", exact: true })
    .click();
  await page.getByLabel("Nominal kotor / pengeluaran").fill("100000");
  await page.getByLabel("Kanal pendapatan").selectOption("gojek");
  await page.getByLabel("Referensi transaksi").fill("GOJEK-INTI-001");
  await page
    .getByLabel("Keterangan", { exact: true })
    .fill("Pendapatan Gojek eksternal");
  await page
    .getByRole("button", { name: "Simpan & ajukan", exact: true })
    .click();
  await expect(page.locator(".core-doc-list")).toContainText("Disetujui");
  await page
    .getByRole("button", { name: "Catat pencairan", exact: true })
    .click();
  await page.getByLabel("Final bersih diterima").fill("80000");
  await page.getByLabel("Referensi pencairan").fill("SETTLEMENT-INTI-001");
  await page
    .getByRole("button", { name: "Simpan pencairan", exact: true })
    .click();
  await expect(page.locator(".core-doc-list")).toContainText("Rp 80.000");
  await page.getByRole("button", { name: "Catat refund", exact: true }).click();
  await page.getByLabel("Nominal refund").fill("5000");
  await page.getByLabel("Referensi refund").fill("REFUND-INTI-001");
  await page.getByLabel("Alasan refund").fill("Refund pelanggan");
  await page
    .getByRole("button", { name: "Simpan refund", exact: true })
    .click();
  await expect(page.locator(".core-doc-list")).toContainText(
    "Refund pelanggan",
  );
  await page
    .getByRole("button", { name: "Aplikasi Laporan", exact: true })
    .click();
  await page.getByRole("button", { name: "Tampilkan draft" }).click();
  await expect(page.locator(".core-report")).toContainText("Rp 65.000");
  await expect(
    page.locator(".core-report tbody tr").filter({ hasText: "Gojek" }),
  ).toContainText("Rp 5.000");
  await page
    .getByRole("button", { name: "Publikasikan laporan", exact: true })
    .click();
  await expect(page.locator(".core-report")).toContainText("LAPORAN TERBIT");
  await page.getByLabel("Total dividen dibagikan").fill("60000");
  await page.getByLabel("Management Inti · Management (%)").fill("100");
  await page.getByLabel("Investor Inti · Investor (%)").fill("100");
  await page
    .getByRole("button", { name: "Tetapkan pembagian dividen" })
    .click();
  await expect(page.locator(".core-dividends")).toContainText("Rp 30.000");
  await page
    .locator(".core-dividends tr")
    .filter({ hasText: "Investor Inti" })
    .getByRole("button", { name: "Catat pembayaran" })
    .click();
  await page.getByLabel("Nominal pembayaran dividen").fill("10000");
  await page
    .getByLabel("Referensi pembayaran dividen")
    .fill("DIVIDEN-INTI-001");
  await page.getByRole("button", { name: "Simpan pembayaran dividen" }).click();
  await expect(page.locator(".core-dividends")).toContainText(
    "Sebagian dibayar",
  );
  await page.screenshot({
    path: ".local/core-dividend-checked.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keluar akun" }).click();
  await login("core-investor@browser.local");
  await expect(
    page.getByRole("button", { name: "Tampilkan draft" }),
  ).toHaveCount(0);
  await page.locator(".core-published-list button").first().click();
  await expect(page.locator(".core-dividends")).toContainText("Investor Inti");
  await expect(page.locator(".core-dividends")).not.toContainText(
    "Management Inti",
  );
  await expect(
    page.getByRole("button", { name: "Catat pembayaran" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publikasikan laporan" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor CSV", exact: true }).click();
  const csv = await csvDownload;
  await csv.saveAs(".local/investor-report.csv");
  const exported = await readFile(".local/investor-report.csv", "utf8");
  expect(exported).toContain("Dividen Investor Inti");
  expect(exported).not.toContain("Management Inti");
  expect(exported).toContain("Dibayar DIVIDEN-INTI-001");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/investor-mobile-checked.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".core-report")).toBeVisible();
  await expect(page.locator(".core-dividends")).toBeVisible();
  await page.screenshot({
    path: ".local/report-print-checked.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});
