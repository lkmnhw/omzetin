import { useEffect, useState } from "react";
import {
  Download,
  ShieldCheck,
  ArrowRight,
  ReceiptText,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import { api, rupiah, time } from "./api";
const names: Record<string, string> = {
  cash: "Kas laci",
  safe: "Kas brankas",
  bank: "Bank",
  clearing: "Belum cair",
  inventory: "Persediaan",
  advance: "Uang muka pelanggan",
  sales: "Penjualan",
  discount: "Diskon",
  returns: "Retur",
  cogs: "HPP bahan",
  expense: "Biaya operasional",
  waste: "Waste",
  variance: "Selisih kas & stok",
  capital: "Modal",
  payment_fee: "Biaya pembayaran",
};
export default function Reports({
  day,
  timezone,
  onOrder,
  outletName,
}: {
  day: string;
  timezone: string;
  onOrder: (id: string) => void;
  outletName: string;
}) {
  const [from, setFrom] = useState(day),
    [to, setTo] = useState(day),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState("outlet");
  async function load(start = from, end = to) {
    setLoading(true);
    setError("");
    try {
      setData(await api(`/reports?from=${start}&to=${end}&scope=${scope}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const bal = (a: string) =>
      Number(data?.period.find((b: any) => b.account === a)?.balance || 0),
    sales = -bal("sales") - bal("discount") - bal("returns"),
    cogs = bal("cogs"),
    expense = ["expense", "waste", "variance", "payment_fee"].reduce(
      (s, a) => s + bal(a),
      0,
    );
  function download() {
    const rows = [
      ["Jenis", "Akun", "Debit", "Kredit", "Saldo"],
      ...data.period.map((b: any) => [
        "Pergerakan periode",
        names[b.account],
        b.debit,
        b.credit,
        b.balance,
      ]),
      ...data.closing.map((b: any) => [
        "Saldo sampai akhir",
        names[b.account],
        b.debit,
        b.credit,
        b.balance,
      ]),
    ];
    const blob = new Blob(
        [
          "\uFEFF" +
            rows
              .map((r) =>
                r
                  .map((v: any) => '"' + String(v).replaceAll('"', '""') + '"')
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `omzetin-laporan-${data.scope === "organization" ? "semua-outlet" : "outlet"}-${data.from}-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <form
        className="report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Cakupan
          <select
            aria-label="Cakupan laporan"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="outlet">Outlet aktif</option>
            <option value="organization">Seluruh outlet usaha ini</option>
          </select>
        </label>
        <label>
          Dari tanggal
          <input
            aria-label="Dari tanggal laporan"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
            max={to}
          />
        </label>
        <label>
          Sampai tanggal
          <input
            aria-label="Sampai tanggal laporan"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            min={from}
            max={day}
          />
        </label>
        <button className="btn primary" disabled={loading}>
          {loading ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <ArrowRight size={17} />
          )}
          Tampilkan laporan
        </button>
      </form>
      {error && (
        <div role="alert" className="error-note">
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="report-intro">
            <ShieldCheck size={22} />
            <div>
              <strong>Laporan dari transaksi yang dibukukan.</strong>
              <p>
                {data.scope === "organization"
                  ? `Gabungan ${data.outletIds.length} outlet usaha ini`
                  : `Outlet ${outletName}`}{" "}
                · Periode {data.from} sampai {data.to}. Saldo akhir mencakup
                saldo pembukaan dan seluruh transaksi sampai tanggal akhir.
              </p>
            </div>
            <button className="btn secondary" onClick={download}>
              <Download size={16} />
              Ekspor CSV
            </button>
          </div>
          <div className="reports-grid">
            <section className="panel profit-report">
              <div className="panel-heading">
                <div>
                  <h2>Hasil usaha tercatat</h2>
                  <p>Penjualan diakui saat pesanan diserahkan</p>
                </div>
              </div>
              {[
                ["Penjualan bruto", -bal("sales")],
                ["Diskon penjualan", bal("discount")],
                ["Refund penjualan", bal("returns")],
                ["Penjualan neto", sales],
                ["HPP bahan", cogs],
                ["Margin setelah bahan", sales - cogs],
                ["Biaya operasional", bal("expense")],
                ["Waste bahan", bal("waste")],
                ["Selisih kas & stok", bal("variance")],
                ["Biaya pembayaran", bal("payment_fee")],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  className={`profit-line ${[3, 5].includes(i) ? "subtotal-line" : ""}`}
                >
                  <span>{label}</span>
                  <strong>{rupiah(value)}</strong>
                </div>
              ))}
              <div className="profit-final">
                <span>Laba operasional tercatat</span>
                <strong>{rupiah(sales - cogs - expense)}</strong>
              </div>
              <p className="report-note">
                Laporan manajemen berbasis biaya tercatat. Belum mencakup
                penyusutan, utang/piutang, pajak, atau alokasi overhead
                produksi.
              </p>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Neraca saldo akhir</h2>
                  <p>Saldo kumulatif sampai {data.to}</p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Akun</th>
                      <th className="align-right">Debit</th>
                      <th className="align-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.closing.map((b: any) => (
                      <tr key={b.account}>
                        <td>{names[b.account]}</td>
                        <td className="align-right">
                          {Number(b.balance) > 0 ? rupiah(b.balance) : "—"}
                        </td>
                        <td className="align-right">
                          {Number(b.balance) < 0
                            ? rupiah(-Number(b.balance))
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="trial-balance">
                <ShieldCheck size={17} />
                Debit dan kredit seimbang
                <span>
                  {rupiah(
                    data.closing.reduce(
                      (sum: number, b: any) =>
                        sum + Math.max(0, Number(b.balance)),
                      0,
                    ),
                  )}
                </span>
              </div>
            </section>
          </div>
          <section className="panel spaced">
            <div className="panel-heading">
              <div>
                <h2>Pergerakan kas & bank</h2>
                <p>Transfer internal muncul pada akun asal dan tujuan</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th>Saldo awal</th>
                    <th>Masuk</th>
                    <th>Keluar</th>
                    <th>Saldo akhir</th>
                  </tr>
                </thead>
                <tbody>
                  {["cash", "safe", "bank"].map((a) => (
                    <tr key={a}>
                      <td>{names[a]}</td>
                      <td>
                        {rupiah(
                          data.opening.find((b: any) => b.account === a)
                            ?.balance || 0,
                        )}
                      </td>
                      <td>
                        {rupiah(
                          data.period.find((b: any) => b.account === a)
                            ?.debit || 0,
                        )}
                      </td>
                      <td>
                        {rupiah(
                          data.period.find((b: any) => b.account === a)
                            ?.credit || 0,
                        )}
                      </td>
                      <td>
                        <strong>
                          {rupiah(
                            data.closing.find((b: any) => b.account === a)
                              ?.balance || 0,
                          )}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel spaced">
            <div className="panel-heading">
              <div>
                <h2>Jurnal transaksi</h2>
                <p>100 jurnal terbaru dalam periode yang dipilih</p>
              </div>
            </div>
            {data.journals.length ? (
              <div className="journal-list">
                {data.journals.map((j: any) => (
                  <details key={j.id}>
                    <summary>
                      <span className="journal-icon">
                        <ReceiptText size={17} />
                      </span>
                      <div>
                        <strong>{j.description}</strong>
                        <small>
                          {j.business_date} · {time(j.created_at, timezone)} ·{" "}
                          {j.outlet_name}
                        </small>
                      </div>
                      <span>
                        {rupiah(
                          j.lines.reduce(
                            (s: number, l: any) => s + Number(l.debit),
                            0,
                          ),
                        )}
                      </span>
                      <ChevronDown size={16} />
                    </summary>
                    <div className="journal-detail">
                      {j.lines.map((l: any, i: number) => (
                        <div key={i}>
                          <span>{names[l.account]}</span>
                          <span>Debit {rupiah(l.debit)}</span>
                          <span>Kredit {rupiah(l.credit)}</span>
                        </div>
                      ))}
                      {j.order_id && (
                        <button
                          className="text-button"
                          onClick={() => onOrder(j.order_id)}
                        >
                          Lihat pesanan asal
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>Belum ada jurnal di periode ini</h3>
                <p>Pilih tanggal yang memuat aktivitas usaha.</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
