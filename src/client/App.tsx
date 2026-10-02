import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  ReceiptText,
  Package,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Minus,
  Search,
  X,
  Check,
  CheckCheck,
  Clock3,
  Coffee,
  ChevronDown,
  Printer,
  Download,
  ShieldCheck,
  CircleHelp,
  Leaf,
  Banknote,
  CreditCard,
  CircleAlert,
  LoaderCircle,
  PanelTop,
  UtensilsCrossed,
  History,
  Menu as MenuIcon,
  SlidersHorizontal,
  LockKeyhole,
} from "lucide-react";
import {
  api,
  rupiah,
  number,
  time,
  shortDate,
  statuses,
  activeOutlet,
  selectOutlet,
} from "./api";
import Reports from "./Reports";

type State = Record<string, any>;
type Modal = { kind: string; data?: any };
type CartItem = { productId: string; quantity: number };
const nav = [
  { id: "overview", title: "Ringkasan", icon: LayoutDashboard },
  { id: "pos", title: "Kasir", icon: ShoppingBag },
  { id: "orders", title: "Pesanan", icon: ReceiptText },
  { id: "stock", title: "Persediaan", icon: Package },
  { id: "finance", title: "Keuangan", icon: Wallet },
  { id: "reports", title: "Laporan", icon: ChartNoAxesCombined },
  { id: "menu", title: "Menu & resep", icon: Coffee },
  { id: "settings", title: "Pengaturan", icon: Settings },
];
const accountNames: Record<string, string> = {
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
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M7 23V13l6 4 6-10 6 4v12"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="7" r="2" fill="currentColor" />
        </svg>
      </span>
      <span>
        omzetin<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Empty({
  icon: Icon = ReceiptText,
  title,
  description,
  action,
}: {
  icon?: typeof ReceiptText;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
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
function Pill({ status }: { status: string }) {
  return (
    <span className={`pill ${status}`}>
      <span />
      {statuses[status] || status}
    </span>
  );
}
function Cup({ product }: { product: any }) {
  const matcha = product.emoji === "🍵",
    chocolate = product.emoji === "🍫",
    pastry = product.emoji === "🥐";
  return (
    <div className={`product-art ${product.color}`}>
      {pastry ? (
        <svg viewBox="0 0 220 140" aria-hidden="true">
          <ellipse cx="110" cy="113" rx="66" ry="9" fill="#a57c4830" />
          <path
            d="M45 84Q36 107 56 107L77 83Q102 73 128 83L155 108Q175 107 172 86Q154 39 110 40Q69 40 45 84"
            fill="#d39752"
            stroke="#9f622c"
            strokeWidth="3"
          />
          <path
            d="M67 68Q77 95 79 99M91 46Q105 82 100 91M120 45Q113 82 118 92M146 67Q137 93 139 99"
            stroke="#f7ca86"
            strokeWidth="11"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 220 140" aria-hidden="true">
          <ellipse cx="109" cy="118" rx="49" ry="7" fill="#253e2920" />
          <path
            d="M149 61h11q23 0 20 22t-34 15"
            fill="none"
            stroke="#e6e5d9"
            strokeWidth="10"
          />
          <path
            d="M62 51h89l-7 54q-34 25-74 0z"
            fill={matcha ? "#cad5b1" : chocolate ? "#cfb49d" : "#f5f0e1"}
            stroke="#ffffff90"
            strokeWidth="2"
          />
          <ellipse
            cx="106.5"
            cy="52"
            rx="44.5"
            ry="12"
            fill={matcha ? "#738752" : chocolate ? "#6b4932" : "#795441"}
          />
          <ellipse
            cx="106"
            cy="52"
            rx="30"
            ry="8"
            fill={
              matcha
                ? "#a5b888"
                : chocolate
                  ? "#a2785b"
                  : product.color === "coffee"
                    ? "#55382b"
                    : "#dbc4a6"
            }
          />
          {product.color !== "coffee" && (
            <path
              d="M102 49q-14-12-9 1q2 7 13 8q20-13 9-13q-5-1-9 9q-4-3-4-5"
              fill="#f9f0d9"
            />
          )}
          <path
            d="M82 25q-7-9 0-18M105 26q-7-11 0-20M128 25q-7-9 0-18"
            fill="none"
            stroke="#fff9"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="art-label">OMZETIN</span>
    </div>
  );
}
function Chart({ data }: { data: any[] }) {
  if (!data.some((d) => Number(d.sales) !== 0))
    return (
      <div className="chart-empty">
        <div className="chart-grid" />
        <span>
          <ChartNoAxesCombined size={24} />
          Grafik akan terisi setelah pesanan diserahkan.
        </span>
      </div>
    );
  const max = Math.max(...data.map((d) => Math.abs(Number(d.sales))), 1);
  return (
    <div className="chart">
      <div className="chart-bars">
        {data.map((d) => (
          <div className="chart-bar-column" key={d.day}>
            <span className="bar-value">{rupiah(d.sales)}</span>
            <div
              className="bar"
              style={{
                height: `${Math.max(3, (Math.abs(Number(d.sales)) / max) * 130)}px`,
                background: Number(d.sales) < 0 ? "#b95137" : undefined,
              }}
            />
            <small>
              {d.day.slice(8)} / {d.day.slice(5, 7)}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [demo, setDemo] = useState(false);
  const loadSequence = useRef(0);
  async function load() {
    const sequence = ++loadSequence.current;
    try {
      const data = await api("/state");
      if (sequence === loadSequence.current) setState(data);
      return data;
    } catch (e) {
      if (sequence === loadSequence.current) {
        if ((e as any).status === 401) setState(null);
        else setError((e as Error).message);
      }
      return null;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    api("/setup")
      .then((s) => {
        setDemo(s.demo);
      })
      .catch(() => {});
    void load();
  }, []);
  if (loading)
    return (
      <div className="initial-loading">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Menyiapkan ruang kerja…</p>
      </div>
    );
  if (!state)
    return (
      <Login
        demo={demo}
        initialError={error}
        onLogin={async () => {
          setError("");
          await load();
        }}
      />
    );
  return (
    <Workspace
      key={`${state.user.id}:${state.business.id}:${state.user.role}`}
      state={state}
      refresh={load}
      onOutlet={async (id: string) => {
        const previous = activeOutlet();
        selectOutlet(id);
        const next = await load();
        if (!next) {
          selectOutlet(previous);
          throw new Error("Outlet gagal dimuat. Coba kembali.");
        }
      }}
      onLogout={async () => {
        await api("/logout", {});
        setState(null);
      }}
    />
  );
}
function Login({
  demo,
  initialError,
  onLogin,
}: {
  demo: boolean;
  initialError: string;
  onLogin: () => Promise<void>;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (setup) {
        if (f.get("password") !== f.get("confirmPassword"))
          throw new Error("Konfirmasi kata sandi belum cocok.");
        await api("/register", {
          name: f.get("business"),
          outlet: f.get("outlet"),
          owner: f.get("owner"),
          email: f.get("email"),
          password: f.get("password"),
          capital: Number(f.get("capital")),
        });
      } else {
        await api("/login", {
          email: f.get("email"),
          password: f.get("password"),
        });
      }
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">RUANG UNTUK USAHAMU BERTUMBUH</span>
          <h1>
            Dari pesanan pertama,
            <br />
            sampai angka
            <br />
            <em>yang berarti.</em>
          </h1>
          <p>
            Kasir, persediaan, dan keuangan.
            <br />
            Satu tempat untuk cerita usahamu.
          </p>
        </div>
        <footer>
          <Leaf size={18} />
          Dibuat untuk usaha makanan & minuman.
        </footer>
      </section>
      <section className="login-form-wrap">
        <form
          key={setup ? "register" : "login"}
          onSubmit={submit}
          className="login-form"
        >
          <span className="section-kicker">SELAMAT DATANG DI OMZETIN</span>
          <h2>{setup ? "Daftar & mulai usahamu" : "Masuk ke ruang kerja"}</h2>
          <p>
            {setup
              ? "Buat akun owner, bisnis, dan outlet pertamamu."
              : "Hari yang baik dimulai dari catatan yang rapi."}
          </p>
          {demo && (
            <div className="demo-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Ruang demo lokal</strong>
                <span>
                  Menu dan saldo pembukaan adalah contoh. Semua aktivitas di
                  sini merupakan simulasi.
                </span>
              </div>
            </div>
          )}
          {setup && (
            <>
              <Field label="Nama usaha">
                <input
                  name="business"
                  required
                  placeholder="Misalnya Kedai Rasa"
                />
              </Field>
              <Field label="Nama outlet">
                <input name="outlet" required placeholder="Outlet utama" />
              </Field>
              <Field label="Nama pemilik">
                <input name="owner" required />
              </Field>
              <Field label="Saldo awal kas brankas">
                <input
                  name="capital"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="0"
                  required
                />
              </Field>
            </>
          )}
          <Field label="Email">
            <input
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={demo && !setup ? "demo@omzetin.local" : ""}
              placeholder="nama@usahamu.com"
              required
            />
          </Field>
          <Field label="Kata sandi">
            <input
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={setup ? 12 : undefined}
              defaultValue={demo && !setup ? "OmzetinDemo123!" : ""}
              required
            />
          </Field>
          {setup && (
            <Field
              label="Konfirmasi kata sandi"
              hint="Gunakan minimal 12 karakter untuk kata sandi."
            >
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </Field>
          )}
          {error && (
            <div role="alert" className="error-note">
              <CircleAlert size={18} />
              {error}
            </div>
          )}
          <button className="btn primary wide" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {" "}
                {setup ? "Buat usaha & masuk" : "Masuk ke Omzetin"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          {
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSetup(!setup);
                setError("");
              }}
              disabled={busy}
            >
              {setup ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
            </button>
          }
          <div className="login-foot">
            <LockKeyhole size={14} />
            Sesi terlindungi. Data hanya untuk usahamu.
          </div>
        </form>
      </section>
    </div>
  );
}

function Workspace({
  state: s,
  refresh,
  onLogout,
  onOutlet,
}: {
  state: State;
  refresh: () => Promise<State | null>;
  onLogout: () => Promise<void>;
  onOutlet: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState("overview"),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Semua"),
    [orderFilter, setOrderFilter] = useState("all");
  const owner = s.user.role === "owner",
    draftKey = `omzetin:draft:${s.user.business_id}:${s.user.id}`;
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "[]");
      return Array.isArray(saved)
        ? saved.filter(
            (i) =>
              typeof i.productId === "string" &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0 &&
              i.quantity <= 100,
          )
        : [];
    } catch {
      return [];
    }
  });
  const [service, setService] = useState("takeaway"),
    [note, setNote] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(cart));
  }, [cart, draftKey]);
  useEffect(() => {
    if (!owner) setPage("pos");
  }, [owner]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const online = () => {
        setOffline(false);
        void refresh();
      },
      off = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
    };
  }, []);
  async function act(path: string, input: any, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(path, input);
      const next = await refresh();
      setToast(message);
      return { result, next };
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(kind: string, data?: any) {
    setError("");
    setModal({ kind, data });
  }
  function navigate(id: string) {
    setPage(id);
    setSearch("");
    setCategory("Semua");
    setError("");
  }
  function add(product: any, delta = 1) {
    setCart((previous) => {
      const old = previous.find((c) => c.productId === product.id);
      const q = (old?.quantity || 0) + delta;
      if (q > Math.min(100, product.available)) {
        setToast("Jumlah melebihi bahan yang tersedia.");
        return previous;
      }
      return q <= 0
        ? previous.filter((c) => c.productId !== product.id)
        : old
          ? previous.map((c) =>
              c.productId === product.id ? { ...c, quantity: q } : c,
            )
          : [...previous, { productId: product.id, quantity: q }];
    });
  }
  const cartLines = cart
    .map((c) => ({
      ...c,
      product: s.products.find((p: any) => p.id === c.productId),
    }))
    .filter((c) => c.product);
  const subtotal = cartLines.reduce(
      (sum, c) => sum + Number(c.product.price) * c.quantity,
      0,
    ),
    cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const bal = (account: string) =>
      Number(s.balances?.find((b: any) => b.account === account)?.balance || 0),
    dailyAccount = (account: string) =>
      Number(
        s.dailyAccounts?.find((b: any) => b.account === account)?.amount || 0,
      );
  const todaySales =
      -dailyAccount("sales") -
      dailyAccount("discount") -
      dailyAccount("returns"),
    todayCost = dailyAccount("cogs"),
    todayExpense = ["expense", "waste", "variance", "payment_fee"].reduce(
      (sum, a) => sum + dailyAccount(a),
      0,
    );
  const lowStock =
      s.ingredients?.filter(
        (i: any) => Number(i.available) <= Number(i.minimum),
      ) || [],
    queued = s.orders.filter((o: any) => o.status === "queued"),
    completed = s.orders.filter(
      (o: any) =>
        o.fulfilled_business_date === s.day &&
        ["fulfilled", "refunded"].includes(o.status),
    );
  const currentNav = nav.find((n) => n.id === page)!;
  const dayLabel = new Intl.DateTimeFormat("id-ID", {
    timeZone: s.business.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const categories = [
    "Semua",
    ...new Set<string>(
      s.products.filter((p: any) => p.active).map((p: any) => p.category),
    ),
  ];
  const visibleProducts = s.products.filter(
    (p: any) =>
      p.active &&
      (category === "Semua" || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleOrders = s.orders.filter(
    (o: any) =>
      (orderFilter === "all" || o.status === orderFilter) &&
      `#${o.number} ${o.items.map((i: any) => i.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totalSales = -(bal("sales") + bal("discount") + bal("returns")),
    totalCosts = bal("cogs"),
    totalExpense = ["expense", "waste", "variance", "payment_fee"].reduce(
      (sum, a) => sum + bal(a),
      0,
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Lewati navigasi
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Navigasi utama">
          {nav
            .filter((n) => owner || ["pos", "orders"].includes(n.id))
            .map((n) => (
              <button
                key={n.id}
                className={`nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                <span>{n.title}</span>
                {n.id === "orders" && queued.length > 0 && (
                  <b>{queued.length}</b>
                )}
                {page === n.id && <i />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Leaf size={18} />
            </span>
            <strong>
              Usaha tumbuh,
              <br />
              catatan tetap rapi.
            </strong>
            <p>
              Satu transaksi kecil.
              <br />
              Satu langkah lebih baik.
            </p>
          </div>
          <div className="profile">
            <div className="avatar">{s.user.name.slice(0, 1)}</div>
            <div>
              <strong>{s.user.name}</strong>
              <span>{owner ? "Pemilik usaha" : "Kasir"}</span>
            </div>
            <button aria-label="Keluar" onClick={() => void onLogout()}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>
            <strong>{currentNav.title}</strong>
          </span>
          <div className="topbar-right">
            <label className="outlet-picker">
              <span className="live-dot" />
              <select
                aria-label="Pilih usaha dan outlet"
                value={s.business.id}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  setError("");
                  try {
                    await onOutlet(e.target.value);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {s.outlets.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.organization_name} · {o.outlet_name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="small-avatar"
              aria-label="Keluar dari Omzetin"
              title="Keluar"
              onClick={() => void onLogout()}
            >
              {s.user.name[0]}
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <span className="section-kicker">
                {s.business.demo
                  ? "WORKSPACE DEMO · DATA SIMULASI"
                  : s.business.name.toUpperCase()}
              </span>
              <h1>
                {page === "overview"
                  ? "Setiap angka, punya cerita"
                  : currentNav.title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === "overview"
                  ? "Lihat bagaimana usahamu berjalan hari ini."
                  : page === "pos"
                    ? "Pesanan baru, pelayanan yang lebih mudah."
                    : page === "stock"
                      ? "Kenali bahanmu. Jaga ketersediaannya."
                      : page === "reports"
                        ? "Angka yang bisa ditelusuri, keputusan yang lebih pasti."
                        : page === "finance"
                          ? "Uang masuk dan keluar, tercatat dengan jelas."
                          : page === "menu"
                            ? "Rasa yang konsisten dimulai dari resep yang rapi."
                            : page === "settings"
                              ? "Atur ruang kerja sesuai kebutuhan usahamu."
                              : "Dari pembayaran sampai penyerahan."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "overview" && (
                <>
                  <span className="date-label">{dayLabel}</span>
                  <button
                    className="btn primary"
                    onClick={() => navigate("pos")}
                  >
                    <Plus size={17} />
                    Pesanan baru
                  </button>
                </>
              )}
              {page === "orders" && (
                <button className="btn primary" onClick={() => navigate("pos")}>
                  <Plus size={17} />
                  Pesanan baru
                </button>
              )}
              {page === "stock" && (
                <button className="btn primary" onClick={() => open("stock")}>
                  <Plus size={17} />
                  Catat stok
                </button>
              )}
              {page === "finance" && (
                <button className="btn primary" onClick={() => open("expense")}>
                  <Plus size={17} />
                  Catat biaya
                </button>
              )}
              {page === "menu" && (
                <button className="btn primary" onClick={() => open("product")}>
                  <Plus size={17} />
                  Tambah menu
                </button>
              )}
            </div>
          </div>
          {offline && (
            <div role="alert" className="offline-note">
              Koneksi terputus. Keranjang tersimpan di perangkat; pembayaran
              membutuhkan koneksi server.
            </div>
          )}
          {s.business.demo && (
            <div className="demo-strip">
              <span className="demo-badge">DEMO</span>Menu dan saldo pembukaan
              adalah contoh. Transaksi yang dibuat di sini merupakan simulasi.
            </div>
          )}
          {error && !modal && (
            <div role="alert" className="error-note">
              <CircleAlert size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="Tutup pesan">
                <X size={16} />
              </button>
            </div>
          )}

          {page === "overview" && (
            <>
              <section className="metrics">
                <article className="metric main-metric">
                  <div className="metric-label">
                    Penjualan neto hari ini
                    <ArrowUpRight size={19} />
                  </div>
                  <strong>{rupiah(todaySales)}</strong>
                  <span>{completed.length} pesanan diserahkan hari ini</span>
                  <div className="metric-decor">
                    <svg viewBox="0 0 160 70">
                      <path
                        d="M0 65L25 48 48 54 73 32 102 41 129 10 160 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                </article>
                <article className="metric">
                  <div className="metric-label">
                    Margin setelah bahan
                    <span className="metric-icon">
                      <ChartNoAxesCombined size={17} />
                    </span>
                  </div>
                  <strong>{rupiah(todaySales - todayCost)}</strong>
                  <span>HPP bahan {rupiah(todayCost)}</span>
                </article>
                <article className="metric">
                  <div className="metric-label">
                    Kas & bank
                    <span className="metric-icon">
                      <Wallet size={17} />
                    </span>
                  </div>
                  <strong>
                    {rupiah(bal("cash") + bal("safe") + bal("bank"))}
                  </strong>
                  <span>Belum cair {rupiah(bal("clearing"))}</span>
                </article>
                <article className="metric">
                  <div className="metric-label">
                    Biaya hari ini
                    <span className="metric-icon">
                      <ReceiptText size={17} />
                    </span>
                  </div>
                  <strong>{rupiah(todayExpense)}</strong>
                  <span>Operasional, waste & selisih</span>
                </article>
              </section>
              <div className="dashboard-grid">
                <section className="panel sales-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Perjalanan penjualan</h2>
                      <p>Penjualan neto berdasarkan tanggal pembukuan</p>
                    </div>
                    <span className="period-tag">
                      14 hari terakhir
                      <ChevronDown size={13} />
                    </span>
                  </div>
                  <Chart data={s.daily || []} />
                  <div className="chart-legend">
                    <span />
                    <span>Penjualan neto</span>
                    <span className="muted">
                      Diperbarui dari jurnal transaksi
                    </span>
                  </div>
                </section>
                <section className="panel shift-panel">
                  <span className="section-kicker">OPERASIONAL HARI INI</span>
                  <div
                    className={`shift-state ${s.currentShift ? "is-open" : ""}`}
                  >
                    <Clock3 size={21} />
                    {s.currentShift
                      ? "Shift sedang berjalan"
                      : "Siap memulai hari?"}
                  </div>
                  <p>
                    {s.currentShift
                      ? `Dibuka pukul ${time(s.currentShift.opened_at, s.business.timezone)} oleh ${s.currentShift.cashier}.`
                      : "Buka shift dan hitung modal kas sebelum menerima pesanan pertama."}
                  </p>
                  <div className="shift-facts">
                    <span>
                      Modal kas
                      <strong>{rupiah(s.currentShift?.opening || 0)}</strong>
                    </span>
                    <span>
                      Antrean pesanan<strong>{queued.length} pesanan</strong>
                    </span>
                  </div>
                  <button
                    className="btn primary wide"
                    onClick={() =>
                      open(s.currentShift ? "shift-close" : "shift-open")
                    }
                  >
                    {s.currentShift ? "Tutup shift" : "Buka shift"}
                    <ArrowRight size={17} />
                  </button>
                  <small>
                    <ShieldCheck size={14} />
                    Setiap pergerakan uang tercatat.
                  </small>
                </section>
                <section className="panel recent-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Pesanan terbaru</h2>
                      <p>Aktivitas terbaru di outletmu</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("orders")}
                    >
                      Lihat semua
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {s.orders.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Pesanan</th>
                            <th>Waktu</th>
                            <th>Pembayaran</th>
                            <th>Status</th>
                            <th className="align-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.orders.slice(0, 5).map((o: any) => (
                            <tr
                              key={o.id}
                              onClick={() => open("receipt", o)}
                              className="clickable"
                            >
                              <td>
                                <strong>
                                  #{String(o.number).padStart(4, "0")}
                                </strong>
                                <small>
                                  {o.items[0]?.name}
                                  {o.items.length > 1
                                    ? ` +${o.items.length - 1} lainnya`
                                    : ""}
                                </small>
                              </td>
                              <td>{time(o.created_at, s.business.timezone)}</td>
                              <td>
                                <span className="payment-type">
                                  {o.payment_method === "cash" ? (
                                    <Banknote size={15} />
                                  ) : (
                                    <CreditCard size={15} />
                                  )}{" "}
                                  {o.payment_method === "cash"
                                    ? "Tunai"
                                    : "Digital"}
                                </span>
                              </td>
                              <td>
                                <Pill status={o.status} />
                              </td>
                              <td className="align-right">
                                <strong>{rupiah(o.total)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="Belum ada pesanan"
                      description="Pesanan pertamamu akan muncul di sini."
                      action={
                        <button
                          className="btn secondary"
                          onClick={() => navigate("pos")}
                        >
                          Buka kasir
                          <ArrowRight size={16} />
                        </button>
                      }
                    />
                  )}
                </section>
                <section className="panel attention-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Perlu perhatian</h2>
                      <p>Hal kecil yang menjaga usaha tetap lancar</p>
                    </div>
                    <CircleHelp size={18} />
                  </div>
                  {lowStock.length ? (
                    lowStock.slice(0, 4).map((i: any) => (
                      <div className="attention-item" key={i.id}>
                        <span className="attention-icon">
                          <Package size={18} />
                        </span>
                        <div>
                          <strong>{i.name}</strong>
                          <small>
                            Tersedia {number(i.available)} {i.unit}
                          </small>
                        </div>
                        <button
                          aria-label={`Beli ${i.name}`}
                          onClick={() => open("stock", { ingredientId: i.id })}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="stock-healthy">
                      <span>
                        <CheckCheck size={25} />
                      </span>
                      <strong>Bahan masih tersedia</strong>
                      <p>Tidak ada bahan di bawah batas minimum.</p>
                    </div>
                  )}
                  <div className="attention-footer">
                    <span className="live-dot" />
                    Resep terisi di{" "}
                    {
                      s.products.filter((p: any) => p.recipe?.length).length
                    }{" "}
                    menu
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "pos" && (
            <>
              <div className="pos-toolbar">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    aria-label="Cari menu"
                    placeholder="Cari menu favorit pelanggan…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Hapus pencarian"
                      onClick={() => setSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <button
                  className={`btn ${s.currentShift ? "secondary" : "primary"}`}
                  onClick={() =>
                    open(s.currentShift ? "shift-close" : "shift-open")
                  }
                >
                  <Clock3 size={17} />
                  {s.currentShift ? "Shift aktif · tutup shift" : "Buka shift"}
                </button>
              </div>
              <div className="pos-layout">
                <section>
                  <div
                    className="category-tabs"
                    role="group"
                    aria-label="Kategori menu"
                  >
                    {categories.map((c) => (
                      <button
                        key={c}
                        className={category === c ? "selected" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                        {c === "Semua" && (
                          <span>
                            {s.products.filter((p: any) => p.active).length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="product-grid">
                    {visibleProducts.map((p: any) => (
                      <button
                        className="product-card"
                        key={p.id}
                        onClick={() => add(p)}
                        disabled={
                          p.available <= 0 ||
                          !s.currentShift ||
                          s.currentShift.user_id !== s.user.id
                        }
                      >
                        <Cup product={p} />
                        <div className="product-copy">
                          <span className="product-category">{p.category}</span>
                          <h3>{p.name}</h3>
                          <p>{p.description}</p>
                          <div>
                            <strong>{rupiah(p.price)}</strong>
                            <span className="product-add">
                              <Plus size={18} />
                            </span>
                          </div>
                          <small>
                            {p.available > 0
                              ? `${p.available} porsi tersedia`
                              : "Bahan belum tersedia"}
                          </small>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!visibleProducts.length && (
                    <Empty
                      icon={Search}
                      title="Menu tidak ditemukan"
                      description="Coba kata kunci atau kategori lainnya."
                    />
                  )}
                  {!s.currentShift && (
                    <div className="inline-note">
                      <Clock3 size={18} />
                      Buka shift untuk mulai menambahkan pesanan.
                    </div>
                  )}
                </section>
                <aside className="cart panel">
                  <div className="cart-heading">
                    <div>
                      <h2>Pesanan baru</h2>
                      <span>{cartCount} item dalam keranjang</span>
                    </div>
                    <ShoppingBag size={22} />
                  </div>
                  <div className="service-toggle">
                    <button
                      className={service === "takeaway" ? "selected" : ""}
                      onClick={() => setService("takeaway")}
                    >
                      <ShoppingBag size={15} />
                      Takeaway
                    </button>
                    <button
                      className={service === "dine_in" ? "selected" : ""}
                      onClick={() => setService("dine_in")}
                    >
                      <UtensilsCrossed size={15} />
                      Dine in
                    </button>
                  </div>
                  <div className="cart-items">
                    {cartLines.length ? (
                      cartLines.map((c) => (
                        <div className="cart-item" key={c.productId}>
                          <div
                            className={`cart-product-icon ${c.product.color}`}
                          >
                            {c.product.emoji}
                          </div>
                          <div className="cart-item-copy">
                            <strong>{c.product.name}</strong>
                            <span>{rupiah(c.product.price)}</span>
                            <div className="quantity">
                              <button
                                aria-label={`Kurangi ${c.product.name}`}
                                onClick={() => add(c.product, -1)}
                              >
                                <Minus size={13} />
                              </button>
                              <b>{c.quantity}</b>
                              <button
                                aria-label={`Tambah ${c.product.name}`}
                                onClick={() => add(c.product)}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                          <strong className="line-total">
                            {rupiah(Number(c.product.price) * c.quantity)}
                          </strong>
                        </div>
                      ))
                    ) : (
                      <Empty
                        icon={ShoppingBag}
                        title="Mulai dari satu menu"
                        description="Pilih menu untuk menambahkan pesanan pelanggan."
                      />
                    )}
                  </div>
                  <Field label="Catatan pesanan">
                    <input
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Misalnya: meja 3, tanpa es"
                    />
                  </Field>
                  <div className="cart-summary">
                    <span>
                      Subtotal<strong>{rupiah(subtotal)}</strong>
                    </span>
                    <small>
                      Diskon dapat diatur saat pembayaran oleh pemilik.
                    </small>
                    <div className="cart-total">
                      <span>Total</span>
                      <strong>{rupiah(subtotal)}</strong>
                    </div>
                    <button
                      className="btn primary wide"
                      disabled={!cartLines.length || !s.currentShift || busy}
                      onClick={() => open("payment")}
                    >
                      Lanjut pembayaran
                      <ArrowRight size={18} />
                    </button>
                    {cartLines.length > 0 && (
                      <button
                        className="text-button clear-cart"
                        onClick={() => setCart([])}
                      >
                        Kosongkan keranjang
                      </button>
                    )}
                    <p>
                      <ShieldCheck size={13} />
                      Pembayaran dikonfirmasi oleh server.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {page === "orders" && (
            <section className="panel">
              <div className="list-toolbar">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Cari pesanan"
                    placeholder="Cari nomor atau menu…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter status pesanan"
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                >
                  <option value="all">Semua status</option>
                  {Object.entries(statuses).map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </div>
              {visibleOrders.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Pesanan</th>
                        <th>Menu</th>
                        <th>Waktu</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((o: any) => (
                        <tr key={o.id}>
                          <td>
                            <strong>
                              #{String(o.number).padStart(4, "0")}
                            </strong>
                            <small>
                              {o.service === "takeaway"
                                ? "Takeaway"
                                : "Dine in"}
                            </small>
                          </td>
                          <td>
                            {o.items
                              .map((i: any) => `${i.quantity}× ${i.name}`)
                              .join(", ")}
                            {o.note && <small>{o.note}</small>}
                          </td>
                          <td>
                            {shortDate(o.created_at, s.business.timezone)}
                            <small>
                              {time(o.created_at, s.business.timezone)} ·{" "}
                              {o.cashier}
                            </small>
                          </td>
                          <td>
                            <strong>{rupiah(o.total)}</strong>
                            <small>
                              {o.payment_method === "cash"
                                ? "Tunai"
                                : "Digital"}
                            </small>
                          </td>
                          <td>
                            <Pill status={o.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              {o.status === "queued" && (
                                <button
                                  className="btn compact primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      `/orders/${o.id}/fulfill`,
                                      {},
                                      "Pesanan diserahkan. Penjualan dan bahan sudah dicatat.",
                                    )
                                  }
                                >
                                  <Check size={14} />
                                  Serahkan
                                </button>
                              )}
                              <button
                                className="icon-button"
                                aria-label={`Lihat struk ${o.number}`}
                                onClick={() => open("receipt", o)}
                              >
                                <ReceiptText size={17} />
                              </button>
                              {owner &&
                                ["queued", "fulfilled"].includes(o.status) && (
                                  <button
                                    className="text-button danger"
                                    onClick={() => open("refund", o)}
                                  >
                                    Refund
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Tidak ada pesanan"
                  description="Pesanan yang sesuai pencarian akan muncul di sini."
                />
              )}
              <div className="panel-foot">
                Menampilkan hingga 200 pesanan terbaru. Pembayaran digital
                diverifikasi secara manual.
              </div>
            </section>
          )}

          {page === "stock" && (
            <>
              <div className="summary-strip">
                <span>
                  <Package size={20} />
                  <div>
                    <small>Nilai persediaan</small>
                    <strong>{rupiah(bal("inventory"))}</strong>
                  </div>
                </span>
                <span>
                  <Leaf size={20} />
                  <div>
                    <small>Bahan tercatat</small>
                    <strong>{s.ingredients.length} bahan</strong>
                  </div>
                </span>
                <span>
                  <CircleAlert size={20} />
                  <div>
                    <small>Di bawah minimum</small>
                    <strong>{lowStock.length} bahan</strong>
                  </div>
                </span>
                <button
                  className="btn secondary"
                  onClick={() => open("ingredient")}
                >
                  <Plus size={16} />
                  Tambah bahan
                </button>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Persediaan bahan</h2>
                    <p>Saldo fisik, cadangan pesanan, dan biaya rata-rata</p>
                  </div>
                </div>
                {s.ingredients.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Bahan</th>
                          <th>Stok</th>
                          <th>Dicadangkan</th>
                          <th>Tersedia</th>
                          <th>Biaya / satuan</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {s.ingredients.map((i: any) => (
                          <tr key={i.id}>
                            <td>
                              <strong>{i.name}</strong>
                              <small>
                                Minimum {number(i.minimum)} {i.unit}
                              </small>
                            </td>
                            <td>
                              {number(i.quantity)} {i.unit}
                            </td>
                            <td>
                              {number(i.reserved)} {i.unit}
                            </td>
                            <td>
                              <strong>
                                {number(i.available)} {i.unit}
                              </strong>
                            </td>
                            <td>{rupiah(i.unit_cost)}</td>
                            <td>
                              <span
                                className={`stock-badge ${Number(i.available) <= Number(i.minimum) ? "low" : ""}`}
                              >
                                {Number(i.available) <= Number(i.minimum)
                                  ? "Perlu dibeli"
                                  : "Cukup"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Catat stok ${i.name}`}
                                onClick={() =>
                                  open("stock", { ingredientId: i.id })
                                }
                              >
                                <Plus size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={Package}
                    title="Tambahkan bahan pertamamu"
                    description="Setelah bahan dibuat, catat pembelian untuk menentukan kuantitas dan nilainya."
                  />
                )}
              </section>
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>Jejak pergerakan bahan</h2>
                    <p>100 aktivitas terbaru, setiap perubahan punya alasan</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Bahan</th>
                        <th>Aktivitas</th>
                        <th>Kuantitas</th>
                        <th>Nilai</th>
                        <th>Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.movements.map((m: any) => (
                        <tr key={m.id}>
                          <td>
                            {m.name}
                            <small>
                              {shortDate(m.created_at, s.business.timezone)}
                            </small>
                          </td>
                          <td>
                            {
                              {
                                opening: "Pembukaan",
                                purchase: "Pembelian",
                                consumption: "Pemakaian",
                                waste: "Waste",
                                stocktake: "Stok opname",
                              }[m.kind as string]
                            }
                          </td>
                          <td
                            className={
                              Number(m.quantity) < 0 ? "negative" : "positive"
                            }
                          >
                            {Number(m.quantity) > 0 ? "+" : ""}
                            {number(m.quantity)} {m.unit}
                          </td>
                          <td>{rupiah(m.value)}</td>
                          <td>{m.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {page === "finance" && (
            <>
              <section className="metrics money-metrics">
                {["cash", "safe", "bank", "clearing"].map((a, i) => (
                  <article
                    key={a}
                    className={`metric ${i === 0 ? "main-metric" : ""}`}
                  >
                    <div className="metric-label">
                      {accountNames[a]}
                      {a === "clearing" ? (
                        <CreditCard size={19} />
                      ) : (
                        <Wallet size={19} />
                      )}
                    </div>
                    <strong>{rupiah(bal(a))}</strong>
                    <span>
                      {a === "clearing"
                        ? "Dikonfirmasi, belum masuk bank"
                        : "Saldo dari seluruh jurnal"}
                    </span>
                  </article>
                ))}
              </section>
              <div className="finance-actions">
                <button className="btn secondary" onClick={() => open("cash")}>
                  <Plus size={17} />
                  Modal / transfer uang
                </button>
                <button
                  className="btn secondary"
                  onClick={() => open("settlement")}
                >
                  <CreditCard size={17} />
                  Catat pencairan digital
                </button>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Biaya operasional</h2>
                    <p>Biaya terbayar, dengan sumber uang yang jelas</p>
                  </div>
                </div>
                {s.expenses.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Deskripsi</th>
                          <th>Kategori</th>
                          <th>Akun</th>
                          <th className="align-right">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.expenses.map((e: any) => (
                          <tr key={e.id}>
                            <td>{e.business_date}</td>
                            <td>
                              <strong>{e.description}</strong>
                            </td>
                            <td>{e.category}</td>
                            <td>{accountNames[e.account]}</td>
                            <td className="align-right">{rupiah(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={Wallet}
                    title="Belum ada biaya tercatat"
                    description="Catat listrik, sewa, transportasi, dan pengeluaran lainnya agar hasil usaha lebih lengkap."
                  />
                )}
              </section>
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>Pencairan pembayaran digital</h2>
                    <p>Nilai bruto = dana masuk bank + potongan penyedia</p>
                  </div>
                </div>
                {s.settlements.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Referensi</th>
                          <th>Bruto</th>
                          <th>Potongan</th>
                          <th>Neto ke bank</th>
                          <th>Waktu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.settlements.map((r: any) => (
                          <tr key={r.id}>
                            <td>{r.reference}</td>
                            <td>{rupiah(r.gross)}</td>
                            <td>{rupiah(r.fee)}</td>
                            <td>
                              <strong>
                                {rupiah(Number(r.gross) - Number(r.fee))}
                              </strong>
                            </td>
                            <td>
                              {shortDate(r.created_at, s.business.timezone)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={CreditCard}
                    title="Belum ada pencairan"
                    description="Setelah dana digital diterima di bank, catat nominal dan biaya penyedianya."
                  />
                )}
              </section>
            </>
          )}

          {page === "reports" && (
            <Reports
              day={s.day}
              outletName={s.business.outlet_name}
              timezone={s.business.timezone}
              onOrder={async (id) => {
                try {
                  open("receipt", await api("/orders/" + id));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}

          {page === "menu" && (
            <>
              <div className="panel menu-guide">
                <Leaf size={22} />
                <div>
                  <strong>Menu dan resep saling terhubung.</strong>
                  <p>
                    Harga dan resep disalin ke setiap pesanan. Perubahan menu
                    tidak mengubah transaksi yang sudah dibayar.
                  </p>
                </div>
              </div>
              <div className="menu-grid">
                {s.products.map((p: any) => (
                  <article
                    className={`panel menu-card ${!p.active ? "archived" : ""}`}
                    key={p.id}
                  >
                    <div className="menu-card-heading">
                      <span className={`menu-emoji ${p.color}`}>{p.emoji}</span>
                      <div>
                        <span className="section-kicker">
                          {p.category}
                          {!p.active ? " · DIARSIPKAN" : ""}
                        </span>
                        <h2>{p.name}</h2>
                        <strong>{rupiah(p.price)}</strong>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => open("product", p)}
                      >
                        <SlidersHorizontal size={18} />
                      </button>
                    </div>
                    <p>{p.description}</p>
                    <div className="recipe-list">
                      {p.recipe.map((r: any) => {
                        const ingredient = s.ingredients.find(
                          (i: any) => i.id === r.ingredientId,
                        );
                        return (
                          <div key={r.ingredientId}>
                            <span>
                              {ingredient?.name || "Bahan tidak tersedia"}
                            </span>
                            <strong>
                              {number(r.quantity)} {ingredient?.unit}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                    <div className="menu-card-footer">
                      <span>Estimasi HPP bahan</span>
                      <strong>
                        {rupiah(
                          p.recipe.reduce(
                            (sum: number, r: any) =>
                              sum +
                              Number(
                                s.ingredients.find(
                                  (i: any) => i.id === r.ingredientId,
                                )?.unit_cost || 0,
                              ) *
                                Number(r.quantity),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {page === "settings" && (
            <>
              <section className="panel outlet-management">
                <div className="panel-heading">
                  <div>
                    <h2>Outlet dalam usaha</h2>
                    <p>
                      Saldo, bahan, shift, dan transaksi dikelola per outlet.
                    </p>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() => open("outlet")}
                  >
                    <Plus size={15} />
                    Tambah outlet
                  </button>
                </div>
                <div className="outlet-list">
                  {s.outlets
                    .filter(
                      (o: any) =>
                        o.organization_id === s.business.organization_id,
                    )
                    .map((o: any) => (
                      <button
                        key={o.id}
                        className={
                          o.id === s.business.id
                            ? "outlet-row selected"
                            : "outlet-row"
                        }
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onOutlet(o.id);
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <span className="outlet-icon">
                          <PanelTop size={20} />
                        </span>
                        <span>
                          <strong>{o.outlet_name}</strong>
                          <small>{o.timezone}</small>
                        </span>
                        <span className="stock-badge">
                          {o.id === s.business.id
                            ? "Outlet aktif"
                            : "Buka outlet"}
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                </div>
                <div className="panel-foot">
                  <span>Satu akun dapat mengelola beberapa usaha.</span>
                  <button
                    className="text-button"
                    onClick={() => open("organization")}
                  >
                    Tambah usaha
                    <Plus size={14} />
                  </button>
                </div>
              </section>
              <div className="settings-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Identitas usaha</h2>
                      <p>Informasi workspace dan tanggal usaha</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => open("business")}
                    >
                      Ubah
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="settings-facts">
                    <span>
                      Nama usaha<strong>{s.business.name}</strong>
                    </span>
                    <span>
                      Outlet<strong>{s.business.outlet_name}</strong>
                    </span>
                    <span>
                      Zona waktu<strong>{s.business.timezone}</strong>
                    </span>
                    <span>
                      Tanggal usaha<strong>{s.day}</strong>
                    </span>
                    <span>
                      Periode terkunci sampai
                      <strong>
                        {s.business.closed_through?.slice(0, 10) ||
                          "Belum dikunci"}
                      </strong>
                    </span>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() => open("period")}
                  >
                    <LockKeyhole size={16} />
                    Kelola kunci periode
                  </button>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Tim usaha</h2>
                      <p>Akses sesuai tanggung jawab</p>
                    </div>
                    <button
                      className="btn secondary compact"
                      onClick={() => open("user")}
                    >
                      <Plus size={15} />
                      Pengguna
                    </button>
                  </div>
                  {s.users.map((u: any) => (
                    <div className="team-member" key={u.id}>
                      <span className="avatar">{u.name[0]}</span>
                      <div>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                        <small>
                          {u.role === "owner"
                            ? "Seluruh outlet usaha ini"
                            : u.assigned_outlets
                                .map((o: any) => o.name)
                                .join(", ")}
                        </small>
                      </div>
                      <span className="stock-badge">
                        {u.role === "owner" ? "Pemilik" : "Kasir"}
                      </span>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>Riwayat shift</h2>
                    <p>Modal, hasil hitung, dan selisih yang ditinjau</p>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      open(s.currentShift ? "shift-close" : "shift-open")
                    }
                  >
                    <Clock3 size={16} />
                    {s.currentShift ? "Tutup shift" : "Buka shift"}
                  </button>
                </div>
                {s.shifts.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Kasir</th>
                          <th>Dibuka</th>
                          <th>Modal</th>
                          <th>Hitung fisik</th>
                          <th>Selisih</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.shifts.map((r: any) => (
                          <tr key={r.id}>
                            <td>{r.cashier}</td>
                            <td>
                              {shortDate(r.opened_at, s.business.timezone)}
                              <small>
                                {time(r.opened_at, s.business.timezone)}
                              </small>
                            </td>
                            <td>{rupiah(r.opening)}</td>
                            <td>
                              {r.counted === null ? "—" : rupiah(r.counted)}
                            </td>
                            <td>
                              {r.difference === null
                                ? "—"
                                : rupiah(r.difference)}
                            </td>
                            <td>
                              <span className="stock-badge">
                                {r.closed_at ? "Ditutup" : "Aktif"}
                              </span>
                              {r.note && <small>{r.note}</small>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={Clock3}
                    title="Belum ada shift"
                    description="Buka shift dari layar kasir atau ringkasan."
                  />
                )}
              </section>
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>Jejak audit</h2>
                    <p>40 tindakan terakhir pada usaha ini</p>
                  </div>
                  <History size={19} />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tindakan</th>
                        <th>Pengguna</th>
                        <th>Waktu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.auditLogs.map((a: any) => (
                        <tr key={a.id}>
                          <td>{a.action}</td>
                          <td>{a.name}</td>
                          <td>
                            {shortDate(a.created_at, s.business.timezone)} ·{" "}
                            {time(a.created_at, s.business.timezone)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <footer className="app-footer">
            <span>
              omzetin<span>.</span>{" "}
              <small>Ruang untuk usahamu bertumbuh.</small>
            </span>
            <span>
              <span className="live-dot" />
              Tanggal usaha · {s.day}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={19} />
          {toast}
          <button aria-label="Tutup notifikasi" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <ModalDialog
          modal={modal}
          state={s}
          error={error}
          busy={busy}
          subtotal={subtotal}
          cart={cartLines}
          service={service}
          note={note}
          close={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
          act={act}
          paid={(order: any) => {
            setCart([]);
            setNote("");
            setModal({ kind: "receipt", data: order });
          }}
        />
      )}
    </div>
  );
}

function MoneyInput({
  name,
  initial = 0,
  min = 0,
}: {
  name: string;
  initial?: number;
  min?: number;
}) {
  return (
    <div className="money-input">
      <span>Rp</span>
      <input
        name={name}
        type="number"
        min={min}
        step="1"
        max="100000000000"
        defaultValue={initial}
        required
      />
    </div>
  );
}
function AccountSelect({
  name = "account",
  showCash,
}: {
  name?: string;
  showCash: boolean;
}) {
  return (
    <select name={name} defaultValue="safe">
      <option value="safe">Kas brankas</option>
      <option value="bank">Bank</option>
      {showCash && <option value="cash">Kas laci shift</option>}
    </select>
  );
}
function ModalDialog({
  modal,
  state: s,
  error,
  busy,
  subtotal,
  cart,
  service,
  note,
  close,
  act,
  paid,
}: {
  modal: Modal;
  state: State;
  error: string;
  busy: boolean;
  subtotal: number;
  cart: any[];
  service: string;
  note: string;
  close: () => void;
  act: (path: string, input: any, message: string) => Promise<any>;
  paid: (order: any) => void;
}) {
  const box = useRef<HTMLDivElement>(null),
    [payment, setPayment] = useState("cash"),
    [discount, setDiscount] = useState(0),
    [recipe, setRecipe] = useState<any[]>(modal.data?.recipe || []),
    [stockKind, setStockKind] = useState("purchase"),
    [cashKind, setCashKind] = useState("capital");
  const latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") latestClose.current();
      if (e.key === "Tab") {
        const els = Array.from(
          box.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length);
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
  const titles: Record<string, string> = {
    "shift-open": "Buka shift baru",
    "shift-close": "Tutup shift",
    expense: "Catat biaya operasional",
    stock: "Catat pergerakan bahan",
    ingredient: "Tambah bahan baru",
    product: modal.data ? "Ubah menu & resep" : "Tambah menu & resep",
    refund: "Refund pembayaran",
    settlement: "Catat pencairan digital",
    cash: "Modal & transfer uang",
    user: "Tambah atau beri akses pengguna",
    outlet: "Tambah outlet",
    organization: "Tambah usaha",
    business: "Identitas usaha",
    period: "Kelola kunci periode",
    payment: "Selesaikan pembayaran",
    receipt: "Detail pesanan",
  };
  const f = (data: FormData, name: string) => String(data.get(name) || ""),
    n = (data: FormData, name: string) => Number(data.get(name) || 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    let path = "",
      input: any = {},
      message = "Data berhasil disimpan.";
    switch (modal.kind) {
      case "shift-open":
        path = "/shifts/open";
        input = { opening: n(data, "opening") };
        message = "Shift dibuka. Kasir siap menerima pesanan.";
        break;
      case "shift-close":
        path = "/shifts/close";
        input = { counted: n(data, "counted"), note: f(data, "note") };
        message = "Shift ditutup dan kas dipindahkan ke brankas.";
        break;
      case "expense":
        path = "/expenses";
        input = {
          category: f(data, "category"),
          description: f(data, "description"),
          amount: n(data, "amount"),
          account: f(data, "account"),
        };
        break;
      case "stock":
        path = "/stock";
        input = {
          ingredientId: f(data, "ingredientId"),
          kind: stockKind,
          quantity: n(data, "quantity"),
          value: n(data, "value"),
          account: f(data, "account") || "safe",
          note: f(data, "note"),
        };
        break;
      case "ingredient":
        path = "/ingredients";
        input = {
          name: f(data, "name"),
          unit: f(data, "unit"),
          minimum: n(data, "minimum"),
        };
        break;
      case "product":
        path = "/products";
        input = {
          ...(modal.data ? { id: modal.data.id } : {}),
          name: f(data, "name"),
          category: f(data, "category"),
          price: n(data, "price"),
          description: f(data, "description"),
          emoji: f(data, "emoji"),
          color: f(data, "color"),
          recipe: recipe.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: Number(r.quantity),
          })),
          active: data.get("active") === "on",
        };
        break;
      case "refund":
        path = `/orders/${modal.data.id}/refund`;
        input = {
          reason: f(data, "reason"),
          prepared: data.get("prepared") === "on",
        };
        message = "Refund dicatat. Persediaan dan jurnal sudah diperbarui.";
        break;
      case "settlement":
        path = "/settlements";
        input = {
          gross: n(data, "gross"),
          fee: n(data, "fee"),
          reference: f(data, "reference"),
        };
        break;
      case "cash":
        path = "/cash";
        input = {
          kind: cashKind,
          amount: n(data, "amount"),
          from: f(data, "from") || "safe",
          to: f(data, "to"),
          note: f(data, "note"),
        };
        break;
      case "outlet":
        path = "/outlets";
        input = {
          name: f(data, "outlet"),
          timezone: f(data, "timezone"),
          capital: n(data, "capital"),
          copyMenu: data.get("copyMenu") === "on",
        };
        message =
          "Outlet dibuat. Stok awal kosong dan modal tercatat terpisah.";
        break;
      case "organization":
        path = "/organizations";
        input = {
          name: f(data, "business"),
          outlet: f(data, "outlet"),
          timezone: f(data, "timezone"),
          capital: n(data, "capital"),
        };
        message = "Usaha baru dibuat dengan outlet dan pembukuan terpisah.";
        break;
      case "user":
        path = "/users";
        input = {
          name: f(data, "name"),
          email: f(data, "email"),
          password: f(data, "password"),
          role: f(data, "role"),
          outletIds: data.getAll("outletIds").map(String),
        };
        break;
      case "business":
        path = "/business";
        input = {
          name: f(data, "name"),
          outlet: f(data, "outlet"),
          timezone: f(data, "timezone"),
        };
        break;
      case "period":
        path = "/period";
        input = {
          date: f(data, "mode") === "open" ? null : f(data, "date"),
          reason: f(data, "reason"),
        };
        break;
      case "payment":
        path = "/orders";
        input = {
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
          })),
          discount,
          paymentMethod: payment,
          tendered:
            payment === "digital" ? subtotal - discount : n(data, "tendered"),
          reference: f(data, "reference"),
          service,
          note,
        };
        message = "Pembayaran tersimpan. Pesanan masuk antrean persiapan.";
        break;
    }
    const result = await act(path, input, message);
    if (result) {
      if (modal.kind === "payment") {
        const order = result.next?.orders.find(
          (o: any) => o.id === result.result.id,
        );
        if (order) paid(order);
        else close();
      } else close();
    }
  }

  const order = modal.data;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${modal.kind === "receipt" ? "receipt-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={box}
      >
        <div className="modal-heading">
          <div>
            <span className="section-kicker">
              {s.business.demo
                ? "SIMULASI LOKAL"
                : s.business.name.toUpperCase()}
            </span>
            <h2 id="modal-title">{titles[modal.kind]}</h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Tutup dialog"
          >
            <X size={20} />
          </button>
        </div>
        {modal.kind === "receipt" ? (
          <>
            <div className="receipt">
              <Brand />
              <h3>
                {s.business.name}
                {s.business.demo ? " · DEMO" : ""}
              </h3>
              <p>{order.outlet_name || s.business.outlet_name}</p>
              <div className="receipt-meta">
                <span>#{String(order.number).padStart(4, "0")}</span>
                <span>
                  {shortDate(order.created_at, s.business.timezone)}{" "}
                  {time(order.created_at, s.business.timezone)}
                </span>
              </div>
              <Pill status={order.status} />
              <div className="receipt-items">
                {order.items.map((i: any, k: number) => (
                  <div key={k}>
                    <span>
                      {i.quantity}× {i.name}
                    </span>
                    <strong>{rupiah(Number(i.price) * i.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="receipt-row">
                <span>Subtotal</span>
                <strong>{rupiah(order.subtotal)}</strong>
              </div>
              <div className="receipt-row">
                <span>Diskon</span>
                <strong>{rupiah(order.discount)}</strong>
              </div>
              <div className="receipt-row receipt-total">
                <span>Total dibayar</span>
                <strong>{rupiah(order.total)}</strong>
              </div>
              <div className="receipt-row">
                <span>Metode</span>
                <strong>
                  {order.payment_method === "cash"
                    ? "Tunai"
                    : "Digital (manual)"}
                </strong>
              </div>
              {order.payment_method === "cash" && (
                <>
                  <div className="receipt-row">
                    <span>Uang diterima</span>
                    <strong>{rupiah(order.tendered)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Kembalian</span>
                    <strong>
                      {rupiah(Number(order.tendered) - Number(order.total))}
                    </strong>
                  </div>
                </>
              )}
              {order.reference && <p>Referensi: {order.reference}</p>}
              {order.note && <p>Catatan: {order.note}</p>}
              {order.reason && <p>Alasan refund: {order.reason}</p>}
              <p className="receipt-thanks">
                Terima kasih sudah menjadi bagian
                <br />
                dari cerita kami.
              </p>
              <small>omzetin · kasir & keuangan</small>
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={close}>
                Tutup
              </button>
              <button className="btn primary" onClick={() => window.print()}>
                <Printer size={17} />
                Cetak struk
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            {modal.kind === "shift-open" && (
              <>
                <div className="inline-note">
                  <Wallet size={19} />
                  Modal kas dipindahkan dari brankas ke laci.{" "}
                  {s.user.role === "owner"
                    ? `Saldo brankas: ${rupiah(s.balances?.find((b: any) => b.account === "safe")?.balance || 0)}.`
                    : "Ketersediaan modal diverifikasi saat shift dibuka."}
                </div>
                <Field label="Modal kas yang dihitung">
                  <MoneyInput name="opening" initial={100000} />
                </Field>
              </>
            )}
            {modal.kind === "shift-close" && (
              <>
                <div className="inline-note">
                  <ShieldCheck size={19} />
                  Hitung uang fisik terlebih dahulu. Selisih membutuhkan alasan
                  dan persetujuan pemilik.
                </div>
                <Field label="Jumlah uang fisik di laci">
                  <MoneyInput name="counted" />
                </Field>
                <Field label="Catatan pemeriksaan">
                  <textarea
                    name="note"
                    rows={3}
                    maxLength={500}
                    placeholder="Jelaskan jika ada selisih kas"
                  />
                </Field>
              </>
            )}
            {modal.kind === "payment" && (
              <>
                <div className="payment-total">
                  <span>Total tagihan</span>
                  <strong>{rupiah(subtotal - discount)}</strong>
                  <small>
                    {cart.reduce((sum, c) => sum + c.quantity, 0)} item ·{" "}
                    {service === "takeaway" ? "Takeaway" : "Dine in"}
                  </small>
                </div>
                <div className="payment-methods">
                  <button
                    type="button"
                    className={payment === "cash" ? "selected" : ""}
                    onClick={() => setPayment("cash")}
                  >
                    <Banknote size={22} />
                    <strong>Tunai</strong>
                  </button>
                  <button
                    type="button"
                    className={payment === "digital" ? "selected" : ""}
                    onClick={() => setPayment("digital")}
                  >
                    <CreditCard size={22} />
                    <strong>Digital</strong>
                  </button>
                </div>
                {s.user.role === "owner" && (
                  <Field label="Diskon pesanan (Rp)">
                    <input
                      aria-label="Diskon pesanan"
                      type="number"
                      min="0"
                      step="1"
                      max={Math.max(0, subtotal - 1)}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </Field>
                )}
                {payment === "cash" ? (
                  <Field label="Uang diterima">
                    <MoneyInput
                      name="tendered"
                      initial={subtotal}
                      min={subtotal - discount}
                    />
                  </Field>
                ) : (
                  <>
                    <Field label="Referensi pembayaran">
                      <input
                        name="reference"
                        placeholder="Nomor referensi penerimaan"
                        maxLength={150}
                        required
                      />
                    </Field>
                    <label className="checkbox-field">
                      <input type="checkbox" required />
                      <span>
                        Saya sudah memverifikasi dana pada kanal penerimaan.
                      </span>
                    </label>
                  </>
                )}
                <div className="inline-note">
                  <Clock3 size={17} />
                  Setelah dibayar, pesanan masuk antrean. Penjualan dan bahan
                  dicatat ketika pesanan diserahkan.
                </div>
              </>
            )}
            {modal.kind === "expense" && (
              <>
                <Field label="Kategori">
                  <select name="category">
                    <option>Listrik & air</option>
                    <option>Sewa</option>
                    <option>Transportasi</option>
                    <option>Gaji</option>
                    <option>Kebersihan</option>
                    <option>Lainnya</option>
                  </select>
                </Field>
                <Field label="Deskripsi biaya">
                  <input
                    name="description"
                    placeholder="Misalnya pembayaran listrik Oktober"
                    required
                    maxLength={150}
                  />
                </Field>
                <Field label="Jumlah terbayar">
                  <MoneyInput name="amount" min={1} />
                </Field>
                <Field label="Dibayar dari">
                  <AccountSelect showCash={!!s.currentShift} />
                </Field>
              </>
            )}
            {modal.kind === "stock" && (
              <>
                <Field label="Jenis aktivitas">
                  <select
                    value={stockKind}
                    onChange={(e) => setStockKind(e.target.value)}
                  >
                    <option value="purchase">Pembelian bahan</option>
                    <option value="waste">Bahan terbuang</option>
                    <option value="stocktake">Stok opname</option>
                  </select>
                </Field>
                <Field label="Bahan">
                  <select
                    name="ingredientId"
                    defaultValue={modal.data?.ingredientId}
                    required
                  >
                    {s.ingredients.map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={
                    stockKind === "stocktake"
                      ? "Jumlah fisik sekarang"
                      : "Kuantitas dalam satuan dasar"
                  }
                  hint="Masukkan gram, ml, atau pcs sesuai satuan bahan."
                >
                  <input
                    name="quantity"
                    type="number"
                    min={stockKind === "stocktake" ? 0 : 0.000001}
                    step="0.000001"
                    required
                  />
                </Field>
                {stockKind === "purchase" && (
                  <>
                    <Field label="Total nilai pembelian">
                      <MoneyInput name="value" min={1} />
                    </Field>
                    <Field label="Dibayar dari">
                      <AccountSelect showCash={!!s.currentShift} />
                    </Field>
                  </>
                )}
                <Field label="Catatan / alasan">
                  <input
                    name="note"
                    placeholder={
                      stockKind === "purchase"
                        ? "Supplier atau nomor nota"
                        : "Alasan perubahan stok"
                    }
                    required
                    maxLength={150}
                  />
                </Field>
                {stockKind !== "purchase" && (
                  <div className="inline-note">
                    Biaya bahan mengikuti nilai persediaan. Bahan yang
                    dicadangkan tidak dapat dikurangi.
                  </div>
                )}
              </>
            )}
            {modal.kind === "ingredient" && (
              <>
                <Field label="Nama bahan">
                  <input name="name" required maxLength={150} />
                </Field>
                <Field label="Satuan dasar">
                  <select name="unit">
                    <option value="g">Gram (g)</option>
                    <option value="ml">Mililiter (ml)</option>
                    <option value="pcs">Unit (pcs)</option>
                  </select>
                </Field>
                <Field label="Batas minimum">
                  <input
                    name="minimum"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    required
                  />
                </Field>
                <div className="inline-note">
                  Setelah bahan dibuat, catat pembelian untuk menambah stok dan
                  menetapkan biayanya.
                </div>
              </>
            )}
            {modal.kind === "product" && (
              <>
                <Field label="Nama menu">
                  <input
                    name="name"
                    defaultValue={order?.name}
                    required
                    maxLength={150}
                  />
                </Field>
                <div className="form-columns">
                  <Field label="Kategori">
                    <input
                      name="category"
                      defaultValue={order?.category || "Kopi"}
                      required
                      maxLength={150}
                    />
                  </Field>
                  <Field label="Harga jual">
                    <MoneyInput
                      name="price"
                      initial={Number(order?.price || 0)}
                      min={1}
                    />
                  </Field>
                </div>
                <Field label="Deskripsi">
                  <input
                    name="description"
                    defaultValue={order?.description}
                    maxLength={300}
                  />
                </Field>
                <div className="form-columns">
                  <Field label="Ikon">
                    <select name="emoji" defaultValue={order?.emoji || "☕"}>
                      <option>☕</option>
                      <option>🍵</option>
                      <option>🍫</option>
                      <option>🥐</option>
                      <option>🍽️</option>
                    </select>
                  </Field>
                  <Field label="Warna kartu">
                    <select name="color" defaultValue={order?.color || "sage"}>
                      {[
                        "sage",
                        "cream",
                        "sand",
                        "coffee",
                        "cocoa",
                        "peach",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="recipe-form">
                  <strong>Resep per porsi</strong>
                  <p>Isi kuantitas bahan yang dipakai untuk satu menu.</p>
                  {s.ingredients.map((i: any) => {
                    const r = recipe.find((r) => r.ingredientId === i.id);
                    return (
                      <label key={i.id} className="recipe-form-line">
                        <input
                          type="checkbox"
                          checked={!!r}
                          onChange={(e) =>
                            setRecipe(
                              e.target.checked
                                ? [
                                    ...recipe,
                                    { ingredientId: i.id, quantity: "1" },
                                  ]
                                : recipe.filter((r) => r.ingredientId !== i.id),
                            )
                          }
                        />
                        <span>{i.name}</span>
                        {r && (
                          <input
                            aria-label={`Kuantitas ${i.name}`}
                            type="number"
                            min="0.000001"
                            step="0.000001"
                            required
                            value={r.quantity}
                            onChange={(e) =>
                              setRecipe(
                                recipe.map((r) =>
                                  r.ingredientId === i.id
                                    ? { ...r, quantity: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        )}
                        <small>{i.unit}</small>
                      </label>
                    );
                  })}
                </div>
                <label className="checkbox-field">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={order?.active ?? true}
                  />
                  <span>Menu aktif dan tampil di kasir</span>
                </label>
              </>
            )}
            {modal.kind === "refund" && (
              <>
                <div className="payment-total">
                  <span>Refund penuh pesanan #{order.number}</span>
                  <strong>{rupiah(order.total)}</strong>
                </div>
                <div className="inline-note">
                  Uang dikembalikan melalui akun pembayaran asal. Jika saldo
                  clearing digital sudah dicairkan, refund digital perlu
                  diselesaikan sebelum dicatat melalui alur ini.
                </div>
                <Field label="Alasan refund">
                  <input
                    name="reason"
                    required
                    maxLength={150}
                    placeholder="Jelaskan alasan pengembalian uang"
                  />
                </Field>
                {order.status === "queued" && (
                  <label className="checkbox-field">
                    <input name="prepared" type="checkbox" />
                    <span>
                      Pesanan sudah dibuat. Catat bahan terpakai sebagai waste.
                    </span>
                  </label>
                )}
                {order.status === "fulfilled" && (
                  <p className="muted">
                    Bahan tidak dikembalikan ke stok karena pesanan telah
                    diserahkan.
                  </p>
                )}
                <label className="checkbox-field">
                  <input type="checkbox" required />
                  <span>
                    Saya telah mengonfirmasi pengembalian dana kepada pelanggan.
                  </span>
                </label>
              </>
            )}
            {modal.kind === "settlement" && (
              <>
                <Field label="Nilai bruto yang dicairkan">
                  <MoneyInput name="gross" min={1} />
                </Field>
                <Field label="Biaya penyedia pembayaran">
                  <MoneyInput name="fee" />
                </Field>
                <Field label="Referensi pencairan">
                  <input name="reference" required maxLength={150} />
                </Field>
                <div className="inline-note">
                  Nilai neto dicatat ke bank. Biaya dicatat terpisah dan saldo
                  clearing berkurang sebesar bruto.
                </div>
              </>
            )}
            {modal.kind === "cash" && (
              <>
                <Field label="Aktivitas">
                  <select
                    value={cashKind}
                    onChange={(e) => setCashKind(e.target.value)}
                  >
                    <option value="capital">Tambahan modal pemilik</option>
                    <option value="transfer">Transfer antar akun</option>
                  </select>
                </Field>
                {cashKind === "transfer" && (
                  <Field label="Akun asal">
                    <AccountSelect showCash={!!s.currentShift} name="from" />
                  </Field>
                )}
                <Field label="Akun tujuan">
                  <AccountSelect showCash={!!s.currentShift} name="to" />
                </Field>
                <Field label="Jumlah">
                  <MoneyInput name="amount" min={1} />
                </Field>
                <Field label="Catatan">
                  <input name="note" maxLength={150} required />
                </Field>
              </>
            )}
            {["outlet", "organization"].includes(modal.kind) && (
              <>
                {modal.kind === "organization" && (
                  <Field label="Nama usaha">
                    <input name="business" maxLength={150} required />
                  </Field>
                )}
                <Field label="Nama outlet">
                  <input name="outlet" maxLength={150} required />
                </Field>
                <Field label="Zona waktu outlet">
                  <select name="timezone" defaultValue={s.business.timezone}>
                    <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                    <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                    <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                  </select>
                </Field>
                <Field label="Modal pembukaan kas brankas">
                  <MoneyInput name="capital" />
                </Field>
                {modal.kind === "outlet" && (
                  <label className="checkbox-field">
                    <input name="copyMenu" type="checkbox" defaultChecked />
                    <span>
                      Salin menu, resep, dan daftar bahan dari outlet aktif.
                      Kuantitas dan nilai stok dimulai dari nol.
                    </span>
                  </label>
                )}
                <div className="inline-note">
                  Modal dicatat sebagai dana pembukaan baru. Saldo dan stok
                  outlet lain tetap berada di outlet asal.
                </div>
              </>
            )}
            {modal.kind === "user" && (
              <>
                <Field label="Nama pengguna">
                  <input name="name" required maxLength={150} />
                </Field>
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field
                  label="Kata sandi"
                  hint="Akun baru minimal 12 karakter. Jika email sudah terdaftar, kosongkan; kata sandi akun tersebut tidak diubah."
                >
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                  />
                </Field>
                <Field label="Peran">
                  <select name="role" aria-label="Peran">
                    <option value="cashier">Kasir</option>
                    <option value="owner">Pemilik</option>
                  </select>
                </Field>
                <fieldset className="assignment-list">
                  <legend>Akses outlet untuk kasir</legend>
                  <p>Owner otomatis mengakses seluruh outlet usaha ini.</p>
                  {s.outlets
                    .filter(
                      (o: any) =>
                        o.organization_id === s.business.organization_id,
                    )
                    .map((o: any) => (
                      <label key={o.id} className="checkbox-field">
                        <input
                          name="outletIds"
                          value={o.id}
                          type="checkbox"
                          defaultChecked={o.id === s.business.id}
                        />
                        <span>{o.outlet_name}</span>
                      </label>
                    ))}
                </fieldset>
              </>
            )}
            {modal.kind === "business" && (
              <>
                <Field label="Nama usaha">
                  <input
                    name="name"
                    defaultValue={s.business.name}
                    required
                    maxLength={150}
                  />
                </Field>
                <Field label="Nama outlet">
                  <input
                    name="outlet"
                    defaultValue={s.business.outlet_name}
                    required
                    maxLength={150}
                  />
                </Field>
                <Field label="Zona waktu">
                  <select name="timezone" defaultValue={s.business.timezone}>
                    <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                    <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                    <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                  </select>
                </Field>
              </>
            )}
            {modal.kind === "period" && (
              <>
                <Field label="Tindakan">
                  <select name="mode">
                    <option value="close">Kunci periode sampai tanggal</option>
                    {s.business.closed_through && (
                      <option value="open">Buka kembali periode</option>
                    )}
                  </select>
                </Field>
                <Field label="Tanggal batas">
                  <input
                    name="date"
                    type="date"
                    max={s.day}
                    defaultValue={s.day}
                    required
                  />
                </Field>
                <Field label="Alasan">
                  <input name="reason" maxLength={150} required />
                </Field>
                <div className="inline-note">
                  Shift harus ditutup sebelum mengunci periode. Pembukaan
                  kembali dan alasannya dicatat dalam jejak audit.
                </div>
              </>
            )}
            {error && (
              <div role="alert" className="error-note">
                <CircleAlert size={18} />
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={close}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (modal.kind === "product" && !recipe.length) ||
                  (modal.kind === "stock" && !s.ingredients.length)
                }
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Check size={17} />
                )}{" "}
                {modal.kind === "payment" ? "Konfirmasi pembayaran" : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
