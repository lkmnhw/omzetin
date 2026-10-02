import type { Hono } from "hono";
import { z } from "zod";
import type { Queryable } from "./db";
import { D, DomainError, uid, post, requireFunds, businessDay } from "./domain";
import { passwordHash } from "./security";
import type { Environment, C, User } from "./app";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(150);
const amount = z.coerce.number().int().min(0).max(100000000000);
const date = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const proof = z.string().trim().max(1000).default("");
const percent = z.coerce
  .number()
  .min(0)
  .max(100)
  .refine((n) => D(n).decimalPlaces() <= 4);
export const channelSchema = z.enum([
  "cash",
  "gojek",
  "grab",
  "qris",
  "transfer",
]);
const operational = (u: User) => u.role === "owner" || u.role === "manager";
function manager(c: C) {
  if (!operational(c.get("user")))
    throw new DomainError("Akses manager diperlukan.", 403);
}
function management(c: C) {
  if (c.get("user").role !== "owner")
    throw new DomainError("Akses management diperlukan.", 403);
}
function reportAccess(c: C) {
  if (!["owner", "investor"].includes(c.get("user").role))
    throw new DomainError("Laporan hanya untuk management dan investor.", 403);
}
async function parse<T>(c: C, schema: z.ZodType<T>) {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw new DomainError("Format data tidak valid.", 422);
  }
  const result = schema.safeParse(data);
  if (!result.success)
    throw new DomainError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      422,
    );
  return result.data;
}
const dayText = (v: any) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
async function unlocked(tx: Queryable, bid: string, day: string) {
  const b = (
    await tx.query("SELECT closed_through FROM businesses WHERE id=$1", [bid])
  ).rows[0];
  if (b.closed_through && dayText(b.closed_through) >= day)
    throw new DomainError("Periode sudah dikunci.", 409);
}
export function ratio(value: any, revenue: any) {
  return D(revenue).gt(0)
    ? D(value).div(revenue).mul(100).toDecimalPlaces(4).toNumber()
    : null;
}
export function grossColor(v: number | null) {
  return v === null
    ? "neutral"
    : v >= 50
      ? "green"
      : v >= 40
        ? "yellow"
        : v >= 30
          ? "orange"
          : "red";
}
export function costColor(v: number | null, target: number) {
  return v === null
    ? "neutral"
    : v <= target
      ? "green"
      : v <= target * 1.1
        ? "yellow"
        : v <= target * 1.25
          ? "orange"
          : "red";
}

/** Mirrors existing cash events into approval/reporting documents, never reposts money. */
export async function syncOperationalDocuments(
  tx: Queryable,
  bid: string,
  user: User,
) {
  await tx.query(
    `INSERT INTO operational_documents(id,business_id,user_id,kind,cost_group,category,amount,description,account,business_date,shift_id,source_key,status,posted)
    SELECT e.id,e.business_id,$2,'expense','monthly',CASE WHEN lower(e.category) LIKE '%gaji%' THEN 'salary' WHEN lower(e.category) LIKE '%marketing%' THEN 'marketing' ELSE 'operational' END,e.amount,e.description,e.account,e.business_date,e.shift_id,'legacy-expense:'||e.id,'approved',true
    FROM expenses e WHERE e.business_id=$1 ON CONFLICT(business_id,source_key) DO NOTHING`,
    [bid, user.id],
  );
  await tx.query(
    `INSERT INTO operational_documents(id,business_id,user_id,kind,cost_group,category,amount,description,account,business_date,shift_id,source_key,status,posted)
    SELECT gen_random_uuid(),e.business_id,$2,'expense','daily','materials',sum(l.credit)::bigint,e.description,min(l.account),e.business_date,e.shift_id,'purchase:'||e.id,'approved',true
    FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE e.business_id=$1 AND e.source_key LIKE 'stock:%' AND l.credit>0 AND l.account IN ('cash','safe','bank') GROUP BY e.id ON CONFLICT(business_id,source_key) DO NOTHING`,
    [bid, user.id],
  );
  const closed = (
    await tx.query(
      "SELECT * FROM shifts WHERE business_id=$1 AND closed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM operational_documents d WHERE d.business_id=shifts.business_id AND d.source_key='shift:'||shifts.id||':cash')",
      [bid],
    )
  ).rows;
  for (const shift of closed) {
    const income = (
      await tx.query(
        `SELECT channel,COALESCE(sum(total),0)::text gross FROM orders WHERE business_id=$1 AND shift_id=$2 AND (status='fulfilled' OR (status='refunded' AND EXISTS(SELECT 1 FROM journal_entries j WHERE j.order_id=orders.id AND j.source_key LIKE 'refund:%' AND j.created_at>$3))) GROUP BY channel`,
        [bid, shift.id, shift.closed_at],
      )
    ).rows;
    if (!income.some((i) => i.channel === "cash"))
      income.push({ channel: "cash", gross: "0" });
    for (const i of income) {
      const key = `shift:${shift.id}:${i.channel}`;
      const exists = (
        await tx.query(
          "SELECT id FROM operational_documents WHERE business_id=$1 AND source_key=$2",
          [bid, key],
        )
      ).rows[0];
      if (exists) continue;
      const doc = uid();
      await tx.query(
        `INSERT INTO operational_documents(id,business_id,user_id,kind,channel,amount,description,business_date,shift_id,source_key,status,posted) VALUES($1,$2,$3,'income',$4,$5,$6,$7,$8,$9,'submitted',true)`,
        [
          doc,
          bid,
          shift.user_id,
          i.channel,
          i.gross,
          `${shift.label} · ${i.channel}`,
          shift.business_date,
          shift.id,
          key,
        ],
      );
      if (D(i.gross).gt(0) && ["cash", "transfer"].includes(i.channel))
        await tx.query(
          "INSERT INTO income_receipts(id,business_id,document_id,gross,net,received_date,reference,user_id) VALUES($1,$2,$3,$4,$4,$5,$6,$7)",
          [
            uid(),
            bid,
            doc,
            i.gross,
            shift.business_date,
            `auto:${doc}`,
            shift.user_id,
          ],
        );
    }
  }
  // Older QRIS settlements were booked to bank already; allocate without posting money twice.
  const oldSettlements = (
    await tx.query(
      "SELECT s.*, (s.created_at AT TIME ZONE b.timezone)::date received_day FROM settlements s JOIN businesses b ON b.id=s.business_id WHERE s.business_id=$1 AND NOT s.core_mirrored ORDER BY s.created_at,s.id",
      [bid],
    )
  ).rows;
  for (const settlement of oldSettlements) {
    const prefix = `legacy-settlement:${settlement.id}:`;
    const allocated = (
      await tx.query(
        "SELECT COALESCE(sum(gross),0)::text gross,COALESCE(sum(net),0)::text net FROM income_receipts WHERE business_id=$1 AND reference LIKE $2",
        [bid, prefix + "%"],
      )
    ).rows[0];
    let remaining = D(settlement.gross).minus(allocated.gross),
      net = D(settlement.gross).minus(settlement.fee).minus(allocated.net);
    if (remaining.lte(0)) {
      await tx.query("UPDATE settlements SET core_mirrored=true WHERE id=$1", [
        settlement.id,
      ]);
      continue;
    }
    const docs = (
      await tx.query(
        "SELECT d.*,d.amount-COALESCE((SELECT sum(gross) FROM income_receipts WHERE document_id=d.id),0) outstanding FROM operational_documents d WHERE d.business_id=$1 AND d.channel='qris' AND d.source_key LIKE 'shift:%' ORDER BY d.business_date,d.created_at,d.id",
        [bid],
      )
    ).rows;
    for (const d of docs) {
      if (remaining.lte(0)) break;
      const gross = D(d.outstanding).lt(remaining)
        ? D(d.outstanding)
        : remaining;
      if (gross.lte(0)) continue;
      const part = gross.eq(remaining)
        ? net
        : net.mul(gross).div(remaining).floor();
      await tx.query(
        "INSERT INTO income_receipts(id,business_id,document_id,gross,net,received_date,reference,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          uid(),
          bid,
          d.id,
          gross.toFixed(0),
          part.toFixed(0),
          settlement.received_day,
          prefix + d.id,
          user.id,
        ],
      );
      remaining = remaining.minus(gross);
      net = net.minus(part);
    }
    if (remaining.lte(0))
      await tx.query("UPDATE settlements SET core_mirrored=true WHERE id=$1", [
        settlement.id,
      ]);
  }
  // Preserve a submitted correction when cash is refunded after its shift was closed.
  const refunds = (
    await tx.query(
      `SELECT o.*,e.business_date refund_day,(SELECT COALESCE(sum(l.credit),0) FROM journal_lines l WHERE l.entry_id=e.id AND l.account IN ('cash','bank'))::text refunded_final FROM orders o JOIN shifts s ON s.id=o.shift_id JOIN journal_entries e ON e.order_id=o.id AND e.source_key LIKE 'refund:%' WHERE o.business_id=$1 AND s.closed_at IS NOT NULL AND e.created_at>s.closed_at AND NOT EXISTS(SELECT 1 FROM operational_documents d WHERE d.business_id=o.business_id AND d.source_key='refund:'||o.id)`,
      [bid],
    )
  ).rows;
  for (const o of refunds) {
    if (!D(o.refunded_final).gt(0)) continue;
    await tx.query(
      `INSERT INTO operational_documents(id,business_id,user_id,kind,channel,amount,description,business_date,source_key,status,posted) VALUES($1,$2,$3,'refund',$4,$5,$6,$7,$8,'submitted',true) ON CONFLICT(business_id,source_key) DO NOTHING`,
      [
        uid(),
        bid,
        user.id,
        o.channel,
        o.refunded_final,
        `Refund pesanan #${o.number}`,
        o.refund_day,
        `refund:${o.id}`,
      ],
    );
  }
}

const documentSchema = z.object({
  id: id.optional(),
  version: z.coerce.number().int().positive().optional(),
  kind: z.enum(["income", "expense"]),
  channel: channelSchema.default("cash"),
  costGroup: z.enum(["daily", "monthly", "irregular"]).default("daily"),
  category: z
    .enum([
      "materials",
      "packaging",
      "salary",
      "operational",
      "marketing",
      "equipment",
      "logistics",
      "other",
    ])
    .default("other"),
  amount: amount.refine((n) => n > 0),
  net: amount.optional(),
  receivedDate: date.optional(),
  description: text,
  reference: z.string().trim().max(150).default(""),
  proof,
  account: z.enum(["cash", "safe", "bank"]).default("safe"),
  businessDate: date,
  submit: z.boolean().default(true),
});

async function monthly(
  tx: Queryable,
  org: string,
  outlet: string | null,
  period: string,
) {
  const from = period + "-01",
    to = new Date(
      Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
  const outlets = (
    await tx.query(
      "SELECT id,outlet_name,timezone FROM businesses WHERE organization_id=$1 AND ($2::uuid IS NULL OR id=$2)",
      [org, outlet],
    )
  ).rows;
  if (!outlets.length) throw new DomainError("Outlet tidak ditemukan.", 404);
  const ids = outlets.map((o) => o.id);
  const orgData = (
    await tx.query("SELECT name,cost_targets FROM organizations WHERE id=$1", [
      org,
    ])
  ).rows[0];
  const incomes = (
    await tx.query(
      `SELECT d.channel,COALESCE(sum(r.gross),0)::text gross,COALESCE(sum(r.net),0)::text net FROM income_receipts r JOIN operational_documents d ON d.id=r.document_id WHERE d.business_id=ANY($1::uuid[]) AND d.status='approved' AND r.received_date BETWEEN $2::date AND $3::date GROUP BY d.channel`,
      [ids, from, to],
    )
  ).rows;
  const cashShifts = (
    await tx.query(
      `SELECT s.label,COALESCE(sum(r.net),0)::text final FROM operational_documents d JOIN shifts s ON s.id=d.shift_id JOIN income_receipts r ON r.document_id=d.id WHERE d.business_id=ANY($1::uuid[]) AND d.kind='income' AND d.channel='cash' AND d.status='approved' AND r.received_date BETWEEN $2::date AND $3::date GROUP BY s.label ORDER BY s.label`,
      [ids, from, to],
    )
  ).rows;
  const grossSales = (
    await tx.query(
      `SELECT channel,sum(amount)::text gross FROM operational_documents WHERE business_id=ANY($1::uuid[]) AND kind='income' AND status='approved' AND business_date BETWEEN $2::date AND $3::date GROUP BY channel`,
      [ids, from, to],
    )
  ).rows;
  const refunds = (
    await tx.query(
      `SELECT channel,sum(amount)::text amount FROM operational_documents WHERE business_id=ANY($1::uuid[]) AND kind='refund' AND status='approved' AND business_date BETWEEN $2::date AND $3::date GROUP BY channel`,
      [ids, from, to],
    )
  ).rows;
  const expenses = (
    await tx.query(
      `SELECT cost_group,category,sum(amount)::text amount FROM operational_documents WHERE business_id=ANY($1::uuid[]) AND kind='expense' AND status='approved' AND business_date BETWEEN $2::date AND $3::date GROUP BY cost_group,category`,
      [ids, from, to],
    )
  ).rows;
  const pending = (
    await tx.query(
      `SELECT count(*)::int n FROM operational_documents WHERE business_id=ANY($1::uuid[]) AND status IN ('submitted','returned','rejected') AND business_date BETWEEN $2::date AND $3::date`,
      [ids, from, to],
    )
  ).rows[0].n;
  const outstanding = (
    await tx.query(
      `SELECT COALESCE(sum(d.amount-COALESCE(r.gross,0)),0)::text amount FROM operational_documents d LEFT JOIN (SELECT document_id,sum(gross) gross FROM income_receipts WHERE received_date<=$2::date GROUP BY document_id) r ON r.document_id=d.id WHERE d.business_id=ANY($1::uuid[]) AND d.kind='income' AND d.status='approved' AND d.business_date<=$2::date`,
      [ids, to],
    )
  ).rows[0].amount;
  const variance = (
    await tx.query(
      "SELECT COALESCE(sum(difference),0)::text amount FROM shifts WHERE business_id=ANY($1::uuid[]) AND business_date BETWEEN $2::date AND $3::date AND closed_at IS NOT NULL",
      [ids, from, to],
    )
  ).rows[0].amount;
  const channels = ["cash", "gojek", "grab", "qris", "transfer"].map(
    (channel) => {
      const cash = incomes.find((r) => r.channel === channel),
        reversal = refunds.find((r) => r.channel === channel)?.amount || 0;
      return {
        channel,
        grossSales: grossSales.find((r) => r.channel === channel)?.gross || "0",
        settledGross: cash?.gross || "0",
        final: D(cash?.net || 0)
          .minus(reversal)
          .toFixed(0),
        refund: D(reversal).toFixed(0),
        fee: D(cash?.gross || 0)
          .minus(cash?.net || 0)
          .toFixed(0),
        finalPercent: ratio(cash?.net || 0, cash?.gross || 0),
      };
    },
  );
  const revenue = channels.reduce((s, r) => s.plus(r.final), D(0));
  const group = (g: string) =>
    expenses
      .filter((e) => e.cost_group === g)
      .reduce<ReturnType<typeof D>>((s, e) => s.plus(e.amount), D(0));
  const cat = (g: string) =>
    expenses
      .filter((e) => e.category === g)
      .reduce<ReturnType<typeof D>>((s, e) => s.plus(e.amount), D(0));
  const daily = group("daily"),
    monthlyExpense = group("monthly"),
    irregular = group("irregular"),
    total = daily.plus(monthlyExpense).plus(irregular);
  const gross = revenue.minus(daily),
    net = revenue.minus(total);
  const targets = orgData.cost_targets;
  const metrics = [
    {
      key: "gross",
      label: "Gross profit",
      amount: gross.toFixed(0),
      percent: ratio(gross, revenue),
      target: 50,
      color: grossColor(ratio(gross, revenue)),
    },
    ...["salary", "operational", "irregular", "marketing"].map((key) => {
      const a = key === "irregular" ? irregular : cat(key);
      const value = ratio(a, revenue);
      return {
        key,
        label: (
          {
            salary: "Gaji karyawan",
            operational: "Operasional",
            irregular: "Biaya tidak tetap",
            marketing: "Marketing",
          } as any
        )[key],
        amount: a.toFixed(0),
        percent: value,
        target: targets[key],
        color: costColor(value, targets[key]),
      };
    }),
  ];
  return {
    month: period,
    from,
    to,
    organizationName: orgData.name,
    outletId: outlet,
    outlets,
    channels,
    cashShifts,
    expenses,
    totals: {
      revenue: revenue.toFixed(0),
      daily: daily.toFixed(0),
      monthly: monthlyExpense.toFixed(0),
      irregular: irregular.toFixed(0),
      expense: total.toFixed(0),
      gross: gross.toFixed(0),
      net: net.toFixed(0),
      outstanding,
      variance,
    },
    metrics,
    targets,
    pending,
  };
}

/** Allocates whole rupiah with largest remainder, deterministic across retries. */
export function allocateDividends(
  total: number,
  managementPercent: number,
  members: { userId: string; name: string; role: string; percent: number }[],
) {
  const groups = ["management", "investor"];
  const managementPool = D(total).mul(managementPercent).div(100).floor();
  const pools = [managementPool, D(total).minus(managementPool)];
  const result: any[] = [];
  for (let g = 0; g < 2; g++) {
    const people = members.filter((m) => m.role === groups[g]);
    if (pools[g].gt(0) && !people.length)
      throw new DomainError("Kelompok penerima belum lengkap.", 422);
    if (
      people.length &&
      !people.reduce((s, m) => s.plus(m.percent), D(0)).eq(100)
    )
      throw new DomainError("Bagian individu setiap kelompok harus 100%.", 422);
    const values = people
      .map((m) => {
        const exact = pools[g].mul(m.percent).div(100);
        return {
          ...m,
          amount: exact.floor().toNumber(),
          remainder: exact.minus(exact.floor()).toNumber(),
        };
      })
      .sort(
        (a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId),
      );
    let remaining = pools[g]
      .minus(values.reduce((s, m) => s.plus(m.amount), D(0)))
      .toNumber();
    for (const v of values) {
      if (remaining > 0) {
        v.amount++;
        remaining--;
      }
      const { remainder, ...safe } = v;
      result.push(safe);
    }
  }
  return result;
}

export function registerCore(app: Hono<Environment>, mutate: any) {
  const change = (c: C, action: string, input: any, fn: any) =>
    mutate(c, "core." + action, input, fn, true);
  app.get("/api/core/state", async (c) => {
    const u = c.get("user");
    const business = (
      await c
        .get("db")
        .query(
          "SELECT id,outlet_name,timezone,operating_schedule FROM businesses WHERE id=$1",
          [u.business_id],
        )
    ).rows[0];
    if (u.role === "investor") return c.json({ business, user: u });
    const db = c.get("db");
    const documents = (
      await db.query(
        `SELECT d.*,u.name creator,rv.name reviewer,COALESCE((SELECT sum(gross) FROM income_receipts r WHERE r.document_id=d.id),0)::text settled_gross,COALESCE((SELECT sum(net) FROM income_receipts r WHERE r.document_id=d.id),0)::text final FROM operational_documents d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN users rv ON rv.id=d.reviewed_by WHERE d.business_id=$1 AND ($2::boolean OR d.user_id=$3) ORDER BY d.business_date DESC,d.created_at DESC LIMIT 300`,
        [u.business_id, operational(u), u.id],
      )
    ).rows;
    const attendance = (
      await db.query(
        `SELECT a.*,u.name,CASE WHEN a.expected_start IS NULL THEN 0 ELSE GREATEST(0,floor(extract(epoch from (a.clock_in-a.expected_start))/60)) END::int late_minutes FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.business_id=$1 AND ($2::boolean OR a.user_id=$3) ORDER BY a.clock_in DESC LIMIT 100`,
        [u.business_id, operational(u), u.id],
      )
    ).rows;
    const shifts = (
      await db.query(
        "SELECT id,label,business_date,opened_at,closed_at,expected,counted,difference,note FROM shifts WHERE business_id=$1 AND ($2::boolean OR user_id=$3) ORDER BY opened_at DESC LIMIT 100",
        [u.business_id, operational(u), u.id],
      )
    ).rows;
    return c.json({ business, documents, attendance, shifts, user: u });
  });

  app.post("/api/core/documents", async (c) => {
    const input = await parse(c, documentSchema);
    return change(c, "document.save", input, async (tx: Queryable, u: User) => {
      if (u.role === "investor") throw new DomainError("Akses ditolak.", 403);
      await unlocked(tx, u.business_id, input.businessDate);
      if (
        input.businessDate >
        businessDay(
          (
            await tx.query("SELECT timezone FROM businesses WHERE id=$1", [
              u.business_id,
            ])
          ).rows[0].timezone,
        )
      )
        throw new DomainError(
          "Tanggal pencatatan tidak boleh di masa depan.",
          422,
        );
      if (input.net !== undefined)
        throw new DomainError(
          "Catat final melalui pencairan setelah pendapatan disetujui.",
          422,
        );
      if (input.kind === "income" && !input.reference)
        throw new DomainError(
          "Referensi pendapatan eksternal wajib diisi.",
          422,
        );
      if (input.kind === "income" && input.channel === "cash")
        throw new DomainError(
          "Pendapatan cash otomatis dari tutup shift; tidak perlu input ulang.",
          422,
        );
      const old = input.id
        ? (
            await tx.query(
              "SELECT * FROM operational_documents WHERE id=$1 AND business_id=$2 FOR UPDATE",
              [input.id, u.business_id],
            )
          ).rows[0]
        : null;
      if (input.id && !old)
        throw new DomainError("Dokumen tidak ditemukan.", 404);
      if (old && old.user_id !== u.id && !operational(u))
        throw new DomainError("Akses ditolak.", 403);
      if (
        old &&
        (old.source_key.indexOf("manual:") !== 0 ||
          !["draft", "returned", "rejected"].includes(old.status))
      )
        throw new DomainError(
          "Dokumen ini tidak dapat diedit. Kembalikan untuk koreksi terlebih dahulu.",
          409,
        );
      if (old && old.version !== input.version)
        throw new DomainError(
          "Dokumen berubah. Muat ulang sebelum menyimpan.",
          409,
        );
      if (old) {
        await unlocked(tx, u.business_id, dayText(old.business_date));
        if (
          old.kind !== input.kind ||
          old.account !== input.account ||
          dayText(old.business_date) !== input.businessDate
        )
          throw new DomainError(
            "Jenis, akun, dan tanggal tidak boleh diubah pada koreksi.",
            422,
          );
      }
      const doc = old?.id || uid(),
        status = input.submit
          ? operational(u)
            ? "approved"
            : "submitted"
          : "draft";
      const shouldPost = input.submit && input.kind === "expense";
      let shift = old?.shift_id || null;
      if (input.account === "cash" && shouldPost) {
        const s = (
          await tx.query(
            "SELECT id,user_id FROM shifts WHERE business_id=$1 AND closed_at IS NULL",
            [u.business_id],
          )
        ).rows[0];
        if (!s || (!operational(u) && s.user_id !== u.id))
          throw new DomainError(
            "Buka shift milikmu untuk pengeluaran dari kas laci.",
            409,
          );
        shift = s.id;
      }
      const delta = D(shouldPost ? input.amount : 0).minus(
        old?.posted ? old.amount : 0,
      );
      if (delta.gt(0))
        await requireFunds(tx, u.business_id, input.account, delta);
      if (delta.abs().gt(0))
        await post(
          tx,
          u.business_id,
          input.businessDate,
          `core-expense:${doc}:${(old?.version || 0) + 1}`,
          input.description,
          delta.gt(0)
            ? [
                { account: "expense", debit: delta },
                { account: input.account, credit: delta },
              ]
            : [
                { account: input.account, debit: delta.abs() },
                { account: "expense", credit: delta.abs() },
              ],
          shift,
        );
      if (old && old.posted && !input.submit)
        throw new DomainError(
          "Pengeluaran yang sudah terjadi harus diajukan kembali.",
          422,
        );
      if (old)
        await tx.query(
          `UPDATE operational_documents SET channel=$1,cost_group=$2,category=$3,amount=$4,description=$5,reference=$6,proof=$7,status=$8,version=version+1,updated_at=now(),reviewed_by=$9,reviewed_at=CASE WHEN $9::uuid IS NULL THEN NULL ELSE now() END,review_note='',posted=$10 WHERE id=$11`,
          [
            input.channel,
            input.costGroup,
            input.category,
            input.amount,
            input.description,
            input.reference,
            input.proof,
            status,
            status === "approved" ? u.id : null,
            shouldPost,
            doc,
          ],
        );
      else
        await tx.query(
          `INSERT INTO operational_documents(id,business_id,user_id,kind,channel,cost_group,category,amount,description,reference,proof,account,business_date,shift_id,source_key,status,reviewed_by,reviewed_at,posted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CASE WHEN $17::uuid IS NULL THEN NULL ELSE now() END,$18)`,
          [
            doc,
            u.business_id,
            u.id,
            input.kind,
            input.channel,
            input.costGroup,
            input.category,
            input.amount,
            input.description,
            input.reference,
            input.proof,
            input.account,
            input.businessDate,
            shift,
            `manual:${doc}`,
            status,
            status === "approved" ? u.id : null,
            shouldPost,
          ],
        );
      if (
        old &&
        input.kind === "income" &&
        (
          await tx.query(
            "SELECT id FROM income_receipts WHERE document_id=$1",
            [doc],
          )
        ).rows.length
      )
        throw new DomainError(
          "Pendapatan sudah dicairkan; gunakan dokumen koreksi.",
          409,
        );
      return { id: doc, status };
    });
  });
  app.post("/api/core/review", async (c) => {
    manager(c);
    const input = await parse(
      c,
      z.object({
        id,
        version: z.number().int(),
        decision: z.enum(["approved", "returned", "rejected", "voided"]),
        note: z.string().trim().max(1000).default(""),
      }),
    );
    return change(
      c,
      "document.review",
      input,
      async (tx: Queryable, u: User) => {
        const d = (
          await tx.query(
            "SELECT * FROM operational_documents WHERE id=$1 AND business_id=$2 FOR UPDATE",
            [input.id, u.business_id],
          )
        ).rows[0];
        if (!d) throw new DomainError("Dokumen tidak ditemukan.", 404);
        await unlocked(tx, u.business_id, dayText(d.business_date));
        if (
          d.version !== input.version ||
          !["submitted", "approved", "returned", "rejected"].includes(d.status)
        )
          throw new DomainError("Status dokumen berubah. Muat ulang.", 409);
        if (input.decision !== "approved" && !input.note)
          throw new DomainError("Alasan wajib diisi.", 422);
        if (input.decision === "voided") {
          if (!d.source_key.startsWith("manual:"))
            throw new DomainError(
              "Koreksi dokumen otomatis dilakukan melalui transaksi asal.",
              422,
            );
          if (
            (
              await tx.query(
                "SELECT id FROM income_receipts WHERE document_id=$1",
                [d.id],
              )
            ).rows.length
          )
            throw new DomainError(
              "Pendapatan yang sudah cair memerlukan rekonsiliasi refund.",
              409,
            );
          if (d.kind === "expense" && d.posted) {
            const b = (
                await tx.query("SELECT timezone FROM businesses WHERE id=$1", [
                  u.business_id,
                ])
              ).rows[0],
              today = businessDay(b.timezone);
            await unlocked(tx, u.business_id, today);
            const shift = d.shift_id
              ? (
                  await tx.query("SELECT closed_at FROM shifts WHERE id=$1", [
                    d.shift_id,
                  ])
                ).rows[0]
              : null;
            const account =
              d.account === "cash" && shift?.closed_at ? "safe" : d.account;
            await post(
              tx,
              u.business_id,
              today,
              `void-expense:${d.id}`,
              `Pembatalan ${d.description}: ${input.note}`,
              [
                { account, debit: d.amount },
                { account: "expense", credit: d.amount },
              ],
              account === "cash" ? d.shift_id : null,
            );
          }
          await tx.query(
            "UPDATE operational_documents SET posted=false WHERE id=$1",
            [d.id],
          );
        }
        await tx.query(
          "UPDATE operational_documents SET status=$1,reviewed_by=$2,reviewed_at=now(),review_note=$3,version=version+1,updated_at=now() WHERE id=$4",
          [input.decision, u.id, input.note, d.id],
        );
        return { id: d.id, status: input.decision };
      },
    );
  });
  app.post("/api/core/receipts", async (c) => {
    manager(c);
    const input = await parse(
      c,
      z.object({
        documentId: id,
        gross: amount.refine((n) => n > 0),
        net: amount,
        receivedDate: date,
        reference: text,
      }),
    );
    return change(
      c,
      "income.receive",
      input,
      async (tx: Queryable, u: User) => {
        await unlocked(tx, u.business_id, input.receivedDate);
        const d = (
          await tx.query(
            "SELECT * FROM operational_documents WHERE id=$1 AND business_id=$2 AND kind='income' FOR UPDATE",
            [input.documentId, u.business_id],
          )
        ).rows[0];
        if (!d || d.status !== "approved")
          throw new DomainError(
            "Setujui pendapatan sebelum mencatat pencairan.",
            409,
          );
        if (
          ["cash", "transfer"].includes(d.channel) &&
          d.source_key.startsWith("shift:")
        )
          throw new DomainError(
            "Penerimaan ini sudah otomatis dari shift.",
            409,
          );
        const sum = (
          await tx.query(
            "SELECT COALESCE(sum(gross),0)::text amount FROM income_receipts WHERE document_id=$1",
            [d.id],
          )
        ).rows[0].amount;
        if (D(sum).plus(input.gross).gt(d.amount) || input.net > input.gross)
          throw new DomainError(
            "Pencairan melebihi kotor yang belum dicairkan.",
            422,
          );
        if (
          input.receivedDate >
          businessDay(
            (
              await tx.query("SELECT timezone FROM businesses WHERE id=$1", [
                u.business_id,
              ])
            ).rows[0].timezone,
          )
        )
          throw new DomainError(
            "Tanggal pencairan tidak boleh di masa depan.",
            422,
          );
        if (input.receivedDate < dayText(d.business_date))
          throw new DomainError(
            "Tanggal diterima tidak boleh sebelum transaksi.",
            422,
          );
        const receipt = uid();
        await tx.query(
          "INSERT INTO income_receipts(id,business_id,document_id,gross,net,received_date,reference,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            receipt,
            u.business_id,
            d.id,
            input.gross,
            input.net,
            input.receivedDate,
            input.reference,
            u.id,
          ],
        );
        // External income is booked here. POS income was booked at checkout into clearing.
        const lines: any[] =
          input.net > 0 ? [{ account: "bank", debit: input.net }] : [];
        if (d.source_key.startsWith("shift:")) {
          await requireFunds(tx, u.business_id, "clearing", input.gross);
          lines.push({ account: "clearing", credit: input.gross });
        } else lines.push({ account: "sales", credit: input.gross });
        if (input.gross - input.net > 0)
          lines.push({
            account: "payment_fee",
            debit: input.gross - input.net,
          });
        await post(
          tx,
          u.business_id,
          input.receivedDate,
          `core-receipt:${receipt}`,
          `Penerimaan ${d.channel}: ${input.reference}`,
          lines,
        );
        return { id: receipt };
      },
    );
  });

  app.post("/api/core/refunds", async (c) => {
    manager(c);
    const input = await parse(
      c,
      z.object({
        documentId: id,
        amount: amount.refine((n) => n > 0),
        businessDate: date,
        reference: text,
        reason: text,
        proof,
      }),
    );
    return change(c, "income.refund", input, async (tx: Queryable, u: User) => {
      await unlocked(tx, u.business_id, input.businessDate);
      const b = (
        await tx.query("SELECT timezone FROM businesses WHERE id=$1", [
          u.business_id,
        ])
      ).rows[0];
      if (input.businessDate > businessDay(b.timezone))
        throw new DomainError("Tanggal refund tidak boleh di masa depan.", 422);
      const d = (
        await tx.query(
          "SELECT * FROM operational_documents WHERE id=$1 AND business_id=$2 AND kind='income' AND status='approved' FOR UPDATE",
          [input.documentId, u.business_id],
        )
      ).rows[0];
      if (!d || !d.source_key.startsWith("manual:"))
        throw new DomainError(
          "Refund pendapatan POS dilakukan melalui pesanan asal.",
          422,
        );
      const received = (
        await tx.query(
          "SELECT COALESCE(sum(gross),0)::text amount FROM income_receipts WHERE document_id=$1 AND received_date<=$2::date",
          [d.id, input.businessDate],
        )
      ).rows[0].amount;
      const refunded = (
        await tx.query(
          "SELECT COALESCE(sum(amount),0)::text amount FROM operational_documents WHERE related_document=$1 AND kind='refund'",
          [d.id],
        )
      ).rows[0].amount;
      if (D(refunded).plus(input.amount).gt(received))
        throw new DomainError(
          "Refund melebihi pendapatan yang telah dicairkan.",
          422,
        );
      await requireFunds(tx, u.business_id, "bank", input.amount);
      const n = uid();
      await tx.query(
        "INSERT INTO operational_documents(id,business_id,user_id,kind,channel,amount,description,reference,proof,account,business_date,source_key,status,posted,reviewed_by,reviewed_at,related_document) VALUES($1,$2,$3,'refund',$4,$5,$6,$7,$8,'bank',$9,$10,'approved',true,$3,now(),$11)",
        [
          n,
          u.business_id,
          u.id,
          d.channel,
          input.amount,
          input.reason,
          input.reference,
          input.proof,
          input.businessDate,
          "manual-refund:" + n,
          d.id,
        ],
      );
      await post(
        tx,
        u.business_id,
        input.businessDate,
        "manual-refund:" + n,
        input.reason,
        [
          { account: "returns", debit: input.amount },
          { account: "bank", credit: input.amount },
        ],
      );
      return { id: n };
    });
  });
  app.post("/api/core/schedule", async (c) => {
    manager(c);
    const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const input = await parse(
      c,
      z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        open: clock,
        close: clock,
        shifts: z
          .array(z.object({ name: text, start: clock, end: clock }))
          .min(1)
          .max(12),
      }),
    );
    return change(c, "schedule.save", input, async (tx: Queryable, u: User) => {
      if (
        new Set(input.days).size !== input.days.length ||
        new Set(input.shifts.map((s) => s.name)).size !== input.shifts.length
      )
        throw new DomainError("Hari dan nama shift tidak boleh berulang.", 422);
      if (input.open === input.close)
        throw new DomainError("Jam buka dan tutup harus berbeda.", 422);
      const minutes = (t: string) =>
          Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
        start = minutes(input.open),
        duration = (minutes(input.close) - start + 1440) % 1440;
      const windows = input.shifts.map((s) => {
        const a = (minutes(s.start) - start + 1440) % 1440,
          d = (minutes(s.end) - minutes(s.start) + 1440) % 1440;
        return { a, b: a + d };
      });
      if (
        windows.some((w) => w.b > duration) ||
        windows.some((w, i) =>
          windows.some((v, j) => i !== j && w.a < v.b && v.a < w.b),
        )
      )
        throw new DomainError(
          "Shift harus berada dalam jam buka dan tidak saling tumpang tindih.",
          422,
        );
      if (input.shifts.some((s) => s.start === s.end))
        throw new DomainError("Jam awal dan akhir shift harus berbeda.", 422);
      await tx.query(
        "UPDATE businesses SET operating_schedule=$1 WHERE id=$2",
        [JSON.stringify(input), u.business_id],
      );
      return { ok: true };
    });
  });
  app.post("/api/core/attendance", async (c) => {
    const input = await parse(
      c,
      z.object({
        action: z.enum(["in", "out"]),
        shiftLabel: text,
        note: z.string().trim().max(500).default(""),
      }),
    );
    return change(
      c,
      "attendance." + input.action,
      input,
      async (tx: Queryable, u: User) => {
        if (u.role === "investor") throw new DomainError("Akses ditolak.", 403);
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        const current = (
          await tx.query(
            "SELECT * FROM attendance WHERE user_id=$1 AND clock_out IS NULL FOR UPDATE",
            [u.id],
          )
        ).rows[0];
        if (input.action === "out") {
          if (!current || current.business_id !== u.business_id)
            throw new DomainError(
              "Tidak ada absensi aktif di outlet ini.",
              409,
            );
          await tx.query(
            "UPDATE attendance SET clock_out=now(),note=$1 WHERE id=$2",
            [input.note, current.id],
          );
          return { id: current.id };
        }
        if (current)
          throw new DomainError("Absensi sebelumnya belum dipulangkan.", 409);
        const b = (
          await tx.query(
            "SELECT operating_schedule,timezone FROM businesses WHERE id=$1",
            [u.business_id],
          )
        ).rows[0];
        const s = b.operating_schedule.shifts.find(
          (s: any) => s.name === input.shiftLabel,
        );
        if (!s) throw new DomainError("Pilih shift yang tersedia.", 422);
        const now = new Date(),
          local = new Intl.DateTimeFormat("en-GB", {
            timeZone: b.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(now);
        let day = businessDay(b.timezone, now);
        if (s.end < s.start && local < s.end)
          day = new Date(Date.parse(day + "T00:00:00Z") - 86400000)
            .toISOString()
            .slice(0, 10);
        const n = uid();
        await tx.query(
          "INSERT INTO attendance(id,business_id,user_id,business_date,shift_label,expected_start,note) VALUES($1,$2,$3,$4,$5,($6::timestamp AT TIME ZONE $7),$8)",
          [
            n,
            u.business_id,
            u.id,
            day,
            s.name,
            day + " " + s.start,
            b.timezone,
            input.note,
          ],
        );
        return { id: n };
      },
    );
  });
  app.post("/api/core/attendance/correct", async (c) => {
    manager(c);
    const input = await parse(
      c,
      z.object({
        id,
        clockIn: z.iso.datetime({ offset: true }),
        clockOut: z.iso.datetime({ offset: true }).nullable(),
        note: text,
      }),
    );
    return change(
      c,
      "attendance.correct",
      input,
      async (tx: Queryable, u: User) => {
        if (
          input.clockOut &&
          Date.parse(input.clockOut) < Date.parse(input.clockIn)
        )
          throw new DomainError("Jam pulang harus setelah masuk.", 422);
        const a = (
          await tx.query(
            "SELECT * FROM attendance WHERE id=$1 AND business_id=$2 FOR UPDATE",
            [input.id, u.business_id],
          )
        ).rows[0];
        if (!a) throw new DomainError("Absensi tidak ditemukan.", 404);
        await tx.query(
          "UPDATE attendance SET clock_in=$1,clock_out=$2,note=$3,updated_by=$4 WHERE id=$5",
          [input.clockIn, input.clockOut, input.note, u.id, a.id],
        );
        return {
          id: a.id,
          before: { clockIn: a.clock_in, clockOut: a.clock_out },
        };
      },
    );
  });

  app.get("/api/core/members", async (c) => {
    management(c);
    const u = c.get("user");
    const members = (
      await c
        .get("db")
        .query(
          `SELECT m.*,u.name,u.email,COALESCE((SELECT json_agg(outlet_id) FROM member_outlets a WHERE a.organization_id=m.organization_id AND a.user_id=m.user_id),'[]') outlet_ids FROM business_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name`,
          [u.organization_id],
        )
    ).rows;
    return c.json({ members });
  });
  app.post("/api/core/members", async (c) => {
    management(c);
    const input = await parse(
      c,
      z.object({
        name: text,
        email: z.email().transform((s) => s.toLowerCase()),
        password: z.string().max(128).default(""),
        role: z.enum(["management", "manager", "employee", "investor"]),
        outletIds: z.array(id).default([]),
        active: z.boolean().default(true),
      }),
    );
    const db = c.get("db");
    const existing = (
      await db.query("SELECT id FROM users WHERE email=$1", [input.email])
    ).rows[0];
    if (!existing && input.password.length < 12)
      throw new DomainError("Password akun baru minimal 12 karakter.", 422);
    const pw = existing ? null : await passwordHash(db, input.password);
    const { password, ...safeInput } = input;
    return change(
      c,
      "member.save",
      safeInput,
      async (tx: Queryable, u: User) => {
        const previous = (
          await tx.query(
            "SELECT m.* FROM business_members m JOIN users a ON a.id=m.user_id WHERE m.organization_id=$1 AND a.email=$2",
            [u.organization_id, input.email],
          )
        ).rows[0];
        if (
          previous?.role === "management" &&
          previous.active &&
          (!input.active || input.role !== "management")
        ) {
          const count = (
            await tx.query(
              "SELECT count(*)::int n FROM business_members WHERE organization_id=$1 AND role='management' AND active",
              [u.organization_id],
            )
          ).rows[0].n;
          if (count <= 1)
            throw new DomainError(
              "Management terakhir tidak boleh dinonaktifkan.",
              409,
            );
        }
        for (const outlet of input.outletIds)
          if (
            !(
              await tx.query(
                "SELECT id FROM businesses WHERE id=$1 AND organization_id=$2",
                [outlet, u.organization_id],
              )
            ).rows.length
          )
            throw new DomainError("Outlet di luar bisnis ini.", 403);
        if (
          ["manager", "employee"].includes(input.role) &&
          !input.outletIds.length
        )
          throw new DomainError("Pilih minimal satu outlet.", 422);
        let person = (
          await tx.query("SELECT id FROM users WHERE email=$1", [input.email])
        ).rows[0];
        if (!person) {
          if (!pw) throw new DomainError("Akun berubah. Ulangi.", 409);
          person = { id: uid() };
          await tx.query(
            "INSERT INTO users(id,business_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'cashier')",
            [person.id, u.business_id, input.name, input.email, pw],
          );
        }
        await tx.query(
          `INSERT INTO business_members(organization_id,user_id,role,active,all_outlets) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,active=excluded.active,all_outlets=excluded.all_outlets`,
          [
            u.organization_id,
            person.id,
            input.role,
            input.active,
            ["management", "investor"].includes(input.role),
          ],
        );
        await tx.query(
          "DELETE FROM member_outlets WHERE organization_id=$1 AND user_id=$2",
          [u.organization_id, person.id],
        );
        for (const outlet of input.outletIds)
          await tx.query(
            "INSERT INTO member_outlets(organization_id,user_id,outlet_id) VALUES($1,$2,$3)",
            [u.organization_id, person.id, outlet],
          );
        if (input.role === "management" && input.active)
          await tx.query(
            "INSERT INTO organization_owners(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [u.organization_id, person.id],
          );
        else
          await tx.query(
            "DELETE FROM organization_owners WHERE organization_id=$1 AND user_id=$2",
            [u.organization_id, person.id],
          );
        await tx.query(
          "DELETE FROM sessions WHERE user_id=$1 AND user_id<>$2",
          [person.id, u.id],
        );
        return { id: person.id, linked: !!existing };
      },
    );
  });

  app.post("/api/core/targets", async (c) => {
    management(c);
    const input = await parse(
      c,
      z.object({
        salary: percent,
        operational: percent,
        irregular: percent,
        marketing: percent,
      }),
    );
    return change(c, "targets.save", input, async (tx: Queryable, u: User) => {
      await tx.query("UPDATE organizations SET cost_targets=$1 WHERE id=$2", [
        JSON.stringify(input),
        u.organization_id,
      ]);
      return { ok: true };
    });
  });
  app.get("/api/core/monthly", async (c) => {
    management(c);
    const period = month.parse(c.req.query("month")),
      scope = c.req.query("scope") || "organization",
      u = c.get("user");
    if (!["organization", "outlet"].includes(scope))
      throw new DomainError("Cakupan tidak valid.", 422);
    return c.json(
      await c.get("db").transaction(async (tx) => {
        await tx.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        return monthly(
          tx,
          u.organization_id,
          scope === "outlet" ? u.business_id : null,
          period,
        );
      }),
    );
  });
  app.post("/api/core/reports/publish", async (c) => {
    management(c);
    const input = await parse(
      c,
      z.object({
        month,
        scope: z.enum(["organization", "outlet"]),
        note: proof,
      }),
    );
    return change(
      c,
      "report.publish",
      input,
      async (tx: Queryable, u: User) => {
        const outlet = input.scope === "outlet" ? u.business_id : null;
        for (const b of (
          await tx.query(
            "SELECT id FROM businesses WHERE organization_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY id FOR UPDATE",
            [u.organization_id, outlet],
          )
        ).rows)
          await syncOperationalDocuments(tx, b.id, u);
        const snapshot = await monthly(
          tx,
          u.organization_id,
          outlet,
          input.month,
        );
        if (snapshot.pending > 0)
          throw new DomainError(
            "Selesaikan pendapatan/pengeluaran yang belum disetujui sebelum publikasi.",
            409,
          );
        const open = (
          await tx.query(
            "SELECT s.id FROM shifts s JOIN businesses b ON b.id=s.business_id WHERE b.organization_id=$1 AND ($2::uuid IS NULL OR b.id=$2) AND s.closed_at IS NULL AND s.business_date BETWEEN $3::date AND $4::date",
            [u.organization_id, outlet, snapshot.from, snapshot.to],
          )
        ).rows;
        if (open.length)
          throw new DomainError(
            "Tutup shift dalam periode laporan sebelum publikasi.",
            409,
          );
        const previous = (
          await tx.query(
            "SELECT COALESCE(max(revision),0)::int revision FROM published_reports WHERE organization_id=$1 AND outlet_id IS NOT DISTINCT FROM $2::uuid AND month=$3",
            [u.organization_id, outlet, input.month],
          )
        ).rows[0].revision;
        if (previous && !input.note)
          throw new DomainError("Revisi laporan wajib disertai alasan.", 422);
        const rid = uid();
        await tx.query(
          "INSERT INTO published_reports(id,organization_id,outlet_id,month,revision,snapshot,published_by,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            rid,
            u.organization_id,
            outlet,
            input.month,
            previous + 1,
            JSON.stringify(snapshot),
            u.id,
            input.note,
          ],
        );
        return { id: rid, revision: previous + 1 };
      },
    );
  });
  app.get("/api/core/reports", async (c) => {
    reportAccess(c);
    const u = c.get("user"),
      db = c.get("db");
    const rows = (
      await db.query(
        "SELECT id,month,outlet_id,revision,published_at,note FROM published_reports WHERE organization_id=$1 ORDER BY month DESC,published_at DESC",
        [u.organization_id],
      )
    ).rows;
    return c.json({ reports: rows });
  });
  app.get("/api/core/reports/:id", async (c) => {
    reportAccess(c);
    const u = c.get("user"),
      db = c.get("db");
    const r = (
      await db.query(
        "SELECT * FROM published_reports WHERE id=$1 AND organization_id=$2",
        [id.parse(c.req.param("id")), u.organization_id],
      )
    ).rows[0];
    if (!r) throw new DomainError("Laporan tidak ditemukan.", 404);
    const plan = r.outlet_id
      ? null
      : (
          await db.query(
            `SELECT p.*,r.snapshot->'totals'->>'net' net_basis FROM dividend_plans p JOIN published_reports r ON r.id=p.report_id WHERE p.organization_id=$1 AND r.month=$2 AND r.outlet_id IS NULL`,
            [u.organization_id, r.month],
          )
        ).rows[0];
    if (plan) {
      const payments = (
        await db.query(
          "SELECT id,user_id,amount,paid_date,reference,proof,business_id,account FROM dividend_payments WHERE plan_id=$1 AND ($2::boolean OR user_id=$3) ORDER BY paid_date",
          [plan.id, u.role === "owner", u.id],
        )
      ).rows;
      if (u.role === "investor")
        plan.allocations = plan.allocations.filter(
          (a: any) => a.userId === u.id,
        );
      plan.payments = payments;
    }
    return c.json({ report: r, dividend: plan || null });
  });
  app.post("/api/core/dividends", async (c) => {
    management(c);
    const input = await parse(
      c,
      z.object({
        reportId: id,
        amount,
        infaq: amount,
        managementPercent: percent,
        investorPercent: percent,
        members: z.array(z.object({ userId: id, percent })).max(100),
        note: proof,
      }),
    );
    return change(
      c,
      "dividend.decide",
      input,
      async (tx: Queryable, u: User) => {
        if (!D(input.managementPercent).plus(input.investorPercent).eq(100))
          throw new DomainError(
            "Bagian management + investor harus 100%.",
            422,
          );
        const r = (
          await tx.query(
            "SELECT * FROM published_reports WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [input.reportId, u.organization_id],
          )
        ).rows[0];
        if (!r || r.outlet_id)
          throw new DomainError(
            "Dividen ditetapkan dari laporan gabungan bisnis.",
            422,
          );
        const latest = (
          await tx.query(
            "SELECT max(revision)::int revision FROM published_reports WHERE organization_id=$1 AND month=$2 AND outlet_id IS NULL",
            [u.organization_id, r.month],
          )
        ).rows[0].revision;
        if (r.revision !== latest)
          throw new DomainError("Gunakan revisi laporan terbaru.", 409);
        if (
          (
            await tx.query(
              "SELECT p.id FROM dividend_plans p JOIN published_reports r ON r.id=p.report_id WHERE p.organization_id=$1 AND r.month=$2",
              [u.organization_id, r.month],
            )
          ).rows.length
        )
          throw new DomainError(
            "Keputusan dividen bulan ini sudah ditetapkan; tidak boleh dibuat ulang.",
            409,
          );
        const profit = D(r.snapshot.totals.net).gt(0)
          ? D(r.snapshot.totals.net)
          : D(0);
        if (D(input.infaq).plus(input.amount).gt(profit))
          throw new DomainError(
            "Infaq dan dividen melebihi laba tersedia.",
            422,
          );
        if (
          new Set(input.members.map((m) => m.userId)).size !==
          input.members.length
        )
          throw new DomainError("Penerima duplikat.", 422);
        const people = [];
        for (const entry of input.members) {
          const m = (
            await tx.query(
              "SELECT m.role,u.name FROM business_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND m.role IN ('management','investor')",
              [u.organization_id, entry.userId],
            )
          ).rows[0];
          if (!m)
            throw new DomainError(
              "Penerima tidak memiliki keanggotaan aktif yang sesuai.",
              422,
            );
          people.push({ ...entry, name: m.name, role: m.role });
        }
        const allocations = allocateDividends(
            input.amount,
            input.managementPercent,
            people,
          ),
          pid = uid();
        await tx.query(
          "INSERT INTO dividend_plans(id,report_id,organization_id,amount,infaq,management_percent,investor_percent,allocations,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            pid,
            r.id,
            u.organization_id,
            input.amount,
            input.infaq,
            input.managementPercent,
            input.investorPercent,
            JSON.stringify(allocations),
            input.note,
            u.id,
          ],
        );
        return {
          id: pid,
          allocations,
          retained: profit.minus(input.infaq).minus(input.amount).toFixed(0),
        };
      },
    );
  });
  app.post("/api/core/dividends/pay", async (c) => {
    management(c);
    const input = await parse(
      c,
      z.object({
        planId: id,
        userId: id,
        amount: amount.refine((n) => n > 0),
        paidDate: date,
        reference: text,
        proof,
        account: z.enum(["safe", "bank"]).default("bank"),
      }),
    );
    return change(c, "dividend.pay", input, async (tx: Queryable, u: User) => {
      if (
        input.paidDate >
        businessDay(
          (
            await tx.query("SELECT timezone FROM businesses WHERE id=$1", [
              u.business_id,
            ])
          ).rows[0].timezone,
        )
      )
        throw new DomainError(
          "Tanggal pembayaran tidak boleh di masa depan.",
          422,
        );
      const p = (
        await tx.query(
          "SELECT * FROM dividend_plans WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [input.planId, u.organization_id],
        )
      ).rows[0];
      const allocation = p?.allocations.find(
        (a: any) => a.userId === input.userId,
      );
      if (!allocation)
        throw new DomainError("Penerima dividen tidak ditemukan.", 404);
      const paid = (
        await tx.query(
          "SELECT COALESCE(sum(amount),0)::text amount FROM dividend_payments WHERE plan_id=$1 AND user_id=$2",
          [p.id, input.userId],
        )
      ).rows[0].amount;
      if (D(paid).plus(input.amount).gt(allocation.amount))
        throw new DomainError("Pembayaran melebihi bagian penerima.", 422);
      await unlocked(tx, u.business_id, input.paidDate);
      await requireFunds(tx, u.business_id, input.account, input.amount);
      const payment = uid();
      await tx.query(
        "INSERT INTO dividend_payments(id,plan_id,user_id,amount,paid_date,reference,proof,created_by,business_id,account) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          payment,
          p.id,
          input.userId,
          input.amount,
          input.paidDate,
          input.reference,
          input.proof,
          u.id,
          u.business_id,
          input.account,
        ],
      );
      await post(
        tx,
        u.business_id,
        input.paidDate,
        `dividend-payment:${payment}`,
        `Pembayaran dividen: ${input.reference}`,
        [
          { account: "capital", debit: input.amount },
          { account: input.account, credit: input.amount },
        ],
      );
      return { id: payment };
    });
  });
}
