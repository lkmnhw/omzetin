import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { schema } from "../src/server/schema";
import { localDatabase } from "../src/server/db";
import { seedDemo, createBusiness } from "../src/server/seed";
import { createApp } from "../src/server/app";
import { passwordHash } from "../src/server/security";
import { uid, businessDay } from "../src/server/domain";

const pg = new PGlite({ extensions: { pgcrypto } }),
  db = localDatabase(pg),
  app = createApp(db, { demo: true });
let cookie = "",
  state: any;
async function request(
  path: string,
  input?: any,
  key = uid(),
  session = cookie,
  origin = "http://localhost",
) {
  const response = await app.request(`http://localhost/api${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      ...(session ? { Cookie: session } : {}),
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  return {
    status: response.status,
    data: (await response.json()) as any,
    response,
  };
}
async function current() {
  return (await request("/state")).data;
}
async function open() {
  expect((await request("/shifts/open", { opening: 100000 })).status).toBe(200);
}
function order(extra: any = {}) {
  return {
    items: [
      {
        productId: state.products.find((p: any) => p.name === "Kopi Susu Aren")
          .id,
        quantity: 1,
      },
    ],
    discount: 0,
    paymentMethod: "cash",
    tendered: 50000,
    reference: "",
    service: "takeaway",
    note: "Uji transaksi",
    ...extra,
  };
}
const balance = (s: any, a: string) =>
  Number(s.balances.find((b: any) => b.account === a)?.balance || 0);
beforeAll(async () => {
  await pg.exec(schema);
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE businesses CASCADE; TRUNCATE login_attempts");
  await seedDemo(db);
  const login = await request(
    "/login",
    { email: "demo@omzetin.local", password: "OmzetinDemo123!" },
    uid(),
    "",
  );
  expect(login.status).toBe(200);
  cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  state = await current();
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("Integritas transaksi Omzetin", () => {
  it("menolak kata sandi salah, akun tidak dikenal, dan sesi tanpa cookie", async () => {
    expect(
      (
        await request(
          "/login",
          { email: "demo@omzetin.local", password: "SalahBanget123!" },
          uid(),
          "",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/login",
          { email: "unknown@test.local", password: "SalahBanget123!" },
          uid(),
          "",
        )
      ).status,
    ).toBe(401);
    expect((await request("/state", undefined, uid(), "")).status).toBe(401);
  });
  it("mengakui pembayaran sebagai uang muka, lalu penjualan dan HPP ketika diserahkan", async () => {
    await open();
    const paid = await request("/orders", order());
    expect(paid.status).toBe(200);
    expect(Number(paid.data.change)).toBe(26000);
    let s = await current();
    expect(balance(s, "cash")).toBe(124000);
    expect(balance(s, "advance")).toBe(-24000);
    expect(balance(s, "sales")).toBe(0);
    expect(
      s.ingredients.find((i: any) => i.name === "Biji kopi").reserved,
    ).toBe("18.000000");
    expect((await request(`/orders/${paid.data.id}/fulfill`, {})).status).toBe(
      200,
    );
    s = await current();
    expect(balance(s, "sales")).toBe(-24000);
    expect(balance(s, "advance")).toBe(0);
    expect(balance(s, "cogs")).toBe(5860);
    expect(
      s.ingredients.find((i: any) => i.name === "Biji kopi").quantity,
    ).toBe("2982.000000");
    expect(s.ingredients.every((i: any) => Number(i.reserved) === 0)).toBe(
      true,
    );
    expect(balance(s, "inventory")).toBe(960000 - 5860);
    expect(
      s.balances.reduce((sum: number, b: any) => sum + Number(b.balance), 0),
    ).toBe(0);
  });
  it("mengembalikan respons yang sama untuk retry dan menolak pemakaian kunci untuk payload lain", async () => {
    await open();
    const key = uid(),
      input = order();
    const a = await request("/orders", input, key),
      b = await request("/orders", input, key);
    expect(b.data).toEqual(a.data);
    expect((await current()).orders).toHaveLength(1);
    expect(
      (await request("/orders", { ...input, note: "Berbeda" }, key)).status,
    ).toBe(409);
  });
  it("membatalkan seluruh pembayaran ketika gabungan resep kekurangan bahan", async () => {
    await open();
    const before = await current();
    const failed = await request(
      "/orders",
      order({
        items: [
          {
            productId: state.products.find(
              (p: any) => p.name === "Kopi Susu Aren",
            ).id,
            quantity: 100,
          },
        ],
      }),
    );
    expect(failed.status).toBe(400);
    const after = await current();
    expect(after.orders).toHaveLength(0);
    expect(after.ingredients).toEqual(before.ingredients);
    expect(after.balances).toEqual(before.balances);
  });
  it("refund sebelum dibuat melepaskan cadangan dan uang muka tanpa mengakui penjualan", async () => {
    await open();
    const paid = await request("/orders", order());
    expect(
      (
        await request(`/orders/${paid.data.id}/refund`, {
          reason: "Pelanggan membatalkan",
          prepared: false,
        })
      ).status,
    ).toBe(200);
    const s = await current();
    expect(balance(s, "advance")).toBe(0);
    expect(balance(s, "cash")).toBe(100000);
    expect(balance(s, "sales")).toBe(0);
    expect(s.ingredients).toEqual(state.ingredients);
    expect(s.orders[0].status).toBe("cancelled");
  });
  it("refund setelah dibuat mencatat waste dan tidak mengembalikan bahan", async () => {
    await open();
    const paid = await request("/orders", order());
    expect(
      (
        await request(`/orders/${paid.data.id}/refund`, {
          reason: "Sudah dibuat tetapi dibatalkan",
          prepared: true,
        })
      ).status,
    ).toBe(200);
    const s = await current();
    expect(balance(s, "waste")).toBe(5860);
    expect(balance(s, "inventory")).toBe(954140);
    expect(balance(s, "cash")).toBe(100000);
    expect(balance(s, "sales")).toBe(0);
  });
  it("refund setelah penyerahan mengurangi penjualan neto, mempertahankan HPP dan stok", async () => {
    await open();
    const paid = await request("/orders", order({ discount: 2000 }));
    await request(`/orders/${paid.data.id}/fulfill`, {});
    const before = await current();
    expect(
      (
        await request(`/orders/${paid.data.id}/refund`, {
          reason: "Keluhan pelanggan",
          prepared: false,
        })
      ).status,
    ).toBe(200);
    const s = await current();
    expect(balance(s, "returns")).toBe(22000);
    expect(
      balance(s, "sales") + balance(s, "discount") + balance(s, "returns"),
    ).toBe(0);
    expect(balance(s, "cogs")).toBe(5860);
    expect(s.ingredients).toEqual(before.ingredients);
  });
  it("mencairkan digital dengan biaya terpisah dan tidak membuat saldo negatif", async () => {
    await open();
    const paid = await request(
      "/orders",
      order({ paymentMethod: "digital", reference: "QRIS-001" }),
    );
    await request(`/orders/${paid.data.id}/fulfill`, {});
    expect(
      (
        await request("/settlements", {
          gross: 24000,
          fee: 1000,
          reference: "BANK-001",
        })
      ).status,
    ).toBe(200);
    let s = await current();
    expect(balance(s, "bank")).toBe(23000);
    expect(balance(s, "clearing")).toBe(0);
    expect(balance(s, "payment_fee")).toBe(1000);
    expect(
      (
        await request("/settlements", {
          gross: 1,
          fee: 0,
          reference: "Saldo kosong",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/orders/${paid.data.id}/refund`, {
          reason: "Dana sudah cair",
          prepared: false,
        })
      ).status,
    ).toBe(400);
    s = await current();
    expect(s.orders[0].status).toBe("fulfilled");
  });
  it("menutup shift dengan hitung fisik, mengunci periode, dan menolak transaksi baru", async () => {
    await open();
    const paid = await request("/orders", order());
    expect(
      (await request("/shifts/close", { counted: 124000, note: "" })).status,
    ).toBe(400);
    await request(`/orders/${paid.data.id}/fulfill`, {});
    expect(
      (
        await request("/shifts/close", {
          counted: 123000,
          note: "Selisih Rp1.000 ditinjau pemilik",
        })
      ).status,
    ).toBe(200);
    const s = await current();
    expect(balance(s, "cash")).toBe(0);
    expect(balance(s, "safe")).toBe(2023000);
    expect(balance(s, "variance")).toBe(1000);
    expect(
      (await request("/period", { date: s.day, reason: "Tutup buku harian" }))
        .status,
    ).toBe(200);
    expect((await request("/shifts/open", { opening: 1000 })).status).toBe(409);
    expect(
      (await request("/period", { date: null, reason: "Koreksi dengan audit" }))
        .status,
    ).toBe(200);
  });
  it("stok opname nol menghapus seluruh nilai bahan yang tidak dicadangkan", async () => {
    const ingredient = state.ingredients.find(
      (i: any) => i.name === "Croissant",
    );
    expect(
      (
        await request("/stock", {
          ingredientId: ingredient.id,
          kind: "stocktake",
          quantity: 0,
          value: 0,
          account: "safe",
          note: "Hitung fisik kosong",
        })
      ).status,
    ).toBe(200);
    const s = await current();
    const item = s.ingredients.find((i: any) => i.id === ingredient.id);
    expect(Number(item.quantity)).toBe(0);
    expect(Number(item.value)).toBe(0);
    expect(balance(s, "variance")).toBe(160000);
  });
  it("menolak jurnal tidak seimbang langsung di database dan rollback header", async () => {
    const eid = uid();
    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO journal_entries(id,business_id,source_key,description,business_date) VALUES($1,$2,$3,$4,$5)",
          [eid, state.business.id, uid(), "Jurnal rusak", state.day],
        );
        await tx.query(
          "INSERT INTO journal_lines(id,business_id,entry_id,account,debit,credit) VALUES($1,$2,$3,'cash',100,0)",
          [uid(), state.business.id, eid],
        );
      }),
    ).rejects.toThrow("Jurnal tidak seimbang");
    expect(
      (await db.query("SELECT id FROM journal_entries WHERE id=$1", [eid]))
        .rows,
    ).toHaveLength(0);
  });
  it("membatasi kasir dan menolak perubahan dari origin berbeda", async () => {
    expect(
      (
        await request("/users", {
          name: "Kasir Uji",
          email: "cashier@test.local",
          password: "KataSandiKasir123!",
          role: "cashier",
        })
      ).status,
    ).toBe(200);
    const login = await request(
      "/login",
      { email: "cashier@test.local", password: "KataSandiKasir123!" },
      uid(),
      "",
    );
    const session = login.response.headers.get("set-cookie")!.split(";")[0];
    const s = (await request("/state", undefined, uid(), session)).data;
    expect(s.balances).toBeUndefined();
    expect(s.products[0].recipe).toBeUndefined();
    expect(
      (
        await request(
          "/expenses",
          {
            category: "Test",
            description: "Tidak boleh",
            amount: 1,
            account: "safe",
          },
          uid(),
          session,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/shifts/open",
          { opening: 1 },
          uid(),
          cookie,
          "https://attacker.example",
        )
      ).status,
    ).toBe(403);
    const logs = (
      await db.query(
        "SELECT details FROM audit_logs WHERE action='user.create'",
      )
    ).rows;
    expect(JSON.stringify(logs)).not.toContain("passwordFingerprint");
  });
  it("menolak akses ID bahan dan menu milik usaha lain", async () => {
    const pw = await passwordHash(db, "KataSandiOwner123!");
    await db.transaction((tx) =>
      createBusiness(tx, {
        name: "Usaha kedua",
        outlet: "Outlet kedua",
        owner: "Owner kedua",
        email: "second@test.local",
        passwordHash: pw,
        capital: 0,
      }),
    );
    const bid = (
        await db.query("SELECT id FROM businesses WHERE name='Usaha kedua'")
      ).rows[0].id,
      iid = uid(),
      pid = uid();
    await db.query(
      "INSERT INTO ingredients(id,business_id,name,unit) VALUES($1,$2,'Rahasia','g')",
      [iid, bid],
    );
    await db.query(
      "INSERT INTO products(id,business_id,name,category,price,description,emoji,color,recipe) VALUES($1,$2,'Rahasia','Kopi',1,'','','sage',$3)",
      [pid, bid, JSON.stringify([{ ingredientId: iid, quantity: 1 }])],
    );
    await open();
    expect(
      (
        await request(
          "/orders",
          order({ items: [{ productId: pid, quantity: 1 }] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/stock", {
          ingredientId: iid,
          kind: "purchase",
          quantity: 1,
          value: 1,
          account: "safe",
          note: "Lintas usaha",
        })
      ).status,
    ).toBe(404);
    expect((await current()).products.some((p: any) => p.id === pid)).toBe(
      false,
    );
  });
  it("laporan periode memisahkan pergerakan hari ini dari saldo awal dan saldo akhir", async () => {
    await db.query(
      "UPDATE journal_entries SET business_date=$1::date-1 WHERE business_id=$2",
      [state.day, state.business.id],
    );
    await open();
    const paid = await request("/orders", order());
    await request(`/orders/${paid.data.id}/fulfill`, {});
    const report = await request(`/reports?from=${state.day}&to=${state.day}`);
    expect(report.status).toBe(200);
    expect(
      Number(
        report.data.period.find((b: any) => b.account === "sales").balance,
      ),
    ).toBe(-24000);
    expect(
      Number(
        report.data.opening.find((b: any) => b.account === "safe").balance,
      ),
    ).toBe(2000000);
    expect(
      Number(
        report.data.closing.find((b: any) => b.account === "safe").balance,
      ),
    ).toBe(1900000);
    expect(
      report.data.journals.some((j: any) => j.source_key === "opening-capital"),
    ).toBe(false);
    expect(
      (await request("/reports?from=2026-02-30&to=2026-03-01")).status,
    ).toBe(422);
  });
  it("menggunakan tanggal usaha sesuai zona waktu Indonesia", () => {
    expect(businessDay("Asia/Makassar", new Date("2026-10-01T17:00:00Z"))).toBe(
      "2026-10-02",
    );
    expect(businessDay("Asia/Jakarta", new Date("2026-10-01T16:30:00Z"))).toBe(
      "2026-10-01",
    );
  });
});
