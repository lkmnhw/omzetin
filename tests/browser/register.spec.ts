import { test, expect } from "@playwright/test";
test("owner mendaftar tanpa kunci setup dan mendapat bisnis sendiri", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Belum punya akun? Daftar" }).click();
  await expect(
    page.getByRole("heading", { name: "Daftar & mulai usahamu" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Nama usaha").fill("Kedai Pendaftaran");
  await page.getByLabel("Nama outlet").fill("Outlet Pertama");
  await page.getByLabel("Nama pemilik").fill("Owner Pendaftar");
  await page.getByLabel("Email", { exact: true }).fill("daftar@example.com");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("OwnerPassword123!");
  await page.getByLabel("Konfirmasi kata sandi").fill("OwnerPassword123!");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Buat usaha & masuk" }).click();
  await expect(
    page.getByRole("heading", { name: "Daftar & mulai usahamu" }),
  ).not.toBeVisible();
  const state = await page.request.get("/api/state");
  const data = await state.json();
  expect(data.user.email).toBe("daftar@example.com");
  expect(data.outlets).toHaveLength(1);
  expect(data.products).toHaveLength(0);
});
