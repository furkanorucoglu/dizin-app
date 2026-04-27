"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type PdfLang = "en" | "tr";

type HighlightRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type HighlightResponse = {
  page_w: number;
  page_h: number;
  highlights: HighlightRect[];
};

type PdfViewerProps = {
  projectId: string;

  /** Eski kullanım desteği */
  lang?: PdfLang;
  pageNum?: number;

  /** Review ekranı kullanımı */
  initialEnPage?: number | null;
  initialTrPage?: number | null;
  highlightTerm?: string;
  highlightTerms?: string[];

  className?: string;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER || "dev-user";
const DPI = 120;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 2.2;

type Size = { width: number; height: number };

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    update();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      setSize({ width: rect.width, height: rect.height });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function getAuthHeaders(): Headers {
  const headers = new Headers();
  headers.set("X-Dev-User", DEV_USER);

  if (typeof window !== "undefined") {
    const token =
      window.localStorage.getItem("dizin_token") ||
      window.localStorage.getItem("access_token") ||
      window.localStorage.getItem("auth_token") ||
      window.sessionStorage.getItem("dizin_token") ||
      window.sessionStorage.getItem("access_token") ||
      window.sessionStorage.getItem("auth_token");

    if (token) {
      headers.set(
        "Authorization",
        token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`,
      );
    }
  }

  return headers;
}

async function errorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${res.status} ${res.statusText}`;

    try {
      const json = JSON.parse(text);
      if (typeof json.detail === "string") return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail
          .map((item: any) => item?.msg || JSON.stringify(item))
          .join("; ");
      }
      if (typeof json.error === "string") return json.error;
    } catch {
      // JSON değilse düz metni kullan.
    }

    return text;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

function clampPage(value: number | undefined | null): number {
  const n = Number(value || 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function normalizeHighlightTerms(
  highlightTerm?: string,
  highlightTerms?: string[],
): string[] {
  const raw = [highlightTerm, ...(highlightTerms || [])]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean);

  const expanded: string[] = [];

  for (const item of raw) {
    expanded.push(item);

    if (item.includes(",")) {
      expanded.push(item.split(",", 1)[0].trim());
    }

    const words = item.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      expanded.push(words[0]);
      expanded.push(words[words.length - 1]);
    }
  }

  const seen = new Set<string>();
  return expanded
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase("tr-TR");
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

export function PdfViewer({
  projectId,
  lang,
  pageNum,
  initialEnPage,
  initialTrPage,
  highlightTerm,
  highlightTerms,
  className,
}: PdfViewerProps) {
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>();
  const [activeLang, setActiveLang] = useState<PdfLang>(lang || "tr");
  const [enPage, setEnPage] = useState(() => clampPage(initialEnPage ?? pageNum));
  const [trPage, setTrPage] = useState(() => clampPage(initialTrPage ?? pageNum));

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [highlightData, setHighlightData] = useState<HighlightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (lang) setActiveLang(lang);
  }, [lang]);

  useEffect(() => {
    if (initialEnPage || pageNum) setEnPage(clampPage(initialEnPage ?? pageNum));
  }, [initialEnPage, pageNum]);

  useEffect(() => {
    if (initialTrPage || pageNum) setTrPage(clampPage(initialTrPage ?? pageNum));
  }, [initialTrPage, pageNum]);

  const selectedPage = activeLang === "en" ? enPage : trPage;

  const searchTerms = useMemo(
    () => normalizeHighlightTerms(highlightTerm, highlightTerms),
    [highlightTerm, highlightTerms],
  );

  const pageUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dpi", String(DPI));
    return `${API_BASE_URL}/api/projects/${projectId}/pages/${activeLang}/${selectedPage}?${params.toString()}`;
  }, [projectId, activeLang, selectedPage]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    async function loadPage() {
      setLoading(true);
      setError(null);
      setImageSize(null);
      setHighlightData(null);

      try {
        const res = await fetch(pageUrl, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(await errorText(res));

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch (err) {
        if (controller.signal.aborted) return;
        setImageUrl(null);
        setError(err instanceof Error ? err.message : "PDF görüntülenemedi");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadPage();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pageUrl, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHighlights() {
      if (!searchTerms.length) {
        setHighlightData(null);
        return;
      }

      const combined: HighlightResponse = {
        page_w: 0,
        page_h: 0,
        highlights: [],
      };

      try {
        for (const term of searchTerms) {
          const params = new URLSearchParams();
          params.set("term", term);

          const res = await fetch(
            `${API_BASE_URL}/api/projects/${projectId}/pages/${activeLang}/${selectedPage}/highlight?${params.toString()}`,
            {
              headers: getAuthHeaders(),
              signal: controller.signal,
            },
          );

          if (!res.ok) continue;

          const data = (await res.json()) as HighlightResponse;
          if (!combined.page_w) combined.page_w = data.page_w;
          if (!combined.page_h) combined.page_h = data.page_h;
          combined.highlights.push(...(data.highlights || []));
        }

        if (!controller.signal.aborted) {
          setHighlightData(combined.highlights.length ? combined : null);
        }
      } catch {
        if (!controller.signal.aborted) setHighlightData(null);
      }
    }

    loadHighlights();

    return () => controller.abort();
  }, [projectId, activeLang, selectedPage, searchTerms]);

  function changePage(delta: number) {
    if (activeLang === "en") setEnPage((current) => Math.max(1, current + delta));
    else setTrPage((current) => Math.max(1, current + delta));
  }

  const bodyPadding = bodySize.width < 560 ? 10 : bodySize.width < 900 ? 12 : 16;
  const availableWidth = Math.max(240, bodySize.width - bodyPadding * 2);
  const availableHeight = Math.max(360, bodySize.height - bodyPadding * 2);

  // Okunabilirlik için default davranış: tüm sayfayı yüksekliğe sıkıştırma.
  // PDF genişliğe göre açılır, gerekirse dikey scroll oluşur. Böylece metin zoom out olmadan okunur.
  const fitScale = imageSize ? Math.min(1, availableWidth / imageSize.width) : 1;
  const displayScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitScale * zoom));

  const displayWidth = imageSize
    ? Math.max(220, Math.round(imageSize.width * displayScale))
    : Math.min(620, availableWidth);
  const displayHeight = imageSize
    ? Math.max(320, Math.round(imageSize.height * displayScale))
    : Math.round(Math.min(availableHeight, 820));

  const scaleX = highlightData?.page_w ? displayWidth / highlightData.page_w : 1;
  const scaleY = highlightData?.page_h ? displayHeight / highlightData.page_h : 1;

  return (
    <section
      className={[
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm",
        className || "",
      ].join(" ")}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">PDF İnceleme</div>
            <div className="truncate text-xs text-slate-500">
              Okunabilir genişlik · {activeLang.toUpperCase()} sayfa {selectedPage}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveLang("tr")}
              className={[
                "h-8 rounded-xl px-3 text-xs font-semibold transition",
                activeLang === "tr"
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-950",
              ].join(" ")}
            >
              TR
            </button>
            <button
              type="button"
              onClick={() => setActiveLang("en")}
              className={[
                "h-8 rounded-xl px-3 text-xs font-semibold transition",
                activeLang === "en"
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-950",
              ].join(" ")}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - 0.1).toFixed(2))))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Uzaklaştır"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            aria-label="Ekrana sığdır"
            title="Ekrana sığdır"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {Math.round(displayScale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + 0.1).toFixed(2))))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Yakınlaştır"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => changePage(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={selectedPage <= 1 || loading}
            aria-label="Önceki sayfa"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changePage(1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={loading}
            aria-label="Sonraki sayfa"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Yenile"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {searchTerms.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <Search className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Aranan:</span>
          <span className="truncate">{searchTerms[0]}</span>
          {highlightData?.highlights?.length ? (
            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900">
              {highlightData.highlights.length} eşleşme
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-auto bg-slate-100"
        style={{ padding: bodyPadding, boxSizing: "border-box" }}
      >
        <div
          className="relative mx-auto rounded-2xl bg-white shadow-sm"
          style={{
            width: displayWidth,
            height: displayHeight,
            minWidth: displayWidth,
            minHeight: displayHeight,
            maxWidth: "none",
            maxHeight: "none",
          }}
        >
          {loading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                PDF yükleniyor...
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white p-6 text-center">
              <div>
                <div className="text-sm font-semibold text-rose-700">PDF görüntülenemedi</div>
                <div className="mt-2 max-w-md text-xs text-slate-500">{error}</div>
              </div>
            </div>
          ) : null}

          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={`${activeLang.toUpperCase()} PDF sayfa ${selectedPage}`}
                className="block select-none rounded-2xl"
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  minWidth: displayWidth,
                  minHeight: displayHeight,
                  maxWidth: "none",
                  maxHeight: "none",
                  objectFit: "fill",
                }}
              />

              {imageSize && highlightData?.highlights?.length ? (
                <svg
                  className="pointer-events-none absolute left-0 top-0 rounded-2xl"
                  width={displayWidth}
                  height={displayHeight}
                  viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    minWidth: displayWidth,
                    minHeight: displayHeight,
                    maxWidth: "none",
                    maxHeight: "none",
                  }}
                >
                  {highlightData.highlights.map((rect, index) => (
                    <rect
                      key={`${rect.x}-${rect.y}-${index}`}
                      x={rect.x * scaleX}
                      y={rect.y * scaleY}
                      width={Math.max(rect.w * scaleX, 8)}
                      height={Math.max(rect.h * scaleY, 8)}
                      rx="4"
                      fill="rgba(250, 204, 21, 0.42)"
                      stroke="rgba(245, 158, 11, 0.95)"
                      strokeWidth="2"
                    />
                  ))}
                </svg>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500">
        <span>PDF genişliğe göre açılır; metin okunaklı kalır.</span>
        <span className="hidden sm:inline">Gerekirse yalnızca PDF alanının içinde scroll oluşur.</span>
      </div>
    </section>
  );
}

export default PdfViewer;
