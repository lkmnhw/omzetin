import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { schema } from "../src/server/schema";
import { localDatabase } from "../src/server/db";
import { createApp } from "../src/server/app";
import { seedDemo } from "../src/server/seed";
import { uid, post, businessDay } from "../src/server/domain";
import { passwordHash } from "../src/server/security";
const pg = new PGlite({ extensions: { pgcrypto } }),
  db = localDatabase(pg),
  app = createApp(db, { demo: true });
let cookie = "",
  initial: any;
async function req(
  path: string,
  input?: any,
  outlet?: string,
  session = cookie,
  key = uid(),
) {
  const r = await app.request("http://localhost/api" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      Cookie: session,
      Origin: "http://localhost",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...(outlet ? { "X-Outlet-Id": outlet } : {}),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  return { status: r.status, data: (await r.json()) as any, response: r };
}
async function login(email: string, password: string) {
  const r = await req("/login", { email, password }, undefined, "");
  expect(r.status).toBe(200);
  return r.response.headers.get("set-cookie")!.split(";")[0];
}
async function state(outlet?: string, session = cookie) {
  const r = await req("/state", undefined, outlet, session);
  expect(r.status).toBe(200);
  return r.data;
}
async function outlet(name = "Outlet Panakkukang") {
  const r = await req("/outlets", {
    name,
    timezone: "Asia/Makassar",
    capital: 300000,
    copyMenu: true,
  });
  expect(r.status).toBe(200);
  return r.data.id as string;
}
const bal = (s: any, a: string) =>
  Number(s.balances.find((b: any) => b.account === a)?.balance || 0);
function order(productId: string) {
  return {
    items: [{ productId, quantity: 1 }],
    discount: 0,
    paymentMethod: "cash",
    tendered: 50000,
    reference: "",
    service: "takeaway",
    note: "Uji multioutlet",
  };
}
beforeAll(async () => {
  await pg.exec(schema);
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE; TRUNCATE login_attempts");
  await seedDemo(db);
  cookie = await login("demo@omzetin.local", "OmzetinDemo123!");
  initial = await state();
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("Multi owner dan multi outlet", () => {
  it("membuat outlet, menyalin resep ke ID baru, dan memulai stok dari nol", async () => {
    const id = await outlet(),
      s = await state(id);
    expect(s.outlets).toHaveLength(2);
    expect(s.business.organization_id).toBe(initial.business.organization_id);
    expect(s.products).toHaveLength(initial.products.length);
    expect(
      s.ingredients.every(
        (i: any) => Number(i.quantity) === 0 && Number(i.value) === 0,
      ),
    ).toBe(true);
    expect(
      s.products.every((p: any) =>
        p.recipe.every((r: any) =>
          s.ingredients.some((i: any) => i.id === r.ingredientId),
        ),
      ),
    ).toBe(true);
    expect(
      s.products.every(
        (p: any) => !initial.products.some((old: any) => old.id === p.id),
      ),
    ).toBe(true);
    expect(bal(s, "safe")).toBe(300000);
    expect((await state()).ingredients).toEqual(initial.ingredients);
  });
  it("shift, stok, pembayaran, dan idempotensi tetap terpisah pada dua outlet", async () => {
    const second = await outlet(),
      s = await state(second),
      material = s.ingredients.find((i: any) => i.name === "Croissant");
    expect(
      (
        await req(
          "/stock",
          {
            ingredientId: material.id,
            kind: "purchase",
            quantity: 1,
            value: 2000,
            account: "safe",
            note: "Pembelian outlet kedua",
          },
          second,
        )
      ).status,
    ).toBe(200);
    expect((await req("/shifts/open", { opening: 100000 })).status).toBe(200);
    expect(
      (await req("/shifts/open", { opening: 100000 }, second)).status,
    ).toBe(200);
    const key = uid(),
      firstOrder = await req(
        "/orders",
        order(
          initial.products.find((p: any) => p.name === "Butter Croissant").id,
        ),
        undefined,
        cookie,
        key,
      ),
      secondOrder = await req(
        "/orders",
        order(s.products.find((p: any) => p.name === "Butter Croissant").id),
        second,
        cookie,
        key,
      );
    expect(firstOrder.status).toBe(200);
    expect(secondOrder.status).toBe(200);
    expect(firstOrder.data.id).not.toBe(secondOrder.data.id);
    expect(
      (await req(`/orders/${firstOrder.data.id}/fulfill`, {}, second)).status,
    ).toBe(404);
    expect(
      (await req(`/orders/${firstOrder.data.id}/fulfill`, {})).status,
    ).toBe(200);
    expect(
      (await req(`/orders/${secondOrder.data.id}/fulfill`, {}, second)).status,
    ).toBe(200);
    const a = await state(),
      b = await state(second);
    expect(a.orders).toHaveLength(1);
    expect(b.orders).toHaveLength(1);
    expect(bal(a, "cash")).toBe(122000);
    expect(bal(b, "cash")).toBe(122000);
    expect(bal(a, "cogs")).toBe(8000);
    expect(bal(b, "cogs")).toBe(2000);
    const report = await req(
      `/reports?from=${a.day}&to=${a.day}&scope=organization`,
    );
    expect(report.status).toBe(200);
    expect(report.data.outletIds).toHaveLength(2);
    expect(
      Number(
        report.data.period.find((b: any) => b.account === "sales").balance,
      ),
    ).toBe(-44000);
    expect(
      report.data.journals.some(
        (j: any) => j.outlet_name === "Outlet Panakkukang",
      ),
    ).toBe(true);
  });
  it("owner kedua mendapat semua outlet, sementara kasir hanya outlet yang ditugaskan", async () => {
    const second = await outlet();
    expect(
      (
        await req("/users", {
          name: "Owner dua",
          email: "owner2@test.local",
          password: "OwnerKedua123!",
          role: "owner",
        })
      ).status,
    ).toBe(200);
    const owner = await login("owner2@test.local", "OwnerKedua123!");
    expect((await state(second, owner)).user.role).toBe("owner");
    expect((await state(second, owner)).outlets).toHaveLength(2);
    expect(
      (
        await req("/users", {
          name: "Kasir dua",
          email: "cashier2@test.local",
          password: "KasirKedua123!",
          role: "cashier",
          outletIds: [second],
        })
      ).status,
    ).toBe(200);
    const cashier = await login("cashier2@test.local", "KasirKedua123!"),
      s = await state(second, cashier);
    expect(s.outlets.map((o: any) => o.id)).toEqual([second]);
    expect(s.balances).toBeUndefined();
    expect(
      (await req("/state", undefined, initial.business.id, cashier)).status,
    ).toBe(403);
    expect(
      (
        await req(
          "/outlets",
          {
            name: "Tidak boleh",
            timezone: "Asia/Makassar",
            capital: 0,
            copyMenu: false,
          },
          second,
          cashier,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          `/reports?from=${s.day}&to=${s.day}&scope=organization`,
          undefined,
          second,
          cashier,
        )
      ).status,
    ).toBe(403);
  });
  it("satu akun mengelola beberapa usaha, dengan role dan laporan sesuai usaha aktif", async () => {
    const another = await req("/organizations", {
      name: "Usaha terpisah",
      outlet: "Outlet Jakarta",
      timezone: "Asia/Jakarta",
      capital: 700000,
    });
    expect(another.status).toBe(200);
    const id = another.data.id,
      s = await state(id);
    expect(s.business.organization_id).not.toBe(
      initial.business.organization_id,
    );
    expect(s.products).toHaveLength(0);
    expect(bal(s, "safe")).toBe(700000);
    const report = await req(
      `/reports?from=${s.day}&to=${s.day}&scope=organization`,
      undefined,
      id,
    );
    expect(report.data.outletIds).toEqual([id]);
    expect(
      Number(
        report.data.closing.find((b: any) => b.account === "safe").balance,
      ),
    ).toBe(700000);
    await req("/users", {
      name: "Owner lain",
      email: "different@test.local",
      password: "OwnerBerbeda123!",
      role: "owner",
    });
    const owner = await login("different@test.local", "OwnerBerbeda123!");
    expect((await req("/state", undefined, id, owner)).status).toBe(403);
    const linked = await req(
      "/users",
      {
        name: "Akun sudah ada",
        email: "different@test.local",
        password: "",
        role: "cashier",
      },
      id,
    );
    expect(linked.status).toBe(200);
    expect(linked.data.linked).toBe(true);
    expect((await state(id, owner)).user.role).toBe("cashier");
    expect((await state(initial.business.id, owner)).user.role).toBe("owner");
    expect(
      (
        await req(
          "/expenses",
          {
            category: "Uji",
            description: "Tidak boleh",
            amount: 1,
            account: "safe",
          },
          id,
          owner,
        )
      ).status,
    ).toBe(403);
    expect(
      await login("different@test.local", "OwnerBerbeda123!"),
    ).toBeTruthy();
  });
  it("menolak penugasan outlet usaha lain dan mengunci periode per outlet", async () => {
    const second = await outlet(),
      other = await req("/organizations", {
        name: "Usaha lain",
        outlet: "Outlet lain",
        timezone: "Asia/Makassar",
        capital: 0,
      });
    expect(
      (
        await req("/users", {
          name: "Kasir",
          email: "bad@test.local",
          password: "KasirBaru123!",
          role: "cashier",
          outletIds: [other.data.id],
        })
      ).status,
    ).toBe(403);
    expect(
      (await db.query("SELECT id FROM users WHERE email='bad@test.local'"))
        .rows,
    ).toHaveLength(0);
    expect((await req("/state", undefined, uid())).status).toBe(403);
    expect(
      (
        await req("/period", {
          date: initial.day,
          reason: "Tutup outlet pertama",
        })
      ).status,
    ).toBe(200);
    expect((await req("/shifts/open", { opening: 1000 })).status).toBe(409);
    expect((await req("/shifts/open", { opening: 1000 }, second)).status).toBe(
      200,
    );
  });
  it("schema dapat dijalankan ulang tanpa menggandakan owner atau memindahkan data", async () => {
    const second = await outlet();
    await pg.exec(schema);
    const s = await state(second);
    expect(s.outlets).toHaveLength(2);
    expect(
      (await db.query("SELECT * FROM organization_owners")).rows,
    ).toHaveLength(1);
    expect((await state()).ingredients).toEqual(initial.ingredients);
  });
  it("migrasi data versi satu outlet mempertahankan jurnal dan akses pemilik", async () => {
    const legacy = new PGlite({ extensions: { pgcrypto } }),
      ldb = localDatabase(legacy);
    try {
      const before = schema.slice(
          0,
          schema.indexOf("CREATE TABLE IF NOT EXISTS organizations"),
        ),
        after = schema.slice(
          schema.indexOf("CREATE OR REPLACE FUNCTION verify_journal_balance"),
        );
      await legacy.exec(before + after);
      const bid = uid(),
        user = uid(),
        pw = await passwordHash(ldb, "OwnerLegacy123!");
      await ldb.query(
        "INSERT INTO businesses(id,name,outlet_name) VALUES($1,'Usaha lama','Outlet lama')",
        [bid],
      );
      await ldb.query(
        "INSERT INTO users(id,business_id,name,email,password_hash,role) VALUES($1,$2,'Owner lama','legacy@test.local',$3,'owner')",
        [user, bid, pw],
      );
      await ldb.transaction((tx) =>
        post(tx, bid, businessDay(), "opening", "Modal lama", [
          { account: "safe", debit: 900000 },
          { account: "capital", credit: 900000 },
        ]),
      );
      await legacy.exec(schema);
      const migrated = createApp(ldb),
        login = await migrated.request("http://localhost/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost",
          },
          body: JSON.stringify({
            email: "legacy@test.local",
            password: "OwnerLegacy123!",
          }),
        }),
        session = login.headers.get("set-cookie")!.split(";")[0];
      const r = await migrated.request("http://localhost/api/state", {
        headers: { Cookie: session },
      });
      expect(r.status).toBe(200);
      const s: any = await r.json();
      expect(s.business.id).toBe(bid);
      expect(s.outlets).toHaveLength(1);
      expect(s.user.role).toBe("owner");
      expect(bal(s, "safe")).toBe(900000);
    } finally {
      await legacy.close();
    }
  });
});

describe("Pendaftaran publik", () => {
  const input = {
    name: "Kedai Baru",
    outlet: "Outlet Pertama",
    owner: "Owner Baru",
    email: "baru@example.com",
    password: "PasswordOwner123!",
    capital: 250000,
  };
  it("mendaftarkan owner baru setelah bisnis lain ada dan mengisolasi akses", async () => {
    const r = await req("/register", input, undefined, "");
    expect(r.status).toBe(201);
    const session = r.response.headers.get("set-cookie")!.split(";")[0];
    const s = await state(undefined, session);
    expect(s.user.role).toBe("owner");
    expect(s.outlets).toHaveLength(1);
    expect(s.business.organization_id).not.toBe(
      initial.business.organization_id,
    );
    expect(s.products).toHaveLength(0);
    expect(bal(s, "safe")).toBe(250000);
    expect(
      (await req("/state", undefined, initial.business.id, session)).status,
    ).toBe(403);
    expect(await login(input.email, input.password)).toBeTruthy();
  });
  it("menolak email duplikat tanpa meninggalkan bisnis parsial", async () => {
    const before = (await db.query("SELECT count(*) n FROM organizations"))
      .rows[0].n;
    expect(
      (
        await req(
          "/register",
          { ...input, email: "DEMO@OMZETIN.LOCAL" },
          undefined,
          "",
        )
      ).status,
    ).toBe(409);
    expect(
      (await db.query("SELECT count(*) n FROM organizations")).rows[0].n,
    ).toBe(before);
  });
  it("menolak password pendek, origin asing, dan membatasi pendaftaran", async () => {
    expect(
      (await req("/register", { ...input, password: "short" }, undefined, ""))
        .status,
    ).toBe(422);
    const foreign = await app.request("http://localhost/api/register", {
      method: "POST",
      headers: {
        Origin: "https://foreign.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    expect(foreign.status).toBe(403);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await req(
            "/register",
            { ...input, email: "demo@omzetin.local" },
            undefined,
            "",
          )
        ).status,
      ).toBe(409);
    expect((await req("/register", input, undefined, "")).status).toBe(429);
  });
});
