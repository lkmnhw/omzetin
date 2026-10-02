import Decimal from "decimal.js";
import type { Queryable } from "./db";
export const D = (n: Decimal.Value) => new Decimal(n);
export const fixed = (n: Decimal.Value) => D(n).toDecimalPlaces(6).toFixed(6);
export const uid = () => crypto.randomUUID();
export const accounts: Record<string, string> = {
  cash: "Kas laci",
  safe: "Kas brankas",
  bank: "Bank",
  clearing: "Pembayaran belum cair",
  inventory: "Persediaan bahan",
  advance: "Uang muka pelanggan",
  sales: "Penjualan",
  discount: "Diskon penjualan",
  returns: "Retur penjualan",
  cogs: "HPP bahan",
  expense: "Biaya operasional",
  waste: "Bahan terbuang",
  variance: "Selisih kas dan stok",
  capital: "Modal pemilik",
  payment_fee: "Biaya pembayaran",
};
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function businessDay(timezone = "Asia/Makassar", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export async function balance(tx: Queryable, bid: string, account: string) {
  const result = await tx.query(
    "SELECT COALESCE(sum(debit-credit),0)::text AS amount FROM journal_lines WHERE business_id=$1 AND account=$2",
    [bid, account],
  );
  return D(result.rows[0].amount);
}
export async function post(
  tx: Queryable,
  bid: string,
  day: string,
  source: string,
  description: string,
  lines: { account: string; debit?: Decimal.Value; credit?: Decimal.Value }[],
  shiftId: string | null = null,
  orderId: string | null = null,
) {
  const valid = lines
    .map((l) => ({
      ...l,
      debit: fixed(l.debit || 0),
      credit: fixed(l.credit || 0),
    }))
    .filter((l) => D(l.debit).gt(0) || D(l.credit).gt(0));
  const debits = valid.reduce((s, l) => s.plus(l.debit), D(0)),
    credits = valid.reduce((s, l) => s.plus(l.credit), D(0));
  if (valid.length < 2 || !debits.eq(credits))
    throw new DomainError("Jurnal tidak seimbang. Transaksi dibatalkan.", 500);
  const id = uid();
  await tx.query(
    "INSERT INTO journal_entries(id,business_id,source_key,description,business_date,shift_id,order_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, bid, source, description, day, shiftId, orderId],
  );
  for (const l of valid)
    await tx.query(
      "INSERT INTO journal_lines(id,business_id,entry_id,account,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",
      [uid(), bid, id, l.account, l.debit, l.credit],
    );
  return id;
}
export async function requireFunds(
  tx: Queryable,
  bid: string,
  account: string,
  amount: Decimal.Value,
) {
  if ((await balance(tx, bid, account)).lt(amount))
    throw new DomainError("Saldo akun pembayaran tidak mencukupi.");
}
export function consumptionCost(
  quantity: Decimal.Value,
  value: Decimal.Value,
  take: Decimal.Value,
) {
  if (D(take).lt(0) || D(take).gt(quantity))
    throw new DomainError("Kuantitas bahan tidak tersedia.");
  return D(take).eq(quantity)
    ? D(value)
    : D(value).mul(take).div(quantity).toDecimalPlaces(6);
}
