import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, rupiah } from "./api";
import Decimal from "decimal.js";
import {
  ArrowUpRight,
  Check,
  Clock3,
  FileCheck2,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Plus,
  Printer,
  ShoppingBag,
  Users,
  Wallet,
  Download,
} from "lucide-react";
import "./core.css";

const roles: Record<string, string> = {
  owner: "Management",
  manager: "Manager",
  cashier: "Karyawan",
  investor: "Investor",
};
const channels: Record<string, string> = {
  cash: "Cash",
  gojek: "Gojek",
  grab: "Grab",
  qris: "QRIS",
  transfer: "Transfer",
};
const categories: Record<string, string> = {
  materials: "Bahan",
  packaging: "Kemasan",
  salary: "Gaji karyawan",
  operational: "Operasional",
  marketing: "Marketing",
  equipment: "Peralatan",
  logistics: "Logistik",
  other: "Lainnya",
};
const groups: Record<string, string> = {
  daily: "Harian",
  monthly: "Bulanan",
  irregular: "Tidak tetap",
};
const statusNames: Record<string, string> = {
  draft: "Draft",
  submitted: "Menunggu approval",
  approved: "Disetujui",
  returned: "Perlu koreksi",
  rejected: "Ditolak",
  voided: "Dibatalkan",
};
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Percent({ value }: { value: number | null }) {
  return (
    <>
      {value === null
        ? "Belum dapat dihitung"
        : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}%`}
    </>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`core-status ${value}`}>
      {statusNames[value] || value}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="core-empty">
      <FileCheck2 size={30} />
      <p>{children}</p>
    </div>
  );
}
const formObject = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form));
const fmtTime = (s: string | null, zone: string) =>
  s
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: zone,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(s))
    : "—";

export default function CorePortal({
  state: s,
  refresh,
  onLogout,
  onOutlet,
  workspace,
}: {
  state: any;
  refresh: () => Promise<any>;
  onLogout: () => Promise<void>;
  onOutlet: (id: string) => Promise<void>;
  workspace: (view: "cashier" | "inventory" | "settings") => ReactNode;
}) {
  const role = s.user.role,
    manage = role === "owner",
    manager = manage || role === "manager",
    investor = role === "investor";
  const initial = location.pathname.startsWith("/laporan")
    ? "reports"
    : location.pathname.startsWith("/manager")
      ? "manager"
      : "cashier";
  const [app, setApp] = useState(
    investor
      ? "reports"
      : initial === "reports" && !manage
        ? "cashier"
        : initial === "manager" && !manager
          ? "cashier"
          : initial,
  );
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [refund, setRefund] = useState<any>(null),
    [review, setReview] = useState<any>(null),
    [member, setMember] = useState<any>(null);
  const [month, setMonth] = useState(s.day.slice(0, 7)),
    [scope, setScope] = useState("organization"),
    [draft, setDraft] = useState<any>(null),
    [reports, setReports] = useState<any[]>([]),
    [published, setPublished] = useState<any>(null);
  const loadId = useRef(0);
  async function load() {
    const n = ++loadId.current;
    setLoading(true);
    try {
      const d = await api("/core/state");
      if (n !== loadId.current) return;
      setData(d);
      if (manage) {
        const m = await api("/core/members");
        if (n !== loadId.current) return;
        setMembers(m.members);
      }
      if (investor || manage) {
        const r = await api("/core/reports");
        if (n !== loadId.current) return;
        setReports(r.reports);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (n === loadId.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [s]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function act(
    path: string,
    input: any,
    message = "Perubahan disimpan.",
  ) {
    if (busy) return null;
    setBusy(true);
    setError("");
    try {
      const r = await api(path, input);
      await refresh();
      setToast(message);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function navigate(value: string) {
    setApp(value);
    setTab("overview");
    setError("");
    setEditor(null);
    setReceipt(null);
    setRefund(null);
    setReview(null);
    setPublished(null);
    history.replaceState(
      null,
      "",
      value === "cashier"
        ? "/kasir"
        : value === "manager"
          ? "/manager"
          : "/laporan",
    );
  }
  async function loadMonthly() {
    setLoading(true);
    setError("");
    try {
      setDraft(await api(`/core/monthly?month=${month}&scope=${scope}`));
      setPublished(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function openReport(id: string) {
    setLoading(true);
    setError("");
    try {
      setPublished(await api(`/core/reports/${id}`));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const docs = data?.documents || [],
    attendance = data?.attendance || [],
    schedule = data?.business.operating_schedule;
  const tabs =
    app === "cashier"
      ? [
          ["overview", "Transaksi"],
          ["documents", "Rekap & pengajuan"],
          ["attendance", "Absensi"],
        ]
      : app === "manager"
        ? [
            ["overview", "Approval"],
            ["income", "Pendapatan"],
            ["expense", "Pengeluaran"],
            ["attendance", "Jadwal & absensi"],
            ["inventory", "Menu & stok"],
            ...(manage
              ? [
                  ["members", "Tim & akses"],
                  ["business", "Bisnis & outlet"],
                ]
              : []),
          ]
        : [];
  const report = published?.report.snapshot || draft;
  return (
    <div className={`core-portal ${app}`}>
      <header className="core-topbar">
        <a className="core-brand" href="/" aria-label="Omzetin beranda">
          <span>o↗</span>omzetin.
        </a>
        <nav aria-label="Pilih aplikasi">
          {!investor && (
            <button
              className={app === "cashier" ? "active" : ""}
              disabled={busy}
              onClick={() => navigate("cashier")}
            >
              <ShoppingBag size={17} />
              Aplikasi Kasir
            </button>
          )}
          {manager && (
            <button
              className={app === "manager" ? "active" : ""}
              disabled={busy}
              onClick={() => navigate("manager")}
            >
              <LayoutGrid size={17} />
              Aplikasi Manager
            </button>
          )}
          {(manage || investor) && (
            <button
              className={app === "reports" ? "active" : ""}
              disabled={busy}
              onClick={() => navigate("reports")}
            >
              <FileCheck2 size={17} />
              Aplikasi Laporan
            </button>
          )}
        </nav>
        <div className="core-account">
          <span>
            {s.user.name}
            <small>{roles[role]}</small>
          </span>
          <button
            className="icon-button"
            aria-label="Keluar akun"
            disabled={busy}
            onClick={onLogout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="core-context">
        <div>
          <span className="section-kicker">{s.business.name}</span>
          <span>
            {app === "cashier"
              ? "Operasional warung"
              : app === "manager"
                ? "Ruang kendali operasional"
                : "Pertanggungjawaban bulanan"}
          </span>
        </div>
        <Field label="Pilih bisnis dan outlet">
          <select
            value={s.business.id}
            disabled={busy}
            onChange={async (e) => {
              setError("");
              try {
                await onOutlet(e.target.value);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {s.outlets.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.organization_name} · {o.outlet_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <div className="error-note core-message" role="alert">
          {error}
        </div>
      )}
      {toast && (
        <div className="core-toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {tabs.length > 0 && (
        <nav className="core-tabs" aria-label="Menu aplikasi">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setEditor(null);
                setError("");
              }}
            >
              {label}
              {key === "overview" &&
                app === "manager" &&
                docs.filter((d: any) => d.status === "submitted").length >
                  0 && (
                  <b>
                    {docs.filter((d: any) => d.status === "submitted").length}
                  </b>
                )}
            </button>
          ))}
        </nav>
      )}
      {app === "cashier" && tab === "overview" && (
        <div className="core-legacy cashier">{workspace("cashier")}</div>
      )}
      {app === "manager" && tab === "inventory" && (
        <div className="core-legacy">{workspace("inventory")}</div>
      )}
      {app === "manager" && tab === "business" && manage && (
        <div className="core-legacy">{workspace("settings")}</div>
      )}
      <main className="core-main" id="core-main">
        {loading && !data && (
          <p className="core-loading">
            <LoaderCircle className="spin" />
            Memuat ruang kerja…
          </p>
        )}
        {((app === "cashier" && tab === "documents") ||
          (app === "manager" &&
            ["overview", "income", "expense"].includes(tab))) && (
          <>
            <div className="core-heading">
              <div>
                <span className="section-kicker">
                  CATAT • PERIKSA • TELUSURI
                </span>
                <h1>
                  {app === "cashier"
                    ? "Rekap & pengajuan"
                    : tab === "income"
                      ? "Pendapatan & pencairan"
                      : tab === "expense"
                        ? "Pengeluaran warung"
                        : "Pemeriksaan operasional"}
                </h1>
                <p>
                  {app === "cashier"
                    ? "Pendapatan cash otomatis diajukan setelah shift ditutup."
                    : "Keputusan tersimpan bersama nama pemeriksa dan alasan."}
                </p>
              </div>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  setEditor({ kind: tab === "income" ? "income" : "expense" })
                }
              >
                <Plus size={18} />
                {tab === "income" ? "Catat pendapatan" : "Catat pengeluaran"}
              </button>
            </div>
            {app === "cashier" && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setEditor({ kind: "income" })}
              >
                Catat pendapatan platform / transfer
              </button>
            )}
            {app === "manager" && tab === "overview" && (
              <div className="core-stats">
                <Stat
                  label="Menunggu approval"
                  value={String(
                    docs.filter((d: any) => d.status === "submitted").length,
                  )}
                  money={false}
                />
                <Stat
                  label="Perlu koreksi"
                  value={String(
                    docs.filter((d: any) =>
                      ["returned", "rejected"].includes(d.status),
                    ).length,
                  )}
                  money={false}
                />
                <Stat
                  label="Pencairan belum lengkap"
                  value={String(
                    docs.filter(
                      (d: any) =>
                        d.kind === "income" &&
                        Number(d.settled_gross) < Number(d.amount),
                    ).length,
                  )}
                  money={false}
                />
              </div>
            )}
            {editor && (
              <DocumentForm
                key={editor.id || editor.kind}
                item={editor}
                today={s.day}
                busy={busy}
                onClose={() => setEditor(null)}
                onSave={async (f: any) => {
                  const r = await act(
                    "/core/documents",
                    f,
                    "Pencatatan berhasil disimpan.",
                  );
                  if (r) setEditor(null);
                }}
              />
            )}
            {receipt && (
              <ReceiptForm
                item={receipt}
                today={s.day}
                busy={busy}
                onClose={() => setReceipt(null)}
                onSave={async (f: any) => {
                  if (
                    await act("/core/receipts", f, "Pencairan final dicatat.")
                  )
                    setReceipt(null);
                }}
              />
            )}
            {refund && (
              <form
                className="core-card core-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = formObject(e.currentTarget);
                  if (
                    await act(
                      "/core/refunds",
                      { ...f, amount: Number(f.amount), documentId: refund.id },
                      "Refund pendapatan dicatat.",
                    )
                  )
                    setRefund(null);
                }}
              >
                <h2>Refund {refund.description}</h2>
                <p>
                  Catat dana yang telah dikembalikan melalui bank. Potongan
                  platform tetap mengikuti pencairan asal.
                </p>
                <div className="core-form-grid">
                  <Field label="Nominal refund">
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max={refund.settled_gross}
                      step="1"
                      required
                    />
                  </Field>
                  <Field label="Tanggal refund">
                    <input
                      name="businessDate"
                      type="date"
                      max={s.day}
                      defaultValue={s.day}
                      required
                    />
                  </Field>
                  <Field label="Referensi refund">
                    <input name="reference" required maxLength={150} />
                  </Field>
                  <Field label="Bukti refund">
                    <input name="proof" maxLength={1000} />
                  </Field>
                </div>
                <Field label="Alasan refund">
                  <input name="reason" required maxLength={150} />
                </Field>
                <div className="core-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setRefund(null)}
                  >
                    Batal
                  </button>
                  <button className="btn primary" disabled={busy}>
                    Simpan refund
                  </button>
                </div>
              </form>
            )}
            {review && (
              <form
                className="core-card core-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = formObject(e.currentTarget);
                  if (
                    await act(
                      "/core/review",
                      {
                        id: review.id,
                        version: review.version,
                        decision: f.decision,
                        note: f.note,
                      },
                      "Hasil pemeriksaan disimpan.",
                    )
                  )
                    setReview(null);
                }}
              >
                <h2>Periksa {review.description}</h2>
                <Field label="Keputusan">
                  <select name="decision">
                    <option value="approved">Setujui</option>
                    <option value="returned">Kembalikan untuk koreksi</option>
                    <option value="rejected">Tolak</option>
                    {review.source_key.startsWith("manual:") && (
                      <option value="voided">
                        Batalkan catatan salah / duplikat
                      </option>
                    )}
                  </select>
                </Field>
                <Field label="Alasan / catatan pemeriksaan">
                  <textarea name="note" maxLength={1000} />
                </Field>
                <div className="core-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setReview(null)}
                  >
                    Batal
                  </button>
                  <button className="btn primary" disabled={busy}>
                    Simpan pemeriksaan
                  </button>
                </div>
              </form>
            )}
            <div className="core-card">
              <div className="core-card-head">
                <h2>
                  {app === "manager" && tab === "overview"
                    ? "Dokumen yang perlu diperiksa"
                    : "Riwayat pencatatan"}
                </h2>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  Muat ulang
                </button>
              </div>
              <DocumentList
                documents={docs.filter((d: any) =>
                  app === "manager" && tab === "overview"
                    ? ["submitted", "returned", "rejected"].includes(d.status)
                    : tab === "income"
                      ? d.kind !== "expense"
                      : tab === "expense"
                        ? d.kind === "expense"
                        : true,
                )}
                manager={manager}
                busy={busy}
                onReview={setReview}
                onReceipt={setReceipt}
                onRefund={setRefund}
                onEdit={setEditor}
              />
            </div>
            {data?.shifts?.length > 0 && (
              <div className="core-card">
                <h2>Rekonsiliasi shift</h2>
                <div className="core-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Shift</th>
                        <th>Tanggal</th>
                        <th>Seharusnya</th>
                        <th>Fisik</th>
                        <th>Selisih</th>
                        <th>Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.map((d: any) => (
                        <tr key={d.id}>
                          <td>{d.label}</td>
                          <td>{String(d.business_date).slice(0, 10)}</td>
                          <td>{d.closed_at ? rupiah(d.expected) : "Aktif"}</td>
                          <td>{d.closed_at ? rupiah(d.counted) : "—"}</td>
                          <td>{d.closed_at ? rupiah(d.difference) : "—"}</td>
                          <td>{d.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {tab === "attendance" && app !== "reports" && data && (
          <>
            <div className="core-heading">
              <div>
                <span className="section-kicker">RITME KERJA WARUNG</span>
                <h1>Jadwal & absensi</h1>
                <p>
                  {schedule?.open}–{schedule?.close} · {schedule?.shifts.length}{" "}
                  shift · {s.business.outlet_name}
                </p>
              </div>
            </div>
            <form
              className="core-card core-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = formObject(e.currentTarget);
                await act("/core/attendance", f, "Absensi disimpan.");
              }}
            >
              <h2>Absensi saya</h2>
              <div className="core-form-grid">
                <Field label="Shift absensi">
                  <select name="shiftLabel">
                    {schedule?.shifts.map((a: any) => (
                      <option key={a.name}>{a.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Catatan absensi">
                  <input name="note" maxLength={500} />
                </Field>
              </div>
              <div className="core-actions">
                <button
                  className="btn primary"
                  name="action"
                  value="in"
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    const f = formObject(e.currentTarget.form!);
                    void act(
                      "/core/attendance",
                      { ...f, action: "in" },
                      "Absensi masuk disimpan.",
                    );
                  }}
                >
                  <Clock3 size={17} />
                  Absen masuk
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    const f = formObject(e.currentTarget.form!);
                    void act(
                      "/core/attendance",
                      { ...f, action: "out" },
                      "Absensi pulang disimpan.",
                    );
                  }}
                >
                  Absen pulang
                </button>
              </div>
            </form>
            {manager && (
              <ScheduleForm
                schedule={schedule}
                busy={busy}
                onSave={async (f: any) => {
                  await act("/core/schedule", f, "Jadwal outlet diperbarui.");
                }}
              />
            )}
            <div className="core-card">
              <h2>Riwayat absensi</h2>
              {attendance.length === 0 ? (
                <Empty>Belum ada absensi.</Empty>
              ) : (
                <div className="core-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Karyawan</th>
                        <th>Shift</th>
                        <th>Masuk</th>
                        <th>Pulang</th>
                        <th>Terlambat</th>
                        <th>Catatan</th>
                        {manager && <th>Koreksi</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a: any) => (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td>{a.shift_label}</td>
                          <td>{fmtTime(a.clock_in, s.business.timezone)}</td>
                          <td>{fmtTime(a.clock_out, s.business.timezone)}</td>
                          <td>{a.late_minutes} menit</td>
                          <td>{a.note || "—"}</td>
                          {manager && (
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setEditor({ attendance: a })}
                              >
                                Koreksi
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {editor?.attendance && (
              <AttendanceCorrection
                item={editor.attendance}
                busy={busy}
                onClose={() => setEditor(null)}
                onSave={async (f: any) => {
                  if (
                    await act(
                      "/core/attendance/correct",
                      f,
                      "Koreksi absensi disimpan.",
                    )
                  )
                    setEditor(null);
                }}
              />
            )}
          </>
        )}
        {app === "manager" && tab === "members" && manage && (
          <>
            <div className="core-heading">
              <div>
                <span className="section-kicker">ANGGOTA BISNIS</span>
                <h1>Tim & hak akses</h1>
                <p>
                  Akses berlaku pada bisnis ini; persentase dividen ditentukan
                  tersendiri.
                </p>
              </div>
              <button className="btn primary" onClick={() => setMember({})}>
                <Users size={17} />
                Tambah anggota
              </button>
            </div>
            {member && (
              <MemberForm
                key={member.user_id || "new"}
                item={member}
                outlets={s.outlets.filter(
                  (o: any) => o.organization_id === s.business.organization_id,
                )}
                busy={busy}
                onClose={() => setMember(null)}
                onSave={async (f: any) => {
                  if (await act("/core/members", f, "Keanggotaan diperbarui."))
                    setMember(null);
                }}
              />
            )}
            <div className="core-card">
              <div className="core-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Email</th>
                      <th>Peran</th>
                      <th>Akses</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.user_id}>
                        <td>{m.name}</td>
                        <td>{m.email}</td>
                        <td>
                          {
                            {
                              management: "Management",
                              manager: "Manager",
                              employee: "Karyawan",
                              investor: "Investor",
                            }[m.role as "management"]
                          }
                        </td>
                        <td>
                          {m.active
                            ? m.all_outlets
                              ? "Seluruh outlet"
                              : `${m.outlet_ids.length} outlet`
                            : "Nonaktif"}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setMember(m)}
                          >
                            Ubah akses
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {app === "reports" && (manage || investor) && (
          <>
            <div className="core-heading">
              <div>
                <span className="section-kicker">
                  ANGKA YANG BISA DIPERTANGGUNGJAWABKAN
                </span>
                <h1>Laporan bulanan</h1>
                <p>
                  {investor
                    ? "Laporan yang telah diterbitkan management untuk bisnis ini."
                    : "Pendapatan final, pengeluaran, dan keputusan pembagian laba."}
                </p>
              </div>
            </div>
            {manage && (
              <form
                className="core-card core-filter"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadMonthly();
                }}
              >
                <Field label="Bulan laporan">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Cakupan laporan">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="organization">Seluruh outlet bisnis</option>
                    <option value="outlet">Outlet aktif</option>
                  </select>
                </Field>
                <button className="btn primary" disabled={loading || busy}>
                  Tampilkan draft
                </button>
              </form>
            )}
            <div className="core-card">
              <h2>Laporan terbit</h2>
              {reports.length === 0 ? (
                <Empty>Management belum mempublikasikan laporan.</Empty>
              ) : (
                <div className="core-published-list">
                  {reports.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => void openReport(r.id)}
                      className={
                        published?.report.id === r.id ? "selected" : ""
                      }
                    >
                      <FileCheck2 size={20} />
                      <span>
                        <strong>{r.month}</strong>
                        <small>
                          {r.outlet_id ? "Per outlet" : "Gabungan bisnis"} ·
                          revisi {r.revision}
                        </small>
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {report && (
              <>
                <ReportView
                  data={report}
                  revision={published?.report.revision}
                  dividend={published?.dividend}
                />
                {manage && draft && (
                  <>
                    <TargetsForm
                      targets={draft.targets}
                      busy={busy}
                      onSave={async (f: any) => {
                        if (
                          await act(
                            "/core/targets",
                            f,
                            "Target rasio diperbarui.",
                          )
                        )
                          await loadMonthly();
                      }}
                    />
                    <form
                      className="core-card core-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = formObject(e.currentTarget);
                        const r = await act(
                          "/core/reports/publish",
                          {
                            month: draft.month,
                            scope: draft.outletId ? "outlet" : "organization",
                            note: f.note,
                          },
                          "Laporan diterbitkan.",
                        );
                        if (r) await openReport(r.id);
                      }}
                    >
                      <h2>Publikasikan untuk investor</h2>
                      <p>
                        {draft.pending > 0
                          ? `${draft.pending} dokumen belum disetujui. Selesaikan approval terlebih dahulu.`
                          : "Periksa angka sebelum menerbitkan. Versi terbit disimpan sebagai arsip."}
                      </p>
                      <Field label="Catatan publikasi / alasan revisi">
                        <textarea name="note" maxLength={1000} />
                      </Field>
                      <button
                        className="btn primary"
                        disabled={busy || draft.pending > 0}
                      >
                        Publikasikan laporan
                      </button>
                    </form>
                  </>
                )}
                {published && (
                  <DividendSection
                    report={published.report}
                    dividend={published.dividend}
                    members={members}
                    manage={manage}
                    userId={s.user.id}
                    busy={busy}
                    today={s.day}
                    onDecide={async (f: any) => {
                      if (
                        await act(
                          "/core/dividends",
                          f,
                          "Keputusan dividen ditetapkan.",
                        )
                      )
                        await openReport(published.report.id);
                    }}
                    onPay={async (f: any) => {
                      const r = await act(
                        "/core/dividends/pay",
                        f,
                        "Realisasi pembayaran dicatat.",
                      );
                      if (r) await openReport(published.report.id);
                      return !!r;
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  money = true,
}: {
  label: string;
  value: any;
  money?: boolean;
}) {
  return (
    <div className="core-stat">
      <span>{label}</span>
      <strong>{money ? rupiah(value) : value}</strong>
    </div>
  );
}
function DocumentList({
  documents,
  manager,
  busy,
  onReview,
  onReceipt,
  onRefund,
  onEdit,
}: any) {
  return documents.length === 0 ? (
    <Empty>Belum ada dokumen pada daftar ini.</Empty>
  ) : (
    <div className="core-doc-list">
      {documents.map((d: any) => (
        <article key={d.id}>
          <div className="core-doc-icon">
            {d.kind === "expense" ? (
              <Wallet size={22} />
            ) : (
              <ArrowUpRight size={22} />
            )}
          </div>
          <div className="core-doc-detail">
            <strong>{d.description}</strong>
            <small>
              {String(d.business_date).slice(0, 10)} ·{" "}
              {d.creator || "Data lama"} ·{" "}
              {d.kind === "expense"
                ? `${groups[d.cost_group]} / ${categories[d.category]}`
                : channels[d.channel]}
            </small>
            <Status value={d.status} />
            {d.reference && <small>Referensi: {d.reference}</small>}
            {d.proof && <small>Bukti: {d.proof}</small>}
            {d.review_note && (
              <small>
                Pemeriksaan: {d.review_note} · {d.reviewer}
              </small>
            )}
            {d.kind === "income" && (
              <small>
                Final {rupiah(d.final)} ·{" "}
                {Number(d.settled_gross) >= Number(d.amount)
                  ? "Sudah cair"
                  : Number(d.settled_gross) > 0
                    ? "Sebagian cair"
                    : "Belum cair"}
              </small>
            )}
          </div>
          <div className="core-doc-amount">
            <strong>{rupiah(d.amount)}</strong>
            <small>
              {d.kind === "expense"
                ? "Pengeluaran"
                : d.kind === "refund"
                  ? "Pengurang pendapatan"
                  : "Kotor"}
            </small>
            <div className="core-actions">
              {manager && !["draft", "voided"].includes(d.status) && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => onReview(d)}
                >
                  Periksa
                </button>
              )}
              {manager &&
                d.kind === "income" &&
                d.status === "approved" &&
                Number(d.settled_gross) < Number(d.amount) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onReceipt(d)}
                  >
                    Catat pencairan
                  </button>
                )}
              {manager &&
                d.kind === "income" &&
                d.status === "approved" &&
                d.source_key.startsWith("manual:") &&
                Number(d.settled_gross) > 0 && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onRefund(d)}
                  >
                    Catat refund
                  </button>
                )}
              {d.source_key.startsWith("manual:") &&
                ["draft", "returned", "rejected"].includes(d.status) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onEdit(d)}
                  >
                    Perbaiki / ajukan
                  </button>
                )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function DocumentForm({ item, today, busy, onClose, onSave }: any) {
  const expense = item.kind === "expense";
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget);
        void onSave({
          ...f,
          id: item.id,
          version: item.version,
          kind: item.kind,
          amount: Number(f.amount),
          submit:
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !==
            "draft",
        });
      }}
    >
      <h2>
        {item.id
          ? "Perbaiki pencatatan"
          : expense
            ? "Catat pengeluaran"
            : "Catat pendapatan eksternal"}
      </h2>
      <p>
        {expense
          ? "Nominal yang sudah dibayarkan. Pengajuan kasir diperiksa manager."
          : "Rekap POS masuk otomatis saat tutup shift. Formulir ini untuk pendapatan yang belum dicatat di POS; gunakan referensi transaksi unik."}
      </p>
      <div className="core-form-grid">
        <Field label="Tanggal pencatatan">
          <input
            name="businessDate"
            type="date"
            max={today}
            defaultValue={
              item.business_date
                ? String(item.business_date).slice(0, 10)
                : today
            }
            required
            readOnly={!!item.id}
          />
        </Field>
        <Field label="Nominal kotor / pengeluaran">
          <input
            name="amount"
            type="number"
            min="1"
            max="100000000000"
            step="1"
            defaultValue={item.amount}
            required
          />
        </Field>
        {expense ? (
          <>
            <Field label="Kelompok pengeluaran">
              <select
                name="costGroup"
                defaultValue={item.cost_group || "daily"}
              >
                {Object.entries(groups).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kategori biaya">
              <select
                name="category"
                defaultValue={item.category || "materials"}
              >
                {Object.entries(categories).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sumber pembayaran">
              <select
                name="account"
                defaultValue={item.account || "safe"}
                disabled={!!item.id}
              >
                <option value="safe">Kas brankas</option>
                <option value="cash">Kas laci</option>
                <option value="bank">Bank</option>
              </select>
              {item.id && (
                <input type="hidden" name="account" value={item.account} />
              )}
            </Field>
          </>
        ) : (
          <Field label="Kanal pendapatan">
            <select name="channel" defaultValue={item.channel || "gojek"}>
              {Object.entries(channels)
                .filter(([k]) => k !== "cash")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Referensi transaksi">
          <input
            name="reference"
            maxLength={150}
            defaultValue={item.reference}
            required={!expense}
          />
        </Field>
      </div>
      <Field label="Keterangan">
        <input
          name="description"
          maxLength={150}
          defaultValue={item.description}
          required
        />
      </Field>
      <Field
        label="Bukti / nomor kuitansi"
        hint="Cantumkan nomor bukti atau lokasi dokumen yang bisa diperiksa manager."
      >
        <input name="proof" maxLength={1000} defaultValue={item.proof} />
      </Field>
      <div className="core-actions">
        <button className="btn secondary" type="button" onClick={onClose}>
          Batal
        </button>
        {!item.posted && (
          <button
            className="btn secondary"
            name="intent"
            value="draft"
            disabled={busy}
          >
            Simpan draft
          </button>
        )}
        <button
          className="btn primary"
          name="intent"
          value="submit"
          disabled={busy}
        >
          Simpan & ajukan
        </button>
      </div>
    </form>
  );
}
function ReceiptForm({ item, today, busy, onSave, onClose }: any) {
  const remaining = Number(item.amount) - Number(item.settled_gross);
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget);
        void onSave({
          ...f,
          documentId: item.id,
          gross: Number(f.gross),
          net: Number(f.net),
        });
      }}
    >
      <h2>Pencairan {channels[item.channel]}</h2>
      <p>
        Kotor yang belum dicairkan: {rupiah(remaining)}. Potongan dihitung dari
        selisih kotor dan final.
      </p>
      <div className="core-form-grid">
        <Field label="Kotor yang dicairkan">
          <input
            type="number"
            name="gross"
            min="1"
            max={remaining}
            step="1"
            defaultValue={remaining}
            required
          />
        </Field>
        <Field label="Final bersih diterima">
          <input
            type="number"
            name="net"
            min="0"
            max={remaining}
            step="1"
            required
          />
        </Field>
        <Field label="Tanggal dana diterima">
          <input
            type="date"
            name="receivedDate"
            defaultValue={today}
            max={today}
            required
          />
        </Field>
        <Field label="Referensi pencairan">
          <input name="reference" maxLength={150} required />
        </Field>
      </div>
      <div className="core-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Batal
        </button>
        <button className="btn primary" disabled={busy}>
          Simpan pencairan
        </button>
      </div>
    </form>
  );
}
function ScheduleForm({ schedule, busy, onSave }: any) {
  const [shifts, setShifts] = useState<any[]>(schedule.shifts),
    [days, setDays] = useState<number[]>(schedule.days);
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget);
        void onSave({ ...f, shifts, days });
      }}
    >
      <h2>Pengaturan jam outlet</h2>
      <div className="core-days">
        {["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map(
          (d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...days, i]
                      : days.filter((v) => v !== i),
                  )
                }
              />
              {d}
            </label>
          ),
        )}
      </div>
      <div className="core-form-grid">
        <Field label="Jam buka">
          <input
            type="time"
            name="open"
            defaultValue={schedule.open}
            required
          />
        </Field>
        <Field label="Jam tutup">
          <input
            type="time"
            name="close"
            defaultValue={schedule.close}
            required
          />
        </Field>
      </div>
      <p>
        Jam akhir lebih awal dari jam awal berarti selesai pada hari berikutnya.
      </p>
      {shifts.map((s, i) => (
        <div className="core-shift-row" key={i}>
          <Field label={`Nama shift ${i + 1}`}>
            <input
              value={s.name}
              required
              onChange={(e) =>
                setShifts(
                  shifts.map((a, k) =>
                    k === i ? { ...a, name: e.target.value } : a,
                  ),
                )
              }
            />
          </Field>
          <Field label={`Mulai shift ${i + 1}`}>
            <input
              type="time"
              value={s.start}
              required
              onChange={(e) =>
                setShifts(
                  shifts.map((a, k) =>
                    k === i ? { ...a, start: e.target.value } : a,
                  ),
                )
              }
            />
          </Field>
          <Field label={`Selesai shift ${i + 1}`}>
            <input
              type="time"
              value={s.end}
              required
              onChange={(e) =>
                setShifts(
                  shifts.map((a, k) =>
                    k === i ? { ...a, end: e.target.value } : a,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            className="text-button"
            disabled={shifts.length <= 1}
            onClick={() => setShifts(shifts.filter((_, k) => k !== i))}
          >
            Hapus
          </button>
        </div>
      ))}
      <div className="core-actions">
        <button
          type="button"
          className="btn secondary"
          disabled={shifts.length >= 12}
          onClick={() =>
            setShifts([
              ...shifts,
              {
                name: `Shift ${shifts.length + 1}`,
                start: "08:00",
                end: "15:00",
              },
            ])
          }
        >
          Tambah shift
        </button>
        <button className="btn primary" disabled={busy}>
          Simpan jadwal
        </button>
      </div>
    </form>
  );
}
function AttendanceCorrection({ item, busy, onClose, onSave }: any) {
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget);
        void onSave({
          id: item.id,
          clockIn: new Date(String(f.clockIn)).toISOString(),
          clockOut: f.clockOut
            ? new Date(String(f.clockOut)).toISOString()
            : null,
          note: f.note,
        });
      }}
    >
      <h2>Koreksi absensi</h2>
      <p>
        Jam pada formulir mengikuti zona waktu perangkat; tabel memakai zona
        waktu outlet.
      </p>
      <div className="core-form-grid">
        <Field label="Waktu masuk koreksi">
          <input name="clockIn" type="datetime-local" required />
        </Field>
        <Field label="Waktu pulang koreksi">
          <input name="clockOut" type="datetime-local" />
        </Field>
      </div>
      <Field label="Alasan koreksi">
        <input name="note" required maxLength={150} />
      </Field>
      <div className="core-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Batal
        </button>
        <button className="btn primary" disabled={busy}>
          Simpan koreksi
        </button>
      </div>
    </form>
  );
}
function MemberForm({ item, outlets, busy, onClose, onSave }: any) {
  const [role, setRole] = useState(item.role || "employee");
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget),
          fd = new FormData(e.currentTarget);
        void onSave({
          ...f,
          role,
          active: f.active === "true",
          outletIds: fd.getAll("outletIds"),
        });
      }}
    >
      <h2>
        {item.user_id ? "Ubah akses anggota" : "Tambahkan anggota bisnis"}
      </h2>
      <div className="core-form-grid">
        <Field label="Nama anggota">
          <input
            name="name"
            defaultValue={item.name}
            required
            maxLength={150}
          />
        </Field>
        <Field label="Email anggota">
          <input
            name="email"
            type="email"
            defaultValue={item.email}
            readOnly={!!item.user_id}
            required
          />
        </Field>
        <Field label="Peran anggota">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="employee">Karyawan</option>
            <option value="manager">Manager</option>
            <option value="management">Management</option>
            <option value="investor">Investor</option>
          </select>
        </Field>
        <Field label="Status akses">
          <select
            name="active"
            defaultValue={item.active === false ? "false" : "true"}
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>
      </div>
      {!item.user_id && (
        <Field
          label="Password akun baru"
          hint="Minimal 12 karakter. Kosongkan jika email sudah memiliki akun; password akun tersebut tetap berlaku."
        >
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
          />
        </Field>
      )}
      {["employee", "manager"].includes(role) && (
        <fieldset className="core-outlet-options">
          <legend>Outlet penugasan</legend>
          {outlets.map((o: any) => (
            <label key={o.id}>
              <input
                type="checkbox"
                name="outletIds"
                value={o.id}
                defaultChecked={item.outlet_ids?.includes(o.id)}
              />
              {o.outlet_name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="core-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Batal
        </button>
        <button className="btn primary" disabled={busy}>
          Simpan anggota
        </button>
      </div>
    </form>
  );
}

function TargetsForm({ targets, busy, onSave }: any) {
  return (
    <form
      className="core-card core-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = formObject(e.currentTarget);
        void onSave(
          Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])),
        );
      }}
    >
      <h2>Target rasio biaya</h2>
      <p>
        Anggaran bisnis, bukan standar universal. Hijau ≤ target; kuning ≤110%
        target; jingga ≤125% target; selebihnya merah.
      </p>
      <div className="core-form-grid">
        {[
          ["salary", "Gaji"],
          ["operational", "Operasional"],
          ["irregular", "Tidak tetap"],
          ["marketing", "Marketing"],
        ].map(([key, label]) => (
          <Field key={key} label={`Target ${label} (%)`}>
            <input
              type="number"
              name={key}
              min="0"
              max="100"
              step="0.01"
              defaultValue={targets[key]}
              required
            />
          </Field>
        ))}
      </div>
      <button className="btn secondary" disabled={busy}>
        Simpan target
      </button>
    </form>
  );
}
function ReportView({ data: d, revision, dividend }: any) {
  function exportCsv() {
    const rows = [
      ["Laporan", d.organizationName],
      ["Periode", d.month],
      ["Cakupan", d.outletId ? "Outlet" : "Gabungan bisnis"],
      ["Status", revision ? `Terbit revisi ${revision}` : "Draft"],
      ["Komponen", "Nominal"],
      ["Total pendapatan", d.totals.revenue],
      ["Pengeluaran harian", d.totals.daily],
      ["Pengeluaran bulanan", d.totals.monthly],
      ["Pengeluaran tidak tetap", d.totals.irregular],
      ["Total pengeluaran", d.totals.expense],
      ["Gross profit", d.totals.gross],
      ["Net profit", d.totals.net],
      ...d.channels.map((c: any) => [channels[c.channel] + " final", c.final]),
      ...d.metrics.map((m: any) => [
        m.label + " (%)",
        m.percent === null ? "Belum dapat dihitung" : m.percent,
      ]),
    ];
    if (dividend)
      rows.push(
        ["Infaq", dividend.infaq],
        [
          "Net profit setelah infaq",
          Number(dividend.net_basis) - Number(dividend.infaq),
        ],
        ["Total dividen", dividend.amount],
        [
          "Laba tidak dibagikan",
          Number(dividend.net_basis) -
            Number(dividend.infaq) -
            Number(dividend.amount),
        ],
        ...dividend.allocations.map((a: any) => [
          "Dividen " + a.name,
          a.amount,
        ]),
        ...dividend.payments.map((p: any) => [
          "Dibayar " + p.reference,
          p.amount,
        ]),
      );
    const csvCell = (value: any) => {
      let s = String(value);
      if (/^[=+@\t\r\n]/.test(s) || (/^-/.test(s) && !/^[-\d.]+$/.test(s)))
        s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv =
      "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `omzetin-${d.month}-${d.outletId || "semua-outlet"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="core-report" aria-label="Ringkasan laporan bulanan">
      <div className="core-report-title">
        <div>
          <span className="section-kicker">
            {revision
              ? `LAPORAN TERBIT · REVISI ${revision}`
              : "DRAFT · BELUM DIPUBLIKASIKAN"}
          </span>
          <h2>{d.organizationName}</h2>
          <p>{d.outlets.map((o: any) => o.outlet_name).join(" · ")}</p>
        </div>
        <div>
          <strong>{d.month}</strong>
          <div className="core-actions no-print">
            <button className="btn secondary" onClick={exportCsv}>
              <Download size={16} />
              Ekspor CSV
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                window.print();
              }}
            >
              <Printer size={16} />
              Cetak / PDF
            </button>
          </div>
        </div>
      </div>
      <div className="core-money-grid">
        <div className="core-money income">
          <span>TOTAL PENDAPATAN FINAL</span>
          <strong>{rupiah(d.totals.revenue)}</strong>
          <small>Cash + final platform + transfer</small>
        </div>
        <div className="core-money expense">
          <span>TOTAL PENGELUARAN</span>
          <strong>{rupiah(d.totals.expense)}</strong>
          <small>Harian + bulanan + tidak tetap</small>
        </div>
      </div>
      <div className="core-card">
        <h3>Pendapatan per kanal</h3>
        <p>
          Kotor transaksi dan pencairan final memiliki tanggal berbeda.
          Persentase membandingkan final dengan kotor yang dicairkan.
        </p>
        <div className="core-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kanal</th>
                <th>Kotor transaksi</th>
                <th>Kotor dicairkan</th>
                <th>Potongan</th>
                <th>Refund</th>
                <th>Final diterima</th>
                <th>Pencairan / kotor</th>
              </tr>
            </thead>
            <tbody>
              {d.channels.map((c: any) => (
                <tr key={c.channel}>
                  <td>{channels[c.channel]}</td>
                  <td>{rupiah(c.grossSales)}</td>
                  <td>{rupiah(c.settledGross)}</td>
                  <td>{rupiah(c.fee)}</td>
                  <td>{rupiah(c.refund || 0)}</td>
                  <td>
                    <strong>{rupiah(c.final)}</strong>
                  </td>
                  <td>
                    <Percent value={c.finalPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {d.cashShifts?.length > 0 && (
        <div className="core-card">
          <h3>Cash per shift</h3>
          <div className="core-stats">
            {d.cashShifts.map((shift: any) => (
              <Stat key={shift.label} label={shift.label} value={shift.final} />
            ))}
          </div>
          <p>
            Refund setelah shift ditutup tercatat sebagai pengurang pendapatan
            pada tanggal refund.
          </p>
        </div>
      )}
      <div className="core-stats">
        <Stat label="Pengeluaran harian" value={d.totals.daily} />
        <Stat label="Pengeluaran bulanan" value={d.totals.monthly} />
        <Stat label="Pengeluaran tidak tetap" value={d.totals.irregular} />
      </div>
      <div className="core-metrics">
        {d.metrics.map((m: any) => (
          <article className={`core-ratio ${m.color}`} key={m.key}>
            <span>{m.label}</span>
            <strong>
              <Percent value={m.percent} />
            </strong>
            <small>{rupiah(m.amount)}</small>
            <small>
              {m.key === "gross"
                ? "Hijau ≥50% · kuning ≥40% · jingga ≥30% · merah <30%"
                : `Target ≤${m.target}%`}
            </small>
          </article>
        ))}
      </div>
      <div className="core-card core-profit">
        <div>
          <span>GROSS PROFIT</span>
          <strong>{rupiah(d.totals.gross)}</strong>
          <small>Pendapatan final − pengeluaran harian</small>
        </div>
        <div>
          <span>NET PROFIT</span>
          <strong>{rupiah(d.totals.net)}</strong>
          <small>Pendapatan final − seluruh pengeluaran</small>
        </div>
      </div>
      <div className="core-stats">
        <Stat
          label="Dana belum diterima sampai akhir periode"
          value={d.totals.outstanding}
        />
        <Stat
          label="Selisih kas (terpisah dari omzet)"
          value={d.totals.variance}
        />
      </div>
      <div className="core-card">
        <h3>Rincian kategori biaya</h3>
        {d.expenses.length ? (
          <div className="core-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kelompok</th>
                  <th>Kategori</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {d.expenses.map((e: any, i: number) => (
                  <tr key={i}>
                    <td>{groups[e.cost_group]}</td>
                    <td>{categories[e.category]}</td>
                    <td>{rupiah(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Belum ada pengeluaran disetujui.</p>
        )}
        <p className="core-footnote">
          Rasio biaya tidak tetap merupakan kelompok yang dapat berisi marketing
          dan operasional; tidak dijumlahkan ulang. Belanja harian menjadi dasar
          Gross Profit laporan ini.
        </p>
      </div>
      {d.pending > 0 && (
        <p className="error-note">
          {d.pending} dokumen belum disetujui dan belum masuk perhitungan draft.
        </p>
      )}
    </section>
  );
}

function DividendSection({
  report,
  dividend,
  members,
  manage,
  userId,
  busy,
  today,
  onDecide,
  onPay,
}: any) {
  const [parts, setParts] = useState<Record<string, string>>({}),
    [pay, setPay] = useState<any>(null),
    [group, setGroup] = useState("50"),
    [infaq, setInfaq] = useState("0"),
    [infaqPercent, setInfaqPercent] = useState("0");
  const people = members.filter(
    (m: any) => m.active && ["management", "investor"].includes(m.role),
  );
  return (
    <div className="core-card core-dividends">
      <h2>Pembagian dividen</h2>
      {!dividend ? (
        <>
          {manage && !report.outlet_id ? (
            <form
              className="core-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = formObject(e.currentTarget);
                void onDecide({
                  reportId: report.id,
                  amount: Number(f.amount),
                  infaq: Number(f.infaq),
                  managementPercent: Number(group),
                  investorPercent: 100 - Number(group),
                  members: people
                    .filter(
                      (m: any) =>
                        parts[m.user_id] !== undefined &&
                        parts[m.user_id] !== "",
                    )
                    .map((m: any) => ({
                      userId: m.user_id,
                      percent: Number(parts[m.user_id]),
                    })),
                  note: f.note,
                });
              }}
            >
              <p>
                Laba periode: {rupiah(report.snapshot.totals.net)}. Keputusan
                ditetapkan satu kali per bisnis dan bulan, berlaku pada arsip
                laporan.
              </p>
              <div className="core-form-grid">
                <Field
                  label="Infaq (%)"
                  hint="Dihitung dari laba positif; nominal dibulatkan ke bawah dalam rupiah."
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={infaqPercent}
                    onChange={(e) => {
                      setInfaqPercent(e.target.value);
                      const p = Number(e.target.value);
                      if (Number.isFinite(p) && p >= 0 && p <= 100)
                        setInfaq(
                          new Decimal(
                            Math.max(0, Number(report.snapshot.totals.net)),
                          )
                            .mul(p)
                            .div(100)
                            .floor()
                            .toFixed(0),
                        );
                    }}
                  />
                </Field>
                <Field label="Infaq (nominal)">
                  <input
                    name="infaq"
                    type="number"
                    min="0"
                    step="1"
                    value={infaq}
                    onChange={(e) => {
                      setInfaq(e.target.value);
                      setInfaqPercent("0");
                    }}
                    required
                  />
                </Field>
                <Field label="Total dividen dibagikan">
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="1"
                    max={Math.max(
                      0,
                      Number(report.snapshot.totals.net) - Number(infaq),
                    )}
                    required
                  />
                </Field>
                <Field label="Bagian management (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Bagian investor (%)">
                  <input value={100 - Number(group)} readOnly />
                </Field>
              </div>
              <h3>Bagian individu dalam kelompok</h3>
              <p>
                Isi penerima yang mendapat bagian; total setiap kelompok harus
                100%. Kosongkan anggota yang tidak ikut pembagian.
              </p>
              {people.map((m: any) => (
                <Field
                  key={m.user_id}
                  label={`${m.name} · ${m.role === "management" ? "Management" : "Investor"} (%)`}
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={parts[m.user_id] || ""}
                    onChange={(e) =>
                      setParts({ ...parts, [m.user_id]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Catatan keputusan">
                <textarea name="note" maxLength={1000} />
              </Field>
              <button className="btn primary" disabled={busy}>
                Tetapkan pembagian dividen
              </button>
            </form>
          ) : (
            <p>
              Belum ada keputusan pembagian dividen{" "}
              {report.outlet_id
                ? "untuk laporan gabungan bisnis"
                : "pada periode ini"}
              .
            </p>
          )}
        </>
      ) : (
        <>
          <div className="core-stats">
            <Stat label="Total dibagikan" value={dividend.amount} />
            <Stat label="Infaq" value={dividend.infaq} />
            <Stat
              label="Management / investor"
              value={`${Number(dividend.management_percent)}% / ${Number(dividend.investor_percent)}%`}
              money={false}
            />
          </div>
          <div className="core-stats">
            <Stat
              label="Net profit setelah infaq (dasar keputusan)"
              value={Number(dividend.net_basis) - Number(dividend.infaq)}
            />
            <Stat
              label="Laba tidak dibagikan"
              value={
                Number(dividend.net_basis) -
                Number(dividend.infaq) -
                Number(dividend.amount)
              }
            />
          </div>
          {dividend.note && <p>{dividend.note}</p>}
          <div className="core-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Penerima</th>
                  <th>Kelompok</th>
                  <th>Bagian kelompok</th>
                  <th>Dividen</th>
                  <th>Dibayar</th>
                  <th>Status</th>
                  {manage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {dividend.allocations.map((a: any) => {
                  const paid = dividend.payments
                    .filter((p: any) => p.user_id === a.userId)
                    .reduce((s: number, p: any) => s + Number(p.amount), 0);
                  return (
                    <tr key={a.userId}>
                      <td>{a.name}</td>
                      <td>
                        {a.role === "management" ? "Management" : "Investor"}
                      </td>
                      <td>{a.percent}%</td>
                      <td>{rupiah(a.amount)}</td>
                      <td>{rupiah(paid)}</td>
                      <td>
                        {paid >= a.amount
                          ? "Lunas"
                          : paid > 0
                            ? "Sebagian dibayar"
                            : "Belum dibayar"}
                      </td>
                      {manage && (
                        <td>
                          <button
                            className="text-button"
                            disabled={busy || paid >= a.amount}
                            onClick={() =>
                              setPay({ ...a, remaining: a.amount - paid })
                            }
                          >
                            Catat pembayaran
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pay && (
            <form
              className="core-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = formObject(e.currentTarget);
                if (
                  await onPay({
                    ...f,
                    planId: dividend.id,
                    userId: pay.userId,
                    amount: Number(f.amount),
                  })
                )
                  setPay(null);
              }}
            >
              <h3>Realisasi untuk {pay.name}</h3>
              <div className="core-form-grid">
                <Field label="Nominal pembayaran dividen">
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    max={pay.remaining}
                    step="1"
                    defaultValue={pay.remaining}
                    required
                  />
                </Field>
                <Field label="Tanggal pembayaran dividen">
                  <input
                    name="paidDate"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                </Field>
                <Field label="Sumber dana dividen (outlet aktif)">
                  <select name="account" defaultValue="bank">
                    <option value="bank">Bank</option>
                    <option value="safe">Kas brankas</option>
                  </select>
                </Field>
                <Field label="Referensi pembayaran dividen">
                  <input name="reference" maxLength={150} required />
                </Field>
                <Field label="Bukti pembayaran dividen">
                  <input name="proof" maxLength={1000} />
                </Field>
              </div>
              <div className="core-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPay(null)}
                >
                  Batal
                </button>
                <button className="btn primary" disabled={busy}>
                  Simpan pembayaran dividen
                </button>
              </div>
            </form>
          )}
          {dividend.payments.length > 0 && (
            <>
              <h3>Riwayat realisasi</h3>
              <div className="core-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Penerima</th>
                      <th>Nominal</th>
                      <th>Referensi</th>
                      <th>Bukti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividend.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{String(p.paid_date).slice(0, 10)}</td>
                        <td>
                          {
                            dividend.allocations.find(
                              (a: any) => a.userId === p.user_id,
                            )?.name
                          }
                        </td>
                        <td>{rupiah(p.amount)}</td>
                        <td>{p.reference}</td>
                        <td>{p.proof || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
