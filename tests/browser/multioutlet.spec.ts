import { test, expect } from "@playwright/test";
test("multi owner, penugasan kasir, pemilih outlet, keranjang terpisah, dan laporan gabungan", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(
    page.getByRole("heading", { name: "Setiap angka, punya cerita." }),
  ).toBeVisible();
  const picker = page.getByLabel("Pilih usaha dan outlet"),
    first = await picker.inputValue();
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
  await expect(page.locator(".cart-heading")).toContainText("1 item");
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
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
  expect(second).toBeTruthy();
  async function addUser(
    name: string,
    email: string,
    password: string,
    role: string,
  ) {
    await page.getByRole("button", { name: "Pengguna", exact: true }).click();
    await page.getByLabel("Nama pengguna", { exact: true }).fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.getByLabel("Peran", { exact: true }).selectOption(role);
  }
  await addUser(
    "Owner Bersama",
    "shared-owner@test.local",
    "OwnerBersama123!",
    "owner",
  );
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".team-member").filter({ hasText: "Owner Bersama" }),
  ).toContainText("Seluruh outlet usaha ini");
  await addUser(
    "Kasir Antang",
    "antang-cashier@test.local",
    "KasirAntang123!",
    "cashier",
  );
  await page
    .getByRole("checkbox", { name: "Outlet Makassar", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Outlet Antang Uji", exact: true })
    .check();
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".team-member").filter({ hasText: "Kasir Antang" }),
  ).toContainText("Outlet Antang Uji");
  await picker.selectOption(second!);
  await expect(picker).toHaveValue(second!);
  await page.getByRole("button", { name: "Kasir", exact: true }).click();
  await expect(page.locator(".cart-heading")).toContainText("0 item");
  await expect(
    page.getByRole("button", { name: /Kopi Susu Aren/ }),
  ).toBeDisabled();
  await picker.selectOption(first);
  await expect(picker).toHaveValue(first);
  await page.getByRole("button", { name: "Kasir", exact: true }).click();
  await expect(page.locator(".cart-heading")).toContainText("1 item");
  await page.getByRole("button", { name: "Laporan", exact: true }).click();
  await page.getByLabel("Cakupan laporan").selectOption("organization");
  await page.getByRole("button", { name: "Tampilkan laporan" }).click();
  await expect(page.locator(".report-intro")).toContainText(
    "Gabungan 2 outlet",
  );
  await page.getByRole("button", { name: "Keluar dari Omzetin" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("antang-cashier@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("KasirAntang123!");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(picker.locator("option")).toHaveCount(1);
  await expect(picker).toHaveValue(second!);
  await expect(
    page.getByRole("button", { name: "Pengaturan", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Keluar dari Omzetin" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("Email", { exact: true })
    .fill("shared-owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("OwnerBersama123!");
  await page.getByRole("button", { name: "Masuk ke Omzetin" }).click();
  await expect(picker.locator("option")).toHaveCount(2);
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await page.screenshot({
    path: ".local/multioutlet-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tambah usaha", exact: true }).click();
  await page
    .getByLabel("Nama usaha", { exact: true })
    .fill("Kedai Owner Kedua");
  await page
    .getByLabel("Nama outlet", { exact: true })
    .fill("Outlet Utama Kedua");
  await page.locator("input[name=capital]").fill("750000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(picker.locator("option")).toHaveCount(3);
  expect(errors).toEqual([]);
});
