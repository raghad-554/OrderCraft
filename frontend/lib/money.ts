const STORAGE_KEY = "ordercraft_org_currency";
const EVENT = "ordercraft:org-currency";

const ALLOWED = new Set([
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "JOD",
  "EGP",
  "KWD",
  "QAR",
  "BHD",
]);

function normalizeCurrency(code?: string | null) {
  const next = (code ?? "").trim().toUpperCase();
  return ALLOWED.has(next) ? next : "USD";
}

export function getOrgCurrency() {
  if (typeof window === "undefined") return "USD";
  return normalizeCurrency(
    sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY),
  );
}

export function setOrgCurrency(code: string) {
  if (typeof window === "undefined") return;
  const next = normalizeCurrency(code);
  const remember = localStorage.getItem("ordercraft_remember") === "1";
  const storage = remember ? localStorage : sessionStorage;
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  storage.setItem(STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function subscribeOrgCurrency(listener: (currency: string) => void) {
  if (typeof window === "undefined") return () => {};
  function onChange(event: Event) {
    const detail = (event as CustomEvent<string>).detail;
    listener(normalizeCurrency(detail || getOrgCurrency()));
  }
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function formatOrgMoney(
  value: number,
  currency?: string | null,
  maximumFractionDigits = 2,
) {
  const code = normalizeCurrency(currency || getOrgCurrency());
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits,
    }).format(Number.isFinite(value) ? value : 0);
  }
}
