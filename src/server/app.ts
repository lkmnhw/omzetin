import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import type { Database, Queryable } from "./db";
import {
  D,
  fixed,
  uid,
  DomainError,
  post,
  balance,
  requireFunds,
  businessDay,
  accounts,
  consumptionCost,
} from "./domain";
import { hash, passwordHash, verifyPassword } from "./security";
import { createBusiness } from "./seed";
import { accessibleOutlets } from "./access";
import { createOutlet } from "./outlets";
import { registerCore, syncOperationalDocuments, channelSchema } from "./core";

export type User = {
  id: string;
  business_id: string;
  organization_id: string;
  name: string;
  email: string;
  role: "owner" | "cashier" | "manager" | "investor";
  member_role?: string;
};
export type Environment = {
  Variables: { db: Database; user: User; outlets: any[] };
};
export type C = Context<Environment>;
const text = z.string().trim().min(1).max(150);
const money = z.coerce.number().int().min(0).max(100000000000);
const positive = z.coerce
  .number()
  .positive()
  .max(100000000)
  .refine((n) => D(n).decimalPlaces() <= 6, "Maksimal 6 angka desimal.");
const id = z.string().uuid();
const date = z.iso.date();
const sourceAccount = z.enum(["cash", "safe", "bank"]);
const activeShift = async (tx: Queryable, bid: string) => {
  const shift = (
    await tx.query(
      "SELECT * FROM shifts WHERE business_id=$1 AND closed_at IS NULL",
      [bid],
    )
  ).rows[0];
  if (!shift) throw new DomainError("Buka shift terlebih dahulu.");
  return shift;
};
const operator = (c: C) => {
  if (!["owner", "manager"].includes(c.get("user").role))
    throw new DomainError("Akses manager diperlukan.", 403);
};
const owner = (c: C) => {
  if (c.get("user").role !== "owner")
    throw new DomainError("Tindakan ini membutuhkan akses pemilik.", 403);
};
async function audit(tx: Queryable, user: User, action: string, details: any) {
  await tx.query(
    "INSERT INTO audit_logs(id,business_id,user_id,action,details) VALUES($1,$2,$3,$4,$5)",
    [uid(), user.business_id, user.id, action, JSON.stringify(details)],
  );
}
async function body<T>(c: C, schema: z.ZodType<T>): Promise<T> {
  let input;
  try {
    input = await c.req.json();
  } catch {
    throw new DomainError("Format data tidak valid.");
  }
  const result = schema.safeParse(input);
  if (!result.success)
    throw new DomainError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      422,
    );
  return result.data;
}
async function mutate(
  c: C,
  action: string,
  input: any,
  fn: (tx: Queryable, user: User, business: any, day: string) => Promise<any>,
  allowClosed = false,
) {
  const user = c.get("user"),
    key = c.req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 100)
    throw new DomainError("Kunci transaksi diperlukan.");
  const requestHash = await hash(
    JSON.stringify({ user: user.id, action, input }),
  );
  const result = await c.get("db").transaction(async (tx) => {
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      user.organization_id,
    ]);
    const active = (await accessibleOutlets(tx, user.id)).find(
      (o) => o.id === user.business_id,
    );
    if (!active || active.role !== user.role)
      throw new DomainError(
        "Akses berubah. Muat ulang atau masuk kembali.",
        403,
      );
    const business = (
      await tx.query("SELECT * FROM businesses WHERE id=$1 FOR UPDATE", [
        user.business_id,
      ])
    ).rows[0];
    await tx.query("SELECT set_config('app.business_id',$1,true)", [
      user.business_id,
    ]);
    const old = (
      await tx.query(
        "SELECT * FROM idempotency_records WHERE business_id=$1 AND key=$2",
        [user.business_id, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== requestHash)
        throw new DomainError(
          "Kunci transaksi sudah dipakai untuk data berbeda.",
          409,
        );
      return old.response;
    }
    const day = businessDay(business.timezone);
    if (
      !allowClosed &&
      business.closed_through &&
      (business.closed_through instanceof Date
        ? business.closed_through.toISOString()
        : String(business.closed_through)
      ).slice(0, 10) >= day
    )
      throw new DomainError(
        "Periode hari ini sudah dikunci. Buka kembali melalui pengaturan.",
        409,
      );
    await syncOperationalDocuments(tx, user.business_id, user);
    const data = await fn(tx, user, business, day);
    await syncOperationalDocuments(tx, user.business_id, user);
    await audit(tx, user, action, {
      input:
        action === "user.create"
          ? {
              name: input.name,
              email: input.email,
              role: input.role,
              outletIds: input.outletIds || [user.business_id],
            }
          : input,
      result: data,
    });
    await tx.query(
      "INSERT INTO idempotency_records(business_id,key,request_hash,response) VALUES($1,$2,$3,$4)",
      [user.business_id, key, requestHash, JSON.stringify(data)],
    );
    return data;
  });
  return c.json(result);
}

export function createApp(
  db: Database,
  options: {
    demo?: boolean;
    localOrigin?: string;
  } = {},
) {
  const app = new Hono<Environment>();
  app.use("*", secureHeaders());
  app.use("/api/*", async (c, next) => {
    c.set("db", db);
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (
        origin &&
        origin !== new URL(c.req.url).origin &&
        origin !== options.localOrigin
      )
        throw new DomainError("Permintaan berasal dari situs berbeda.", 403);
      if (!origin && getCookie(c, "omzetin_session"))
        throw new DomainError("Origin diperlukan untuk perubahan data.", 403);
    }
    await next();
  });
  app.get("/api/health", (c) => c.json({ status: "ok", app: "omzetin" }));
  app.get("/api/setup", (c) => c.json({ demo: !!options.demo }));
  app.post("/api/register", async (c) => {
    if (getCookie(c, "omzetin_session"))
      throw new DomainError(
        "Gunakan pengaturan untuk menambahkan bisnis ke akun yang sudah masuk.",
        409,
      );
    const input = await body(
      c,
      z.object({
        name: text,
        outlet: text,
        owner: text,
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
        capital: money,
      }),
    );
    const attemptKey = await hash(
      "register:" + (c.req.header("CF-Connecting-IP") || "local"),
    );
    const attempt = (
      await db.query(
        `INSERT INTO login_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
        [attemptKey],
      )
    ).rows[0];
    if (attempt.attempts > 5)
      throw new DomainError(
        "Terlalu banyak pendaftaran. Coba lagi dalam 15 menit.",
        429,
      );
    const token = uid() + uid(),
      tokenHash = await hash(token);
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        input.email,
      ]);
      if (
        (await tx.query("SELECT id FROM users WHERE email=$1", [input.email]))
          .rows.length
      )
        throw new DomainError(
          "Email sudah terdaftar. Silakan masuk dengan akun tersebut.",
          409,
        );
      const pw = await passwordHash(tx, input.password);
      const created = await createBusiness(tx, { ...input, passwordHash: pw });
      await tx.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [tokenHash, created.userId],
      );
    });
    setCookie(c, "omzetin_session", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
      path: "/",
      maxAge: 28800,
    });
    return c.json({ ok: true }, 201);
  });
  app.post("/api/login", async (c) => {
    const input = await body(
      c,
      z.object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      }),
    );
    const loginKey = await hash(input.email);
    const attempt = (
      await db.query(
        `INSERT INTO login_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
        [loginKey],
      )
    ).rows[0];
    if (attempt.attempts > 10)
      throw new DomainError(
        "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.",
        429,
      );
    const user = (
      await db.query("SELECT * FROM users WHERE email=$1", [input.email])
    ).rows[0];
    const valid = await verifyPassword(db, input.password, user?.password_hash);
    if (!user || !valid)
      throw new DomainError("Email atau kata sandi salah.", 401);
    const token = uid() + uid();
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [await hash(token), user.id],
    );
    await db.query("DELETE FROM login_attempts WHERE key=$1", [loginKey]);
    setCookie(c, "omzetin_session", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
      path: "/",
      maxAge: 28800,
    });
    return c.json({ ok: true });
  });
  app.use("/api/*", async (c, next) => {
    const token = getCookie(c, "omzetin_session");
    if (!token) throw new DomainError("Silakan masuk terlebih dahulu.", 401);
    const user = (
      await db.query(
        "SELECT u.id,u.business_id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [await hash(token)],
      )
    ).rows[0];
    if (!user)
      throw new DomainError("Sesi telah berakhir. Silakan masuk kembali.", 401);
    const outlets = await accessibleOutlets(db, user.id),
      requested = c.req.header("X-Outlet-Id");
    const selected = requested
      ? outlets.find((o) => o.id === requested)
      : outlets.find((o) => o.id === user.business_id) || outlets[0];
    if (!selected)
      throw new DomainError("Kamu tidak memiliki akses ke outlet ini.", 403);
    c.set("user", {
      ...user,
      business_id: selected.id,
      organization_id: selected.organization_id,
      role: selected.role,
      member_role: selected.member_role,
    } as User);
    c.set("outlets", outlets);
    await next();
  });
  app.use("/api/*", async (c, next) => {
    if (
      c.get("user").role === "investor" &&
      !["/api/state", "/api/logout"].includes(c.req.path) &&
      !(
        c.req.path.startsWith("/api/core/reports") ||
        c.req.path === "/api/core/state"
      )
    )
      throw new DomainError(
        "Investor hanya dapat membaca laporan terbit.",
        403,
      );
    await next();
  });
  registerCore(app, mutate);
  app.post("/api/logout", async (c) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      await hash(getCookie(c, "omzetin_session")!),
    ]);
    deleteCookie(c, "omzetin_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/api/state", async (c) => {
    const user = c.get("user"),
      bid = user.business_id;
    const state = await db.transaction(async (tx) => {
      const business = (
        await tx.query("SELECT * FROM businesses WHERE id=$1 FOR SHARE", [bid])
      ).rows[0];
      await tx.query("SELECT set_config('app.business_id',$1,true)", [bid]);
      const day = businessDay(business.timezone);
      if (user.role === "investor")
        return {
          user,
          business: {
            id: business.id,
            organization_id: business.organization_id,
            name: business.name,
            outlet_name: business.outlet_name,
            timezone: business.timezone,
          },
          day,
          products: [],
          orders: [],
          shifts: [],
          currentShift: null,
        };
      const ingredients = (
        await tx.query(
          "SELECT *, (quantity-reserved)::text available, CASE WHEN quantity>0 THEN (value/quantity)::text ELSE '0' END unit_cost FROM ingredients WHERE business_id=$1 ORDER BY name",
          [bid],
        )
      ).rows;
      const products: any[] = (
        await tx.query(
          "SELECT * FROM products WHERE business_id=$1 ORDER BY created_at,name",
          [bid],
        )
      ).rows.map((p) => ({
        ...p,
        available:
          p.recipe.length === 0
            ? 0
            : Math.min(
                ...p.recipe.map((r: any) => {
                  const i = ingredients.find((i) => i.id === r.ingredientId);
                  return i
                    ? D(i.available).div(r.quantity).floor().toNumber()
                    : 0;
                }),
              ),
      }));
      const orders = (
        await tx.query(
          "SELECT o.*,u.name cashier FROM orders o JOIN users u ON u.id=o.user_id WHERE o.business_id=$1 ORDER BY o.number DESC LIMIT 200",
          [bid],
        )
      ).rows;
      const shifts = (
        await tx.query(
          "SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.business_id=$1 ORDER BY s.opened_at DESC LIMIT 30",
          [bid],
        )
      ).rows;
      const currentShift = shifts.find((s) => !s.closed_at) || null;
      let expected = "0";
      if (currentShift)
        expected = (
          await tx.query(
            "SELECT COALESCE(sum(l.debit-l.credit),0)::text amount FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=$1 AND e.shift_id=$2 AND l.account='cash'",
            [bid, currentShift.id],
          )
        ).rows[0].amount;
      if (user.role === "manager")
        return {
          user,
          business,
          day,
          products,
          ingredients,
          orders,
          shifts,
          currentShift: currentShift ? { ...currentShift, expected } : null,
          movements: (
            await tx.query(
              "SELECT s.*,i.name,i.unit FROM stock_movements s JOIN ingredients i ON i.id=s.ingredient_id WHERE s.business_id=$1 ORDER BY s.created_at DESC LIMIT 100",
              [bid],
            )
          ).rows,
        };
      if (user.role !== "owner")
        return {
          user,
          business,
          day,
          products: products.map(({ recipe, ...p }) => p),
          orders: orders.map(({ cost, consumption, ...o }) => ({
            ...o,
            items: o.items.map(({ recipe, ...item }: any) => item),
          })),
          shifts: shifts.filter((s) => s.user_id === user.id),
          currentShift:
            currentShift?.user_id === user.id
              ? { ...currentShift, expected }
              : null,
        };
      const balances = (
        await tx.query(
          "SELECT account,sum(debit)::text debit,sum(credit)::text credit,sum(debit-credit)::text balance FROM journal_lines WHERE business_id=$1 GROUP BY account ORDER BY account",
          [bid],
        )
      ).rows;
      const daily = (
        await tx.query(
          `SELECT e.business_date::text AS "day", sum(CASE WHEN l.account='sales' THEN l.credit-l.debit WHEN l.account IN ('discount','returns') THEN l.credit-l.debit ELSE 0 END)::text sales, sum(CASE WHEN l.account='cogs' THEN l.debit-l.credit ELSE 0 END)::text cost FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE e.business_id=$1 AND e.business_date>=$2::date-13 GROUP BY e.business_date ORDER BY e.business_date`,
          [bid, day],
        )
      ).rows;
      const journals = (
        await tx.query(
          "SELECT e.*,json_agg(json_build_object('account',l.account,'debit',l.debit::text,'credit',l.credit::text)) lines FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE e.business_id=$1 GROUP BY e.id ORDER BY e.created_at DESC LIMIT 100",
          [bid],
        )
      ).rows;
      const expenses = (
        await tx.query(
          "SELECT * FROM expenses WHERE business_id=$1 ORDER BY created_at DESC LIMIT 100",
          [bid],
        )
      ).rows;
      const movements = (
        await tx.query(
          "SELECT s.*,i.name,i.unit FROM stock_movements s JOIN ingredients i ON i.id=s.ingredient_id WHERE s.business_id=$1 ORDER BY s.created_at DESC LIMIT 100",
          [bid],
        )
      ).rows;
      const settlements = (
        await tx.query(
          "SELECT * FROM settlements WHERE business_id=$1 ORDER BY created_at DESC LIMIT 100",
          [bid],
        )
      ).rows;
      const users = (
        await tx.query(
          `SELECT u.id,u.name,u.email,CASE WHEN m.user_id IS NOT NULL THEN 'owner' ELSE 'cashier' END role,
 (SELECT COALESCE(json_agg(json_build_object('id',b.id,'name',b.outlet_name)),'[]') FROM outlet_cashiers a JOIN businesses b ON b.id=a.outlet_id WHERE a.user_id=u.id AND b.organization_id=$1) assigned_outlets
 FROM users u LEFT JOIN organization_owners m ON m.user_id=u.id AND m.organization_id=$1
 WHERE m.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM outlet_cashiers a JOIN businesses b ON b.id=a.outlet_id WHERE a.user_id=u.id AND b.organization_id=$1) ORDER BY u.name`,
          [business.organization_id],
        )
      ).rows;
      const auditLogs = (
        await tx.query(
          "SELECT a.id,a.action,a.created_at,u.name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.business_id=$1 ORDER BY a.created_at DESC LIMIT 40",
          [bid],
        )
      ).rows;
      const dailyAccounts = (
        await tx.query(
          "SELECT l.account,sum(l.debit-l.credit)::text amount FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=$1 AND e.business_date=$2 GROUP BY l.account",
          [bid, day],
        )
      ).rows;
      return {
        user,
        business,
        day,
        products,
        orders,
        ingredients,
        shifts,
        currentShift: currentShift ? { ...currentShift, expected } : null,
        balances,
        daily,
        journals,
        expenses,
        movements,
        settlements,
        users,
        auditLogs,
        dailyAccounts,
        accountNames: accounts,
      };
    });
    return c.json({ ...state, outlets: c.get("outlets") });
  });
  app.get("/api/orders/:id", async (c) => {
    const user = c.get("user"),
      order = (
        await db.query(
          `SELECT o.*,u.name cashier,b.outlet_name FROM orders o JOIN users u ON u.id=o.user_id JOIN businesses b ON b.id=o.business_id WHERE o.id=$1 AND (o.business_id=$2 OR ($3='owner' AND b.organization_id=$4))`,
          [
            id.parse(c.req.param("id")),
            user.business_id,
            user.role,
            user.organization_id,
          ],
        )
      ).rows[0];
    if (!order) throw new DomainError("Pesanan tidak ditemukan.", 404);
    if (user.role !== "owner") {
      delete order.cost;
      delete order.consumption;
      order.items = order.items.map(({ recipe, ...item }: any) => item);
    }
    return c.json(order);
  });
  app.get("/api/reports", async (c) => {
    owner(c);
    const from = date.parse(c.req.query("from")),
      to = date.parse(c.req.query("to"));
    if (from > to)
      throw new DomainError("Tanggal awal harus sebelum tanggal akhir.");
    const user = c.get("user"),
      scope = c.req.query("scope") || "outlet";
    if (!["outlet", "organization"].includes(scope))
      throw new DomainError("Cakupan laporan tidak valid.", 422);
    const outletIds =
      scope === "organization"
        ? c
            .get("outlets")
            .filter(
              (o) =>
                o.organization_id === user.organization_id &&
                o.role === "owner",
            )
            .map((o) => o.id)
        : [user.business_id];
    const result = await db.transaction(async (tx) => {
      await tx.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const period = (
        await tx.query(
          "SELECT l.account,sum(l.debit)::text debit,sum(l.credit)::text credit,sum(l.debit-l.credit)::text balance FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=ANY($1::uuid[]) AND e.business_date BETWEEN $2::date AND $3::date GROUP BY l.account ORDER BY l.account",
          [outletIds, from, to],
        )
      ).rows;
      const closing = (
        await tx.query(
          "SELECT l.account,sum(l.debit)::text debit,sum(l.credit)::text credit,sum(l.debit-l.credit)::text balance FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=ANY($1::uuid[]) AND e.business_date<=$2::date GROUP BY l.account ORDER BY l.account",
          [outletIds, to],
        )
      ).rows;
      const opening = (
        await tx.query(
          "SELECT l.account,sum(l.debit-l.credit)::text balance FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=ANY($1::uuid[]) AND e.business_date<$2::date AND l.account IN ('cash','safe','bank') GROUP BY l.account",
          [outletIds, from],
        )
      ).rows;
      const journals = (
        await tx.query(
          "SELECT e.*,b.outlet_name,json_agg(json_build_object('account',l.account,'debit',l.debit::text,'credit',l.credit::text)) lines FROM journal_entries e JOIN businesses b ON b.id=e.business_id JOIN journal_lines l ON l.entry_id=e.id WHERE e.business_id=ANY($1::uuid[]) AND e.business_date BETWEEN $2::date AND $3::date GROUP BY e.id,b.outlet_name ORDER BY e.business_date DESC,e.created_at DESC LIMIT 100",
          [outletIds, from, to],
        )
      ).rows;
      return { from, to, scope, outletIds, period, closing, opening, journals };
    });
    return c.json(result);
  });
  app.post("/api/shifts/open", async (c) => {
    const input = await body(
      c,
      z.object({ opening: money, label: text.optional() }),
    );
    return mutate(c, "shift.open", input, async (tx, user, _b, day) => {
      if (
        (
          await tx.query(
            "SELECT id FROM shifts WHERE business_id=$1 AND closed_at IS NULL",
            [user.business_id],
          )
        ).rows.length
      )
        throw new DomainError("Masih ada shift yang aktif.", 409);
      await requireFunds(tx, user.business_id, "safe", input.opening);
      const sid = uid();
      const schedule = _b.operating_schedule;
      const label = input.label || schedule.shifts[0].name;
      if (!schedule.shifts.some((s: any) => s.name === label))
        throw new DomainError("Shift tidak tersedia.", 422);
      await tx.query(
        "INSERT INTO shifts(id,business_id,user_id,opening,label,business_date) VALUES($1,$2,$3,$4,$5,$6)",
        [sid, user.business_id, user.id, input.opening, label, day],
      );
      if (input.opening)
        await post(
          tx,
          user.business_id,
          day,
          `shift-open:${sid}`,
          "Modal kas shift",
          [
            { account: "cash", debit: input.opening },
            { account: "safe", credit: input.opening },
          ],
          sid,
        );
      return { id: sid };
    });
  });
  app.post("/api/shifts/close", async (c) => {
    const input = await body(
      c,
      z.object({ counted: money, note: z.string().trim().max(500) }),
    );
    return mutate(c, "shift.close", input, async (tx, user, _b, day) => {
      const shift = await activeShift(tx, user.business_id);
      if (shift.user_id !== user.id) operator(c);
      if (
        (
          await tx.query(
            "SELECT id FROM orders WHERE business_id=$1 AND status='queued' LIMIT 1",
            [user.business_id],
          )
        ).rows.length
      )
        throw new DomainError(
          "Selesaikan atau batalkan pesanan yang masih antre.",
        );
      const expected = D(
        (
          await tx.query(
            "SELECT COALESCE(sum(l.debit-l.credit),0)::text amount FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.business_id=$1 AND e.shift_id=$2 AND l.account='cash'",
            [user.business_id, shift.id],
          )
        ).rows[0].amount,
      );
      const difference = D(input.counted).minus(expected);
      if (!difference.eq(0)) {
        if (!input.note) throw new DomainError("Jelaskan alasan selisih kas.");
        await post(
          tx,
          user.business_id,
          day,
          `shift-difference:${shift.id}`,
          "Selisih hitung kas",
          difference.gt(0)
            ? [
                { account: "cash", debit: difference },
                { account: "variance", credit: difference },
              ]
            : [
                { account: "variance", debit: difference.abs() },
                { account: "cash", credit: difference.abs() },
              ],
          shift.id,
        );
      }
      if (input.counted)
        await post(
          tx,
          user.business_id,
          day,
          `shift-close:${shift.id}`,
          "Setor kas shift ke brankas",
          [
            { account: "safe", debit: input.counted },
            { account: "cash", credit: input.counted },
          ],
          shift.id,
        );
      const transfers = (
        await tx.query(
          "SELECT COALESCE(sum(total),0)::text amount FROM orders WHERE business_id=$1 AND shift_id=$2 AND channel='transfer' AND status='fulfilled'",
          [user.business_id, shift.id],
        )
      ).rows[0].amount;
      if (D(transfers).gt(0))
        await post(
          tx,
          user.business_id,
          day,
          `transfer-final:${shift.id}`,
          "Transfer terverifikasi pada shift",
          [
            { account: "bank", debit: transfers },
            { account: "clearing", credit: transfers },
          ],
          shift.id,
        );
      await tx.query(
        "UPDATE shifts SET closed_at=now(),counted=$1,expected=$2,difference=$3,note=$4 WHERE id=$5 AND business_id=$6",
        [
          input.counted,
          fixed(expected),
          fixed(difference),
          input.note,
          shift.id,
          user.business_id,
        ],
      );
      return { expected: fixed(expected), difference: fixed(difference) };
    });
  });
  app.post("/api/orders", async (c) => {
    const input = await body(
      c,
      z.object({
        items: z
          .array(
            z.object({
              productId: id,
              quantity: z.number().int().min(1).max(100),
            }),
          )
          .min(1)
          .max(50),
        discount: money,
        paymentMethod: z.enum(["cash", "digital"]),
        channel: channelSchema.optional(),
        tendered: money,
        reference: z.string().trim().max(150),
        service: z.enum(["dine_in", "takeaway"]),
        note: z.string().trim().max(500),
      }),
    );
    if (input.discount) operator(c);
    return mutate(c, "order.pay", input, async (tx, user, _b, day) => {
      const bid = user.business_id,
        shift = await activeShift(tx, bid);
      if (shift.user_id !== user.id)
        throw new DomainError("Shift sedang digunakan kasir lain.", 409);
      const paymentChannel =
        input.channel || (input.paymentMethod === "cash" ? "cash" : "qris");
      if ((paymentChannel === "cash") !== (input.paymentMethod === "cash"))
        throw new DomainError("Kanal dan metode pembayaran tidak cocok.", 422);
      const snapshot: any[] = [],
        consumption: Record<string, any> = {};
      let subtotal = D(0);
      for (const item of input.items) {
        const product = (
          await tx.query(
            "SELECT * FROM products WHERE id=$1 AND business_id=$2 AND active=true",
            [item.productId, bid],
          )
        ).rows[0];
        if (!product) throw new DomainError("Menu tidak tersedia.");
        if (!product.recipe.length)
          throw new DomainError(`Resep ${product.name} belum diisi.`);
        subtotal = subtotal.plus(D(product.price).mul(item.quantity));
        snapshot.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          recipe: product.recipe,
        });
        for (const r of product.recipe) {
          const existing = consumption[r.ingredientId]?.quantity || "0";
          consumption[r.ingredientId] = {
            ingredientId: r.ingredientId,
            quantity: fixed(D(existing).plus(D(r.quantity).mul(item.quantity))),
          };
        }
      }
      const total = subtotal.minus(input.discount);
      if (total.lte(0))
        throw new DomainError("Diskon harus lebih kecil dari subtotal.");
      if (input.paymentMethod === "cash" && D(input.tendered).lt(total))
        throw new DomainError("Uang diterima kurang dari total tagihan.");
      if (input.paymentMethod === "digital" && !input.reference)
        throw new DomainError("Referensi pembayaran digital wajib diisi.");
      for (const item of Object.values(consumption)) {
        const ingredient = (
          await tx.query(
            "SELECT * FROM ingredients WHERE id=$1 AND business_id=$2 FOR UPDATE",
            [item.ingredientId, bid],
          )
        ).rows[0];
        if (
          !ingredient ||
          D(ingredient.quantity).minus(ingredient.reserved).lt(item.quantity)
        )
          throw new DomainError(
            `Stok ${ingredient?.name || "bahan"} tidak mencukupi.`,
          );
        await tx.query(
          "UPDATE ingredients SET reserved=reserved+$1 WHERE id=$2 AND business_id=$3",
          [item.quantity, item.ingredientId, bid],
        );
        item.name = ingredient.name;
        item.unit = ingredient.unit;
      }
      const oid = uid();
      const row = (
        await tx.query(
          "INSERT INTO orders(id,business_id,shift_id,user_id,items,consumption,subtotal,discount,total,payment_method,tendered,reference,service,note,business_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id,number,total,status",
          [
            oid,
            bid,
            shift.id,
            user.id,
            JSON.stringify(snapshot),
            JSON.stringify(Object.values(consumption)),
            subtotal.toFixed(0),
            input.discount,
            total.toFixed(0),
            input.paymentMethod,
            input.paymentMethod === "digital"
              ? total.toFixed(0)
              : input.tendered,
            input.reference,
            input.service,
            input.note,
            day,
          ],
        )
      ).rows[0];
      await tx.query("UPDATE orders SET channel=$1 WHERE id=$2", [
        paymentChannel,
        oid,
      ]);
      await post(
        tx,
        bid,
        day,
        `payment:${oid}`,
        `Pembayaran pesanan #${row.number}`,
        [
          {
            account: input.paymentMethod === "cash" ? "cash" : "clearing",
            debit: total,
          },
          { account: "advance", credit: total },
        ],
        shift.id,
        oid,
      );
      return {
        ...row,
        change:
          input.paymentMethod === "cash"
            ? D(input.tendered).minus(total).toFixed(0)
            : "0",
      };
    });
  });
  app.post("/api/orders/:id/fulfill", async (c) => {
    const oid = id.parse(c.req.param("id"));
    return mutate(
      c,
      "order.fulfill",
      { id: oid },
      async (tx, user, _b, day) => {
        const order = (
          await tx.query(
            "SELECT * FROM orders WHERE id=$1 AND business_id=$2 FOR UPDATE",
            [oid, user.business_id],
          )
        ).rows[0];
        if (!order) throw new DomainError("Pesanan tidak ditemukan.", 404);
        if (order.status !== "queued")
          throw new DomainError("Pesanan sudah diproses.", 409);
        let cost = D(0);
        const consumption = [];
        for (const r of order.consumption) {
          const ingredient = (
            await tx.query(
              "SELECT * FROM ingredients WHERE id=$1 AND business_id=$2 FOR UPDATE",
              [r.ingredientId, user.business_id],
            )
          ).rows[0];
          const value = consumptionCost(
            ingredient.quantity,
            ingredient.value,
            r.quantity,
          );
          cost = cost.plus(value);
          consumption.push({ ...r, cost: fixed(value) });
          await tx.query(
            "UPDATE ingredients SET quantity=quantity-$1,reserved=reserved-$1,value=value-$2 WHERE id=$3 AND business_id=$4",
            [r.quantity, fixed(value), r.ingredientId, user.business_id],
          );
          await tx.query(
            "INSERT INTO stock_movements(id,business_id,ingredient_id,kind,quantity,value,note,order_id) VALUES($1,$2,$3,'consumption',$4,$5,$6,$7)",
            [
              uid(),
              user.business_id,
              r.ingredientId,
              fixed(D(r.quantity).neg()),
              fixed(value.neg()),
              `Pesanan #${order.number}`,
              oid,
            ],
          );
        }
        const lines: any[] = [
          { account: "advance", debit: order.total },
          { account: "sales", credit: order.subtotal },
        ];
        if (D(order.discount).gt(0))
          lines.push({ account: "discount", debit: order.discount });
        if (cost.gt(0))
          lines.push(
            { account: "cogs", debit: cost },
            { account: "inventory", credit: cost },
          );
        await post(
          tx,
          user.business_id,
          day,
          `sale:${oid}`,
          `Penyerahan pesanan #${order.number}`,
          lines,
          order.shift_id,
          oid,
        );
        await tx.query(
          "UPDATE orders SET status='fulfilled',fulfilled_at=now(),cost=$1,consumption=$2,fulfilled_business_date=$5 WHERE id=$3 AND business_id=$4",
          [
            fixed(cost),
            JSON.stringify(consumption),
            oid,
            user.business_id,
            day,
          ],
        );
        return { ok: true };
      },
    );
  });
  app.post("/api/orders/:id/refund", async (c) => {
    operator(c);
    const oid = id.parse(c.req.param("id"));
    const input = await body(
      c,
      z.object({ reason: text, prepared: z.boolean() }),
    );
    return mutate(
      c,
      "order.refund",
      { id: oid, ...input },
      async (tx, user, _b, day) => {
        const order = (
          await tx.query(
            "SELECT * FROM orders WHERE id=$1 AND business_id=$2 FOR UPDATE",
            [oid, user.business_id],
          )
        ).rows[0];
        if (!order) throw new DomainError("Pesanan tidak ditemukan.", 404);
        if (!["queued", "fulfilled"].includes(order.status))
          throw new DomainError("Pesanan sudah dibatalkan atau direfund.", 409);
        const shift = await activeShift(tx, user.business_id);
        const doc = (
          await tx.query(
            "SELECT d.*,COALESCE((SELECT sum(gross) FROM income_receipts WHERE document_id=d.id),0)::text received FROM operational_documents d WHERE business_id=$1 AND source_key=$2 FOR UPDATE",
            [user.business_id, `shift:${order.shift_id}:${order.channel}`],
          )
        ).rows[0];
        const credits: any[] = [];
        if (order.payment_method === "cash")
          credits.push({ account: "cash", credit: order.total });
        else if (doc && order.channel === "transfer")
          credits.push({ account: "bank", credit: order.total });
        else if (doc) {
          const outstanding = D(doc.amount).minus(doc.received),
            unreceived = outstanding.lt(order.total)
              ? outstanding
              : D(order.total),
            returned = D(order.total).minus(unreceived);
          if (unreceived.gt(0)) {
            const original = (
              await tx.query(
                "SELECT closed_through FROM businesses WHERE id=$1",
                [user.business_id],
              )
            ).rows[0];
            if (
              original.closed_through &&
              (original.closed_through instanceof Date
                ? original.closed_through.toISOString()
                : String(original.closed_through)
              ).slice(0, 10) >=
                (doc.business_date instanceof Date
                  ? doc.business_date.toISOString()
                  : String(doc.business_date)
                ).slice(0, 10)
            )
              throw new DomainError(
                "Buka periode asal sebelum mengoreksi dana platform yang belum cair.",
                409,
              );
            credits.push({ account: "clearing", credit: unreceived });
            await tx.query(
              "UPDATE operational_documents SET amount=amount-$1,status='submitted',version=version+1,reviewed_by=NULL,reviewed_at=NULL,review_note=$2 WHERE id=$3",
              [unreceived.toFixed(0), input.reason, doc.id],
            );
          }
          if (returned.gt(0))
            credits.push({ account: "bank", credit: returned });
        } else credits.push({ account: "clearing", credit: order.total });
        for (const line of credits)
          await requireFunds(tx, user.business_id, line.account, line.credit);
        if (order.status === "queued")
          for (const r of order.consumption) {
            const ingredient = (
              await tx.query(
                "SELECT * FROM ingredients WHERE id=$1 AND business_id=$2 FOR UPDATE",
                [r.ingredientId, user.business_id],
              )
            ).rows[0];
            await tx.query(
              "UPDATE ingredients SET reserved=reserved-$1 WHERE id=$2 AND business_id=$3",
              [r.quantity, r.ingredientId, user.business_id],
            );
            if (input.prepared) {
              const value = consumptionCost(
                ingredient.quantity,
                ingredient.value,
                r.quantity,
              );
              await tx.query(
                "UPDATE ingredients SET quantity=quantity-$1,value=value-$2 WHERE id=$3 AND business_id=$4",
                [r.quantity, fixed(value), r.ingredientId, user.business_id],
              );
              await tx.query(
                "INSERT INTO stock_movements(id,business_id,ingredient_id,kind,quantity,value,note,order_id) VALUES($1,$2,$3,'waste',$4,$5,$6,$7)",
                [
                  uid(),
                  user.business_id,
                  r.ingredientId,
                  fixed(D(r.quantity).neg()),
                  fixed(value.neg()),
                  input.reason,
                  oid,
                ],
              );
              if (value.gt(0))
                await post(
                  tx,
                  user.business_id,
                  day,
                  `cancel-waste:${oid}:${r.ingredientId}`,
                  `Waste pembatalan #${order.number}`,
                  [
                    { account: "waste", debit: value },
                    { account: "inventory", credit: value },
                  ],
                  shift.id,
                  oid,
                );
            }
          }
        await post(
          tx,
          user.business_id,
          day,
          `refund:${oid}`,
          `Refund pesanan #${order.number}: ${input.reason}`,
          [
            {
              account: order.status === "queued" ? "advance" : "returns",
              debit: order.total,
            },
            ...credits,
          ],
          shift.id,
          oid,
        );
        await tx.query(
          "UPDATE orders SET status=$1,reason=$2 WHERE id=$3 AND business_id=$4",
          [
            order.status === "queued" ? "cancelled" : "refunded",
            input.reason,
            oid,
            user.business_id,
          ],
        );
        return { ok: true };
      },
    );
  });
  app.post("/api/ingredients", async (c) => {
    operator(c);
    const input = await body(
      c,
      z.object({
        name: text,
        unit: z.enum(["g", "ml", "pcs"]),
        minimum: money,
      }),
    );
    return mutate(c, "ingredient.create", input, async (tx, user) => {
      const iid = uid();
      await tx.query(
        "INSERT INTO ingredients(id,business_id,name,unit,minimum) VALUES($1,$2,$3,$4,$5)",
        [iid, user.business_id, input.name, input.unit, input.minimum],
      );
      return { id: iid };
    });
  });
  app.post("/api/products", async (c) => {
    operator(c);
    const input = await body(
      c,
      z.object({
        id: id.optional(),
        name: text,
        category: text,
        price: money.refine((n) => n > 0),
        description: z.string().trim().max(300),
        emoji: z.string().max(8),
        color: z.enum(["sage", "cream", "sand", "coffee", "cocoa", "peach"]),
        recipe: z
          .array(z.object({ ingredientId: id, quantity: positive }))
          .min(1)
          .max(30),
        active: z.boolean().default(true),
      }),
    );
    return mutate(c, "product.save", input, async (tx, user) => {
      if (
        new Set(input.recipe.map((r) => r.ingredientId)).size !==
        input.recipe.length
      )
        throw new DomainError("Bahan resep tidak boleh berulang.");
      for (const r of input.recipe)
        if (
          !(
            await tx.query(
              "SELECT id FROM ingredients WHERE id=$1 AND business_id=$2",
              [r.ingredientId, user.business_id],
            )
          ).rows.length
        )
          throw new DomainError("Bahan resep tidak ditemukan.");
      const pid = input.id || uid();
      if (input.id) {
        const old = (
          await tx.query(
            "SELECT id FROM products WHERE id=$1 AND business_id=$2",
            [pid, user.business_id],
          )
        ).rows[0];
        if (!old) throw new DomainError("Menu tidak ditemukan.", 404);
        await tx.query(
          "UPDATE products SET name=$1,category=$2,price=$3,description=$4,emoji=$5,color=$6,recipe=$7,active=$8 WHERE id=$9 AND business_id=$10",
          [
            input.name,
            input.category,
            input.price,
            input.description,
            input.emoji,
            input.color,
            JSON.stringify(input.recipe),
            input.active,
            pid,
            user.business_id,
          ],
        );
      } else
        await tx.query(
          "INSERT INTO products(id,business_id,name,category,price,description,emoji,color,recipe,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            pid,
            user.business_id,
            input.name,
            input.category,
            input.price,
            input.description,
            input.emoji,
            input.color,
            JSON.stringify(input.recipe),
            input.active,
          ],
        );
      return { id: pid };
    });
  });
  app.post("/api/stock", async (c) => {
    operator(c);
    const input = await body(
      c,
      z
        .object({
          ingredientId: id,
          kind: z.enum(["purchase", "waste", "stocktake"]),
          quantity: z.coerce
            .number()
            .min(0)
            .max(100000000)
            .refine((n) => D(n).decimalPlaces() <= 6),
          value: money,
          account: sourceAccount,
          note: text,
        })
        .refine((v) => v.kind === "stocktake" || v.quantity > 0, {
          message: "Kuantitas harus lebih dari nol.",
          path: ["quantity"],
        }),
    );
    return mutate(
      c,
      `stock.${input.kind}`,
      input,
      async (tx, user, _b, day) => {
        const bid = user.business_id,
          ingredient = (
            await tx.query(
              "SELECT * FROM ingredients WHERE id=$1 AND business_id=$2 FOR UPDATE",
              [input.ingredientId, bid],
            )
          ).rows[0];
        if (!ingredient) throw new DomainError("Bahan tidak ditemukan.", 404);
        const sid =
          input.account === "cash" ? (await activeShift(tx, bid)).id : null;
        let qty = D(input.quantity),
          value = D(input.value),
          lines: any[] = [];
        const mid = uid();
        if (input.kind === "purchase") {
          if (value.lte(0))
            throw new DomainError("Nilai pembelian harus lebih dari nol.");
          await requireFunds(tx, bid, input.account, value);
          lines = [
            { account: "inventory", debit: value },
            { account: input.account, credit: value },
          ];
        } else {
          qty =
            input.kind === "waste" ? qty.neg() : qty.minus(ingredient.quantity);
          if (D(ingredient.quantity).plus(qty).lt(ingredient.reserved))
            throw new DomainError(
              "Stok yang dicadangkan untuk pesanan tidak boleh dikurangi.",
            );
          if (qty.eq(0))
            throw new DomainError("Jumlah fisik sama dengan saldo stok.");
          if (qty.lt(0))
            value = consumptionCost(
              ingredient.quantity,
              ingredient.value,
              qty.abs(),
            ).neg();
          else {
            if (D(ingredient.quantity).lte(0))
              throw new DomainError(
                "Stok kosong. Gunakan pembelian untuk menetapkan nilai bahan.",
              );
            value = D(ingredient.value)
              .div(ingredient.quantity)
              .mul(qty)
              .toDecimalPlaces(6);
          }
          const account = input.kind === "waste" ? "waste" : "variance";
          lines = value.gt(0)
            ? [
                { account: "inventory", debit: value },
                { account, credit: value },
              ]
            : [
                { account, debit: value.abs() },
                { account: "inventory", credit: value.abs() },
              ];
        }
        await tx.query(
          "UPDATE ingredients SET quantity=quantity+$1,value=value+$2 WHERE id=$3 AND business_id=$4",
          [fixed(qty), fixed(value), ingredient.id, bid],
        );
        await tx.query(
          "INSERT INTO stock_movements(id,business_id,ingredient_id,kind,quantity,value,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            mid,
            bid,
            ingredient.id,
            input.kind,
            fixed(qty),
            fixed(value),
            input.note,
          ],
        );
        if (!value.eq(0))
          await post(
            tx,
            bid,
            day,
            `stock:${mid}`,
            `${input.kind === "purchase" ? "Pembelian" : input.kind === "waste" ? "Waste" : "Stok opname"} ${ingredient.name}`,
            lines,
            sid,
          );
        return { ok: true };
      },
    );
  });
  app.post("/api/expenses", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        category: text,
        description: text,
        amount: money.refine((n) => n > 0),
        account: sourceAccount,
      }),
    );
    return mutate(c, "expense.create", input, async (tx, user, _b, day) => {
      const sid =
        input.account === "cash"
          ? (await activeShift(tx, user.business_id)).id
          : null;
      await requireFunds(tx, user.business_id, input.account, input.amount);
      const eid = uid();
      await tx.query(
        "INSERT INTO expenses(id,business_id,category,description,amount,account,business_date,shift_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          eid,
          user.business_id,
          input.category,
          input.description,
          input.amount,
          input.account,
          day,
          sid,
        ],
      );
      await post(
        tx,
        user.business_id,
        day,
        `expense:${eid}`,
        `${input.category}: ${input.description}`,
        [
          { account: "expense", debit: input.amount },
          { account: input.account, credit: input.amount },
        ],
        sid,
      );
      return { id: eid };
    });
  });
  app.post("/api/settlements", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        gross: money.refine((n) => n > 0),
        fee: money,
        reference: text,
      }),
    );
    return mutate(c, "settlement.create", input, async (tx, user, _b, day) => {
      if (
        (
          await tx.query(
            "SELECT id FROM orders WHERE business_id=$1 AND channel IN ('gojek','grab','transfer') LIMIT 1",
            [user.business_id],
          )
        ).rows.length
      )
        throw new DomainError(
          "Gunakan pencairan per dokumen melalui Aplikasi Manager untuk bisnis dengan beberapa kanal.",
          422,
        );
      if (input.fee >= input.gross)
        throw new DomainError("Biaya harus lebih kecil dari nilai bruto.");
      await requireFunds(tx, user.business_id, "clearing", input.gross);
      const sid = uid();
      await tx.query(
        "INSERT INTO settlements(id,business_id,gross,fee,reference) VALUES($1,$2,$3,$4,$5)",
        [sid, user.business_id, input.gross, input.fee, input.reference],
      );
      const lines: any[] = [
        { account: "bank", debit: input.gross - input.fee },
        { account: "clearing", credit: input.gross },
      ];
      if (input.fee) lines.push({ account: "payment_fee", debit: input.fee });
      await post(
        tx,
        user.business_id,
        day,
        `settlement:${sid}`,
        `Pencairan digital: ${input.reference}`,
        lines,
      );
      return { id: sid };
    });
  });
  app.post("/api/cash", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        kind: z.enum(["capital", "transfer"]),
        amount: money.refine((n) => n > 0),
        from: sourceAccount,
        to: sourceAccount,
        note: text,
      }),
    );
    return mutate(c, "cash.movement", input, async (tx, user, _b, day) => {
      if (input.kind === "transfer" && input.from === input.to)
        throw new DomainError("Akun asal dan tujuan harus berbeda.");
      if (input.kind === "transfer")
        await requireFunds(tx, user.business_id, input.from, input.amount);
      const sid =
        input.to === "cash" ||
        (input.kind === "transfer" && input.from === "cash")
          ? (await activeShift(tx, user.business_id)).id
          : null;
      await post(
        tx,
        user.business_id,
        day,
        `cash:${uid()}`,
        input.note,
        [
          { account: input.to, debit: input.amount },
          {
            account: input.kind === "capital" ? "capital" : input.from,
            credit: input.amount,
          },
        ],
        sid,
      );
      return { ok: true };
    });
  });
  app.post("/api/users", async (c) => {
    owner(c);
    const input = await body(
      c,
      z
        .object({
          name: text,
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().max(128).default(""),
          role: z.enum(["owner", "cashier"]),
          outletIds: z.array(id).optional(),
        })
        .refine(
          (v) =>
            v.role === "owner" ||
            v.outletIds === undefined ||
            v.outletIds.length > 0,
          {
            message: "Pilih minimal satu outlet untuk kasir.",
            path: ["outletIds"],
          },
        ),
    );
    const existing = (
      await db.query("SELECT id FROM users WHERE email=$1", [input.email])
    ).rows[0];
    if (!existing && input.password.length < 12)
      throw new DomainError("Kata sandi akun baru minimal 12 karakter.", 422);
    const pw = existing ? null : await passwordHash(db, input.password);
    return mutate(
      c,
      "user.create",
      {
        name: input.name,
        email: input.email,
        role: input.role,
        outletIds: input.outletIds,
      },
      async (tx, user, business) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          business.organization_id,
        ]);
        let account = (
          await tx.query("SELECT id FROM users WHERE email=$1", [input.email])
        ).rows[0];
        if (!account) {
          if (!pw) throw new DomainError("Akun berubah. Coba ulang.", 409);
          account = { id: uid() };
          await tx.query(
            "INSERT INTO users(id,business_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,$6)",
            [
              account.id,
              user.business_id,
              input.name,
              input.email,
              pw,
              input.role,
            ],
          );
        }
        if (input.role === "owner")
          await tx.query(
            "INSERT INTO organization_owners(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [business.organization_id, account.id],
          );
        else {
          if (
            (
              await tx.query(
                "SELECT user_id FROM organization_owners WHERE organization_id=$1 AND user_id=$2",
                [business.organization_id, account.id],
              )
            ).rows.length
          )
            throw new DomainError(
              "Akun ini sudah menjadi owner usaha dan memiliki akses seluruh outlet.",
              409,
            );
          for (const outletId of input.outletIds || [user.business_id]) {
            if (
              !(
                await tx.query(
                  "SELECT id FROM businesses WHERE id=$1 AND organization_id=$2",
                  [outletId, business.organization_id],
                )
              ).rows.length
            )
              throw new DomainError(
                "Outlet penugasan tidak termasuk usaha ini.",
                403,
              );
            await tx.query(
              "INSERT INTO outlet_cashiers(outlet_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [outletId, account.id],
            );
          }
        }
        await tx.query(
          "INSERT INTO business_members(organization_id,user_id,role,all_outlets) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,active=true,all_outlets=excluded.all_outlets",
          [
            business.organization_id,
            account.id,
            input.role === "owner" ? "management" : "employee",
            input.role === "owner",
          ],
        );
        for (const outletId of input.role === "cashier"
          ? input.outletIds || [user.business_id]
          : [])
          await tx.query(
            "INSERT INTO member_outlets(organization_id,user_id,outlet_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [business.organization_id, account.id, outletId],
          );
        return { id: account.id, linked: !!existing };
      },
      true,
    );
  });
  app.post("/api/outlets", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        name: text,
        timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
        capital: money,
        copyMenu: z.boolean().default(false),
      }),
    );
    return mutate(
      c,
      "outlet.create",
      input,
      async (tx, user, business) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          business.organization_id,
        ]);
        const org = (
          await tx.query("SELECT name FROM organizations WHERE id=$1", [
            business.organization_id,
          ])
        ).rows[0];
        const outletId = await createOutlet(tx, {
          organizationId: business.organization_id,
          brand: org.name,
          name: input.name,
          timezone: input.timezone,
          demo: business.demo,
          capital: input.capital,
          copyFrom: input.copyMenu ? user.business_id : undefined,
        });
        return { id: outletId };
      },
      true,
    );
  });
  app.post("/api/organizations", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        name: text,
        outlet: text,
        timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
        capital: money,
      }),
    );
    return mutate(
      c,
      "organization.create",
      input,
      async (tx, user, business) => {
        const organizationId = uid();
        await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
          organizationId,
          input.name,
        ]);
        await tx.query(
          "INSERT INTO organization_owners(organization_id,user_id) VALUES($1,$2)",
          [organizationId, user.id],
        );
        await tx.query(
          "INSERT INTO business_members(organization_id,user_id,role,all_outlets) VALUES($1,$2,'management',true)",
          [organizationId, user.id],
        );
        const outletId = await createOutlet(tx, {
          organizationId,
          brand: input.name,
          name: input.outlet,
          timezone: input.timezone,
          demo: business.demo,
          capital: input.capital,
        });
        return { id: outletId, organizationId };
      },
      true,
    );
  });
  app.post("/api/business", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({
        name: text,
        outlet: text,
        timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
      }),
    );
    return mutate(
      c,
      "business.update",
      input,
      async (tx, user) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          user.organization_id,
        ]);
        await tx.query("UPDATE organizations SET name=$1 WHERE id=$2", [
          input.name,
          user.organization_id,
        ]);
        await tx.query(
          "UPDATE businesses SET name=$1 WHERE organization_id=$2",
          [input.name, user.organization_id],
        );
        await tx.query(
          "UPDATE businesses SET name=$1,outlet_name=$2,timezone=$3 WHERE id=$4",
          [input.name, input.outlet, input.timezone, user.business_id],
        );
        return { ok: true };
      },
      true,
    );
  });
  app.post("/api/period", async (c) => {
    owner(c);
    const input = await body(
      c,
      z.object({ date: date.nullable(), reason: text }),
    );
    return mutate(
      c,
      "period.update",
      input,
      async (tx, user, business, day) => {
        if (input.date) {
          if (input.date > day)
            throw new DomainError("Tidak bisa mengunci tanggal di masa depan.");
          if (
            business.closed_through &&
            input.date <
              (business.closed_through instanceof Date
                ? business.closed_through.toISOString()
                : String(business.closed_through)
              ).slice(0, 10)
          )
            throw new DomainError(
              "Gunakan buka kembali untuk koreksi periode.",
            );
          if (
            (
              await tx.query(
                "SELECT id FROM shifts WHERE business_id=$1 AND closed_at IS NULL",
                [user.business_id],
              )
            ).rows.length
          )
            throw new DomainError("Tutup shift sebelum mengunci periode.");
          if (
            (
              await tx.query(
                "SELECT id FROM orders WHERE business_id=$1 AND status='queued' AND business_date<=$2 LIMIT 1",
                [user.business_id, input.date],
              )
            ).rows.length
          )
            throw new DomainError("Masih ada pesanan yang belum diserahkan.");
        }
        await tx.query("UPDATE businesses SET closed_through=$1 WHERE id=$2", [
          input.date,
          user.business_id,
        ]);
        return { ok: true };
      },
      true,
    );
  });
  app.notFound((c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
  app.onError((error, c) => {
    if (error instanceof DomainError)
      return c.json({ error: error.message }, error.status as any);
    if (error instanceof z.ZodError)
      return c.json({ error: "Data tidak valid." }, 422);
    if ((error as any).code === "23505")
      return c.json(
        {
          error:
            "Referensi atau data sudah tercatat. Periksa sebelum mengulang.",
        },
        409,
      );
    console.error(
      "Omzetin request failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return c.json(
      { error: "Transaksi gagal dan dibatalkan. Silakan coba kembali." },
      500,
    );
  });
  return app;
}
