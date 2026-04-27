export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER || "dev-user";

function readBrowserValue(keys: string[]): string | null {
  if (typeof window === "undefined") return null;

  for (const key of keys) {
    const value = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    if (value) return value;
  }

  return null;
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const token = readBrowserValue([
    "dizin_token",
    "access_token",
    "auth_token",
    "token",
  ]);

  if (token && !headers.has("Authorization")) {
    headers.set(
      "Authorization",
      token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`,
    );
  }

  // Local backend dev mode bu header ile kullanıcıyı kabul ediyor.
  // Authorization olsa bile bunu da gönderiyoruz; backend dev_mode açıkken X-Dev-User öncelikli çalışır.
  if (!headers.has("X-Dev-User")) {
    const browserDevUser = readBrowserValue(["dizin_dev_user", "dev_user", "x_dev_user"]);
    headers.set("X-Dev-User", browserDevUser || DEV_USER);
  }

  return headers;
}

function shouldSetJsonContentType(body: BodyInit | null | undefined, headers: Headers): boolean {
  if (!body) return false;
  if (headers.has("Content-Type")) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
  return typeof body === "string";
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);

  if (shouldSetJsonContentType(init.body, headers)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await safeErrorText(res);
    throw new Error(detail || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return (await res.text()) as T;
  }

  return res.json() as Promise<T>;
}

export const apiFetchJson = apiFetch;

export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = authHeaders(init.headers);
  headers.delete("Content-Type");

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await safeErrorText(res);
    throw new Error(detail || `API error: ${res.status}`);
  }

  return res.blob();
}

export async function safeErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${res.status} ${res.statusText}`;

    try {
      const json = JSON.parse(text);
      if (typeof json.detail === "string") return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail.map((item) => item.msg || JSON.stringify(item)).join("; ");
      }
      if (typeof json.error === "string") return json.error;
      if (typeof json.message === "string") return json.message;
    } catch {
      // Response plain text olabilir.
    }

    return text;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

// Dosya indirme kullanan eski/yeni component'lerle uyumluluk için.
// pdf-report-download-button.tsx bu fonksiyonu import ediyor.
export async function downloadFile(path: string, init: RequestInit = {}): Promise<Blob> {
  return apiFetchBlob(path, init);
}
