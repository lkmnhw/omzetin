import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { schema } from "../src/server/schema";
import { localDatabase } from "../src/server/db";
import { createApp } from "../src/server/app";
import { seedDemo } from "../src/server/seed";
import { uid } from "../src/server/domain";
import {
  allocateDividends,
  grossColor,
  costColor,
  ratio,
} from "../src/server/core";
const pg = new PGlite({ extensions: { pgcrypto } }),
  db = localDatabase(pg),
  app = createApp(db, { demo: true });
let owner = "",
  employee = "",
  manager = "",
  investor = "",
  s: any;
async function req(
  path: string,
  input?: any,
  cookie = owner,
  key = uid(),
  outlet?: string,
) {
  const r = await app.request("http://localhost/api" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      Origin: "http://localhost",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...(outlet ? { "X-Outlet-Id": outlet } : {}),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  return { status: r.status, data: (await r.json()) as any, response: r };
}
async function login(email: string, password = "CorePassword123!") {
  const r = await req("/login", { email, password }, "");
  expect(r.status).toBe(200);
  return r.response.headers.get("set-cookie")!.split(";")[0];
}
async function member(role: string, name = role) {
  const r = await req("/core/members", {
    name,
    email: name + "@core.local",
    password: "CorePassword123!",
    role,
    outletIds: role === "employee" || role === "manager" ? [s.business.id] : [],
  });
  expect(r.status).toBe(200);
  return r.data.id;
}
const expense = (value = 1000, extra: any = {}) => ({
  kind: "expense",
  amount: value,
  businessDate: s.day,
  description: "Belanja bahan",
  costGroup: "daily",
  category: "materials",
  account: "safe",
  ...extra,
});
async function income(gross = 100000, net = 80000, day = s.day) {
  const r = await req("/core/documents", {
    kind: "income",
    channel: "gojek",
    amount: gross,
    description: "Order eksternal unik",
    reference: uid(),
    businessDate: day,
  });
  expect(r.status).toBe(200);
  const received = await req("/core/receipts", {
    documentId: r.data.id,
    gross,
    net,
    receivedDate: day,
    reference: uid(),
  });
  expect(received.status, JSON.stringify(received.data)).toBe(200);
  return r.data.id;
}
async function draft(month = s.day.slice(0, 7)) {
  const r = await req("/core/monthly?month=" + month);
  expect(r.status).toBe(200);
  return r.data;
}
async function publish() {
  const r = await req("/core/reports/publish", {
    month: s.day.slice(0, 7),
    scope: "organization",
  });
  expect(r.status).toBe(200);
  return r.data.id;
}
async function sale(channel = "cash") {
  const r = await req("/orders", {
    items: [{ productId: s.products[0].id, quantity: 1 }],
    discount: 0,
    paymentMethod: channel === "cash" ? "cash" : "digital",
    channel,
    tendered: 50000,
    reference: channel === "cash" ? "" : uid(),
    service: "takeaway",
    note: "",
  });
  expect(r.status).toBe(200);
  expect((await req("/orders/" + r.data.id + "/fulfill", {})).status).toBe(200);
  return r.data;
}
beforeAll(async () => {
  await pg.exec(schema);
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE; TRUNCATE login_attempts");
  await seedDemo(db);
  owner = await login("demo@omzetin.local", "OmzetinDemo123!");
  s = (await req("/state")).data;
  await member("employee");
  await member("manager");
  await member("investor");
  employee = await login("employee@core.local");
  manager = await login("manager@core.local");
  investor = await login("investor@core.local");
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("Fitur inti operasional dan pertanggungjawaban", () => {
  it("membatasi manager, karyawan, dan investor di server serta menjaga isolasi bisnis", async () => {
    expect(
      (
        await req(
          "/core/monthly?month=" + s.day.slice(0, 7),
          undefined,
          employee,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          "/core/monthly?month=" + s.day.slice(0, 7),
          undefined,
          manager,
        )
      ).status,
    ).toBe(403);
    expect((await req("/core/documents", expense(), investor)).status).toBe(
      403,
    );
    expect(
      (await req("/core/state", undefined, investor)).data.documents,
    ).toBeUndefined();
    expect(
      (await req("/state", undefined, investor)).data.ingredients,
    ).toBeUndefined();
    const other = await req("/organizations", {
      name: "Lain",
      outlet: "Lain",
      timezone: "Asia/Makassar",
      capital: 0,
    });
    expect(
      (await req("/core/state", undefined, employee, uid(), other.data.id))
        .status,
    ).toBe(403);
    expect(
      (
        await req(
          "/core/members",
          {
            name: "X",
            email: "x@core.local",
            role: "employee",
            outletIds: [other.data.id],
          },
          manager,
        )
      ).status,
    ).toBe(403);
  });
  it("pengeluaran manager langsung disetujui, kasir menunggu, dan koreksi tidak membukukan dua kali", async () => {
    const pending = await req("/core/documents", expense(3000), employee);
    expect(pending.data.status).toBe("submitted");
    expect((await draft()).totals.daily).toBe("0");
    const automatic = await req("/core/documents", expense(2000), manager);
    expect(automatic.data.status).toBe("approved");
    expect(
      (
        await req(
          "/core/review",
          {
            id: pending.data.id,
            version: 1,
            decision: "returned",
            note: "Koreksi harga",
          },
          manager,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await req(
          "/core/documents",
          expense(2500, { id: pending.data.id, version: 2 }),
          employee,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await req(
          "/core/review",
          { id: pending.data.id, version: 3, decision: "approved" },
          employee,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          "/core/review",
          { id: pending.data.id, version: 1, decision: "approved" },
          manager,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await req(
          "/core/review",
          { id: pending.data.id, version: 3, decision: "approved" },
          manager,
        )
      ).status,
    ).toBe(200);
    expect((await draft()).totals.daily).toBe("4500");
    const amount = (
      await db.query(
        "SELECT sum(debit-credit)::text amount FROM journal_lines WHERE account='expense'",
      )
    ).rows[0].amount;
    expect(Number(amount)).toBe(4500);
    expect(
      (await req("/core/documents", expense(100000000000), employee)).status,
    ).toBe(400);
  });
  it("menghitung final dan tiga kelompok biaya tanpa potongan ganda atau kategori ganda", async () => {
    await income();
    await req("/core/documents", expense(30000));
    await req(
      "/core/documents",
      expense(10000, { costGroup: "monthly", category: "salary" }),
    );
    await req(
      "/core/documents",
      expense(5000, { costGroup: "irregular", category: "marketing" }),
    );
    const d = await draft();
    expect(d.totals).toMatchObject({
      revenue: "80000",
      expense: "45000",
      gross: "50000",
      net: "35000",
    });
    expect(d.channels.find((c: any) => c.channel === "gojek")).toMatchObject({
      fee: "20000",
      finalPercent: 80,
    });
    expect(d.metrics.find((m: any) => m.key === "salary").percent).toBe(12.5);
    expect(d.metrics.find((m: any) => m.key === "marketing").percent).toBe(
      6.25,
    );
  });
  it("menempatkan pencairan sebagian pada bulan dana diterima dan mencegah final ganda", async () => {
    const day = "2026-08-31",
      r = await req("/core/documents", {
        kind: "income",
        channel: "grab",
        amount: 10000,
        description: "Agustus",
        reference: uid(),
        businessDate: day,
      });
    expect(r.status).toBe(200);
    const a = {
        documentId: r.data.id,
        gross: 4000,
        net: 3200,
        receivedDate: day,
        reference: "batch-1",
      },
      key = uid();
    expect((await req("/core/receipts", a, owner, key)).status).toBe(200);
    expect((await req("/core/receipts", a, owner, key)).status).toBe(200);
    expect((await draft("2026-08")).totals).toMatchObject({
      revenue: "3200",
      outstanding: "6000",
    });
    expect(
      (
        await req("/core/receipts", {
          ...a,
          gross: 6000,
          net: 4800,
          receivedDate: "2026-09-01",
          reference: "batch-2",
        })
      ).status,
    ).toBe(200);
    expect((await draft("2026-09")).totals).toMatchObject({
      revenue: "4800",
      outstanding: "0",
    });
    expect(
      (await req("/core/receipts", { ...a, reference: "batch-3" })).status,
    ).toBe(422);
    expect(
      (
        await req("/core/documents", {
          kind: "income",
          channel: "grab",
          amount: 10000,
          description: "Duplikat",
          reference: r.data.reference || "",
          businessDate: day,
          net: 1,
        })
      ).status,
    ).toBe(422);
  });
  it("menghasilkan rekap cash per shift dan transfer bank, menunggu persetujuan manager", async () => {
    await req("/shifts/open", { opening: 100000, label: "Shift 1" });
    const cash = await sale(),
      transfer = await sale("transfer");
    expect(
      (
        await req("/shifts/close", {
          counted: 100000 + Number(cash.total),
          note: "",
        })
      ).status,
    ).toBe(200);
    const docs = (await req("/core/state")).data.documents.filter(
      (d: any) => d.kind === "income",
    );
    expect(docs).toHaveLength(2);
    expect((await draft()).totals.revenue).toBe("0");
    for (const d of docs)
      expect(
        (
          await req(
            "/core/review",
            { id: d.id, version: d.version, decision: "approved" },
            manager,
          )
        ).status,
      ).toBe(200);
    expect(Number((await draft()).totals.revenue)).toBe(
      Number(cash.total) + Number(transfer.total),
    );
    expect(
      Number(
        (
          await db.query(
            "SELECT sum(debit-credit)::text amount FROM journal_lines WHERE account='clearing'",
          )
        ).rows[0].amount,
      ),
    ).toBe(0);
  });
  it("refund setelah shift tutup mengoreksi laporan tanpa menggandakan uang", async () => {
    await req("/shifts/open", { opening: 100000 });
    const order = await sale("qris");
    expect(
      (await req("/shifts/close", { counted: 100000, note: "" })).status,
    ).toBe(200);
    let docs = (await req("/core/state")).data.documents;
    for (const d of docs)
      await req("/core/review", { id: d.id, version: 1, decision: "approved" });
    const qr = docs.find((d: any) => d.channel === "qris");
    await req("/core/receipts", {
      documentId: qr.id,
      gross: Number(order.total),
      net: Number(order.total),
      receivedDate: s.day,
      reference: "qris-batch",
    });
    await req("/shifts/open", { opening: 100000 });
    expect(
      (
        await req("/orders/" + order.id + "/refund", {
          reason: "Pelanggan batal",
          prepared: true,
        })
      ).status,
    ).toBe(200);
    docs = (await req("/core/state")).data.documents;
    const refund = docs.find((d: any) => d.kind === "refund");
    expect(refund.amount).toBe(order.total);
    await req("/core/review", {
      id: refund.id,
      version: 1,
      decision: "approved",
    });
    expect((await draft()).totals.revenue).toBe("0");
  });
  it("publikasi menyimpan versi immutable dan menolak laporan dengan pengajuan belum tuntas", async () => {
    const r = await req("/core/documents", expense(500), employee);
    expect(
      (
        await req("/core/reports/publish", {
          month: s.day.slice(0, 7),
          scope: "organization",
        })
      ).status,
    ).toBe(409);
    await req("/core/review", {
      id: r.data.id,
      version: 1,
      decision: "approved",
    });
    await income();
    const rid = await publish();
    await req("/core/documents", expense(700));
    const old = await req("/core/reports/" + rid, undefined, investor);
    expect(old.data.report.snapshot.totals.expense).toBe("500");
    expect((await draft()).totals.expense).toBe("1200");
    expect(
      (
        await req("/core/reports/publish", {
          month: s.day.slice(0, 7),
          scope: "organization",
          note: "Koreksi biaya",
        })
      ).data.revision,
    ).toBe(2);
  });
  it("dividen beberapa penerima tepat satu rupiah, investor hanya melihat miliknya dan pembayaran dibatasi", async () => {
    await income(10000, 10001 - 1);
    const second = await member("investor", "kedua"),
      idInvestor = (await req("/state", undefined, investor)).data.user.id;
    const reportId = await publish(),
      input = {
        reportId,
        amount: 9999,
        infaq: 1,
        managementPercent: 50,
        investorPercent: 50,
        members: [
          { userId: s.user.id, percent: 100 },
          { userId: idInvestor, percent: 60 },
          { userId: second, percent: 40 },
        ],
      };
    const plan = await req("/core/dividends", input);
    expect(plan.status).toBe(200);
    expect(
      plan.data.allocations.reduce((n: number, a: any) => n + a.amount, 0),
    ).toBe(9999);
    const own = (await req("/core/reports/" + reportId, undefined, investor))
      .data.dividend;
    expect(own.allocations).toHaveLength(1);
    expect(own.allocations[0].userId).toBe(idInvestor);
    const pay = {
        planId: plan.data.id,
        userId: idInvestor,
        amount: 1000,
        paidDate: s.day,
        reference: "bayar-1",
      },
      key = uid();
    expect((await req("/core/dividends/pay", pay, owner, key)).status).toBe(
      200,
    );
    expect((await req("/core/dividends/pay", pay, owner, key)).status).toBe(
      200,
    );
    expect(
      (
        await req("/core/dividends/pay", {
          ...pay,
          reference: "lebih",
          amount: own.allocations[0].amount,
        })
      ).status,
    ).toBe(422);
    expect((await req("/core/dividends", input)).status).toBe(409);
    expect((await req("/core/dividends/pay", pay, investor)).status).toBe(403);
    expect(
      (await req("/core/reports/" + reportId, undefined, investor)).data
        .dividend.payments,
    ).toHaveLength(1);
    expect((await draft()).totals.net).toBe("10000");
    expect(
      Number(
        (
          await db.query(
            "SELECT sum(debit-credit)::text amount FROM journal_lines WHERE account='bank'",
          )
        ).rows[0].amount,
      ),
    ).toBe(9000);
  });
  it("mencegah dividen dan infaq saat rugi atau melampaui laba", async () => {
    await req("/core/documents", expense(500));
    const reportId = await publish();
    expect(
      (
        await req("/core/dividends", {
          reportId,
          amount: 1,
          infaq: 1,
          managementPercent: 100,
          investorPercent: 0,
          members: [{ userId: s.user.id, percent: 100 }],
        })
      ).status,
    ).toBe(422);
  });
  it("absensi sekali aktif, koreksi audited, dan jadwal shift harus konsisten", async () => {
    const input = { action: "in", shiftLabel: "Shift 1", note: "" };
    const r = await req("/core/attendance", input, employee);
    expect(r.status).toBe(200);
    expect((await req("/core/attendance", input, employee)).status).toBe(409);
    expect(
      (await req("/core/attendance", { ...input, action: "out" }, employee))
        .status,
    ).toBe(200);
    expect(
      (
        await req(
          "/core/attendance/correct",
          {
            id: r.data.id,
            clockIn: "2026-09-30T08:00:00+08:00",
            clockOut: "2026-09-30T10:00:00+08:00",
            note: "Koreksi jam",
          },
          manager,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await db.query(
          "SELECT id FROM audit_logs WHERE action='core.attendance.correct'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await req(
          "/core/schedule",
          {
            days: [1, 2, 3],
            open: "20:00",
            close: "06:00",
            shifts: [{ name: "Malam", start: "20:00", end: "06:00" }],
          },
          manager,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await req(
          "/core/schedule",
          {
            days: [1],
            open: "08:00",
            close: "22:00",
            shifts: [
              { name: "Satu", start: "08:00", end: "16:00" },
              { name: "Dua", start: "15:00", end: "22:00" },
            ],
          },
          manager,
        )
      ).status,
    ).toBe(422);
  });
  it("mencegah hilangnya management terakhir dan migrasi tidak menghidupkan akses nonaktif", async () => {
    expect(
      (
        await req("/core/members", {
          name: s.user.name,
          email: s.user.email,
          role: "investor",
          active: true,
        })
      ).status,
    ).toBe(409);
    await req("/core/members", {
      name: "employee",
      email: "employee@core.local",
      role: "employee",
      active: false,
      outletIds: [s.business.id],
    });
    await pg.exec(schema);
    expect((await req("/state", undefined, employee)).status).toBe(401);
  });
  it("membatalkan catatan salah dengan reversal dan mengizinkan publikasi", async () => {
    const r = await req("/core/documents", expense(1000), employee);
    expect(
      (
        await req(
          "/core/review",
          {
            id: r.data.id,
            version: 1,
            decision: "voided",
            note: "Duplikat kuitansi",
          },
          manager,
        )
      ).status,
    ).toBe(200);
    const d = await draft();
    expect(d.pending).toBe(0);
    expect(d.totals.expense).toBe("0");
    expect(
      Number(
        (
          await db.query(
            "SELECT COALESCE(sum(debit-credit),0)::text amount FROM journal_lines WHERE account='expense'",
          )
        ).rows[0].amount,
      ),
    ).toBe(0);
    await publish();
  });
  it("belanja bahan dan settlement lama masuk laporan satu kali setelah sinkronisasi", async () => {
    const ingredient = s.ingredients[0];
    await req("/stock", {
      ingredientId: ingredient.id,
      kind: "purchase",
      quantity: 10,
      value: 5000,
      account: "safe",
      note: "Belanja bahan",
    });
    await req("/shifts/open", { opening: 100000 });
    const order = await sale("qris");
    expect(
      (
        await req("/settlements", {
          gross: Number(order.total),
          fee: 1000,
          reference: "versi-lama",
        })
      ).status,
    ).toBe(200);
    await req("/shifts/close", { counted: 100000, note: "" });
    for (const d of (await req("/core/state")).data.documents.filter(
      (d: any) => d.kind === "income",
    ))
      await req("/core/review", {
        id: d.id,
        version: d.version,
        decision: "approved",
      });
    const report = await draft();
    expect(report.totals.daily).toBe("5000");
    expect(Number(report.totals.revenue)).toBe(Number(order.total) - 1000);
    await req("/core/targets", {
      salary: 25,
      operational: 15,
      irregular: 5,
      marketing: 3,
    });
    expect((await draft()).totals).toEqual(report.totals);
  });
  it("refund pendapatan manual terkait dokumen asal dan tidak dapat melebihi pencairan", async () => {
    const id = await income(100000, 80000),
      input = {
        documentId: id,
        amount: 20000,
        businessDate: s.day,
        reference: "refund-manual-1",
        reason: "Pelanggan batal",
      };
    const key = uid();
    expect((await req("/core/refunds", input, manager, key)).status).toBe(200);
    expect((await req("/core/refunds", input, manager, key)).status).toBe(200);
    expect((await draft()).totals.revenue).toBe("60000");
    expect(
      (
        await req(
          "/core/refunds",
          { ...input, amount: 90000, reference: "lebih" },
          manager,
        )
      ).status,
    ).toBe(422);
    expect((await req("/core/refunds", input, employee)).status).toBe(403);
    expect(
      (
        await db.query(
          "SELECT related_document FROM operational_documents WHERE kind='refund'",
        )
      ).rows[0].related_document,
    ).toBe(id);
  });
  it("memetakan batas warna dan menampilkan rasio kosong ketika omzet nol", () => {
    expect([50, 40, 30, 20, -10].map(grossColor)).toEqual([
      "green",
      "yellow",
      "orange",
      "red",
      "red",
    ]);
    expect([25, 27.5, 31.25, 32].map((n) => costColor(n, 25))).toEqual([
      "green",
      "yellow",
      "orange",
      "red",
    ]);
    expect(ratio(100, 0)).toBeNull();
    expect(
      allocateDividends(3, 50, [
        { userId: "a", name: "a", role: "management", percent: 100 },
        { userId: "b", name: "b", role: "investor", percent: 100 },
      ]).reduce((s, a) => s + a.amount, 0),
    ).toBe(3);
  });
});
