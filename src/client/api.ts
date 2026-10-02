const pendingKeys = new Map<string, string>();
export function activeOutlet() {
  return sessionStorage.getItem("omzetin:outlet");
}
export function selectOutlet(outletId: string | null) {
  if (outletId) sessionStorage.setItem("omzetin:outlet", outletId);
  else sessionStorage.removeItem("omzetin:outlet");
}
export async function api(path: string, input?: unknown) {
  const outletId = activeOutlet(),
    signature = JSON.stringify({ outletId, path, input });
  const key = pendingKeys.get(signature) || crypto.randomUUID();
  if (input !== undefined) pendingKeys.set(signature, key);
  const response = await fetch(`/api${path}`, {
    method: input === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      ...(outletId ? { "X-Outlet-Id": outletId } : {}),
      ...(input === undefined
        ? {}
        : { "Content-Type": "application/json", "Idempotency-Key": key }),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const data = await response.json();
  if (response.status < 500) pendingKeys.delete(signature);
  if (!response.ok) {
    const error = new Error(data.error || "Permintaan gagal.") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  pendingKeys.delete(signature);
  if (path === "/login" || path === "/logout" || path === "/register")
    selectOutlet(null);
  return data;
}
export const rupiah = (value: string | number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
export const number = (value: string | number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
export const time = (value: string, timezone = "Asia/Makassar") =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const shortDate = (value: string, timezone = "Asia/Makassar") =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export const statuses: Record<string, string> = {
  queued: "Disiapkan",
  fulfilled: "Diserahkan",
  cancelled: "Dibatalkan",
  refunded: "Direfund",
};
