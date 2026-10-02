import { test, expect } from "@playwright/test";
test("multi bisnis, multi management, penugasan outlet, dan keranjang terpisah", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(page.getByRole("heading", { name: "Kasir." })).toBeVisible();
  const picker = page.getByLabel("Pilih bisnis dan outlet"),
    first = await picker.inputValue();
  await page.getByRole("button", { name: "Buka shift", exact: true }).click();
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Kopi Susu Aren/ }).click();
  await expect(page.locator(".cart-heading")).toContainText("1 item");
  await page
    .getByRole("button", { name: "Aplikasi Manager", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bisnis & outlet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tambah outlet", exact: true })
    .click();
  await page
    .getByLabel("Nama outlet", { exact: true })
    .fill("Outlet Antang Uji");
  await page.locator("input[name=capital]").fill("250000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(picker.locator("option")).toHaveCount(2);
  const second = await picker
    .locator("option")
    .filter({ hasText: "Outlet Antang Uji" })
    .getAttribute("value");
  await page.getByRole("button", { name: "Tim & akses", exact: true }).click();
  async function add(name: string, email: string, role: string) {
    await page.getByRole("button", { name: "Tambah anggota" }).click();
    await page.getByLabel("Nama anggota").fill(name);
    await page.getByLabel("Email anggota").fill(email);
    await page.getByLabel("Password akun baru").fill("AnggotaTest123!");
    await page.getByLabel("Peran anggota").selectOption(role);
  }
  await add("Management Bersama", "shared-owner@test.local", "management");
  await page.getByRole("button", { name: "Simpan anggota" }).click();
  await expect(page.locator(".core-table-wrap")).toContainText(
    "Management Bersama",
  );
  await add("Kasir Antang", "antang-cashier@test.local", "employee");
  await page
    .getByRole("checkbox", { name: "Outlet Antang Uji", exact: true })
    .check();
  await page.getByRole("button", { name: "Simpan anggota" }).click();
  await expect(page.locator(".core-table-wrap")).toContainText("Kasir Antang");
  await picker.selectOption(second!);
  await page
    .getByRole("button", { name: "Aplikasi Kasir", exact: true })
    .click();
  await expect(page.locator(".cart-heading")).toContainText("0 item");
  await expect(
    page.getByRole("button", { name: /Kopi Susu Aren/ }),
  ).toBeDisabled();
  await picker.selectOption(first);
  await expect(page.locator(".cart-heading")).toContainText("1 item");
  await page
    .getByRole("button", { name: "Aplikasi Laporan", exact: true })
    .click();
  await page.getByRole("button", { name: "Tampilkan draft" }).click();
  await expect(page.locator(".core-report")).toContainText("Outlet Antang Uji");
  await page.getByRole("button", { name: "Keluar akun" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("antang-cashier@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("AnggotaTest123!");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(picker.locator("option")).toHaveCount(1);
  await expect(picker).toHaveValue(second!);
  await expect(
    page.getByRole("button", { name: "Aplikasi Manager", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Aplikasi Laporan", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Keluar akun" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("Email", { exact: true })
    .fill("shared-owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("AnggotaTest123!");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(picker.locator("option")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Aplikasi Manager", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bisnis & outlet", exact: true })
    .click();
  await page.getByRole("button", { name: "Tambah usaha", exact: true }).click();
  await page.getByLabel("Nama usaha", { exact: true }).fill("Kedai Kedua");
  await page.getByLabel("Nama outlet", { exact: true }).fill("Outlet Kedua");
  await page.locator("input[name=capital]").fill("750000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(picker.locator("option")).toHaveCount(3);
  expect(errors).toEqual([]);
});
