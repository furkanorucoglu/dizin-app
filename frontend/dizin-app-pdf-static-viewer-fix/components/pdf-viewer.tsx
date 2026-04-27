"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Languages,
  Loader2,
  SearchX,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { HighlightResponse } from "@/lib/types";

type Lang = "en" | "tr";

type PdfViewerProps = {
  projectId: string;

  // Tek PDF kullanımı için eski/yeni prop desteği
  lang?: Lang;
  pageNum?: number | null;
  page?: number | null;
  highlightTerm?: string | null;
  title?: string;

  // Review ekranındaki kullanım
  initialEnPage?: number | null;
  initialTrPage?: number | null;
  highlightTerms?: string[];

  className?: string;
};

type PagePaneProps = {
  projectId: string;
  lang: Lang;
  page: number;
  terms: string[];
  title?: string;
  onPageChange?: (page: number) => void;
};

type ResolvedHighlight = HighlightResponse & { term: string };

const MIN_PAGE = 1;
const DEFAULT_DPI = 120;
const STATIC_VIEWPORT_HEIGHT = "h-[calc(100vh-18rem)] min-h-[620px]";
const STATIC_PAGE_MIN_WIDTH = "min-w-[1040px]";

export function PdfViewer(props: PdfViewerProps) {
  const {
    projectId,
    lang,
    pageNum,
    page,
    highlightTerm,
    title,
    initialEnPage,
    initialTrPage,
    highlightTerms,
    className = "",
  } = props;

  const terms = useMemo(
    () => normalizeTerms(highlightTerms, highlightTerm),
    [highlightTerms, highlightTerm],
  );

  // Eğer lang geldiyse tek PDF viewer gibi çalışır.
  if (lang === "en" || lang === "tr") {
    const resolvedPage = safePage(pageNum ?? page ?? 1);

    return (
      <div className={className}>
        <PagePane
          projectId={projectId}
          lang={lang}
          page={resolvedPage}
          terms={terms}
          title={title}
        />
      </div>
    );
  }

  // Review ekranı: aynı anda iki PDF göstermiyoruz; kullanıcı EN/TR seçiyor.
  return (
    <SelectablePdfViewer
      projectId={projectId}
      initialEnPage={initialEnPage}
      initialTrPage={initialTrPage}
      terms={terms}
      className={className}
    />
  );
}

function SelectablePdfViewer({
  projectId,
  initialEnPage,
  initialTrPage,
  terms,
  className,
}: {
  projectId: string;
  initialEnPage?: number | null;
  initialTrPage?: number | null;
  terms: string[];
  className: string;
}) {
  const [activeLang, setActiveLang] = useState<Lang>("tr");
  const [enPage, setEnPage] = useState(safePage(initialEnPage ?? 1));
  const [trPage, setTrPage] = useState(safePage(initialTrPage ?? 1));

  useEffect(() => {
    if (Number(initialEnPage) > 0) setEnPage(safePage(initialEnPage));
  }, [initialEnPage]);

  useEffect(() => {
    if (Number(initialTrPage) > 0) setTrPage(safePage(initialTrPage));
  }, [initialTrPage]);

  const activePage = activeLang === "en" ? enPage : trPage;
  const setActivePage = activeLang === "en" ? setEnPage : setTrPage;

  return (
    <section className={`flex h-full min-h-[720px] flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            PDF inceleme
          </p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">
            Seçilen dizin girdisini tek PDF üzerinde kontrol et
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {terms.length ? (
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              <FileSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Aranan kelime: {terms[0]}</span>
            </div>
          ) : (
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
              Highlight için dizin girdisi seç
            </div>
          )}

          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveLang("tr")}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                activeLang === "tr"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              aria-pressed={activeLang === "tr"}
            >
              <Languages className="h-3.5 w-3.5" />
              TR PDF
            </button>
            <button
              type="button"
              onClick={() => setActiveLang("en")}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                activeLang === "en"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              aria-pressed={activeLang === "en"}
            >
              EN PDF
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-100/80 p-4">
        <PagePane
          projectId={projectId}
          lang={activeLang}
          page={activePage}
          terms={terms}
          title={`${activeLang === "tr" ? "TR" : "EN"} sayfa ${activePage}`}
          onPageChange={setActivePage}
        />
      </div>
    </section>
  );
}

function PagePane({
  projectId,
  lang,
  page,
  terms,
  title,
  onPageChange,
}: PagePaneProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [highlight, setHighlight] = useState<ResolvedHighlight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedPage = safePage(page);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadPageImage() {
      setLoading(true);
      setError(null);
      setImageSize(null);
      setHighlight(null);

      try {
        const blob = await api.getPageImageBlob(projectId, lang, resolvedPage, DEFAULT_DPI);
        if (!active) return;

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch (err) {
        if (!active) return;
        setImageUrl(null);
        setError(err instanceof Error ? err.message : "PDF sayfası yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPageImage();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, lang, resolvedPage]);

  useEffect(() => {
    let active = true;

    async function loadHighlight() {
      if (!terms.length) {
        setHighlight(null);
        return;
      }

      for (const term of terms.slice(0, 8)) {
        try {
          const data = await api.getHighlights(projectId, lang, resolvedPage, term);
          if (!active) return;

          if (data.highlights?.length) {
            setHighlight({ ...data, term });
            return;
          }
        } catch {
          // Terim bulunamazsa veya endpoint hata verirse sıradaki terimi deneriz.
        }
      }

      if (active) setHighlight(null);
    }

    loadHighlight();

    return () => {
      active = false;
    };
  }, [projectId, lang, resolvedPage, terms]);

  const scaleX = imageSize && highlight ? imageSize.w / Math.max(highlight.page_w, 1) : 1;
  const scaleY = imageSize && highlight ? imageSize.h / Math.max(highlight.page_h, 1) : 1;

  return (
    <article className={`mx-auto flex ${STATIC_VIEWPORT_HEIGHT} ${STATIC_PAGE_MIN_WIDTH} max-w-none flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {lang === "en" ? "English PDF" : "Turkish PDF"}
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">
            {title || `${lang.toUpperCase()} sayfa ${resolvedPage}`}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {highlight?.term ? (
            <span className="max-w-[180px] truncate rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Highlight: {highlight.term}
            </span>
          ) : terms.length ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              Kelime bulunamadı
            </span>
          ) : null}

          {onPageChange ? (
            <div className="flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(MIN_PAGE, resolvedPage - 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Önceki sayfa"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-10 px-2 text-center text-xs font-semibold text-slate-700">
                {resolvedPage}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(resolvedPage + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Sonraki sayfa"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-start justify-start overflow-auto bg-slate-50 p-6">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/80 text-sm text-slate-500 backdrop-blur-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> PDF yükleniyor...
          </div>
        ) : null}

        {error ? (
          <div className="flex min-h-[500px] w-full flex-col items-center justify-center text-center text-slate-500">
            <SearchX className="mb-3 h-8 w-8" />
            <p className="font-medium text-slate-700">PDF görüntülenemedi</p>
            <p className="mt-1 max-w-md text-sm">{error}</p>
          </div>
        ) : null}

        {imageUrl ? (
          <div className="relative mx-auto w-fit shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <img
              src={imageUrl}
              alt={`${lang.toUpperCase()} PDF page ${resolvedPage}`}
              className="block h-auto max-w-none select-none"
              onLoad={(event) => {
                setImageSize({
                  w: event.currentTarget.clientWidth,
                  h: event.currentTarget.clientHeight,
                });
              }}
            />

            {highlight?.highlights?.length && imageSize ? (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                width={imageSize.w}
                height={imageSize.h}
                viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
              >
                {highlight.highlights.map((rect, index) => (
                  <rect
                    key={`${rect.x}-${rect.y}-${index}`}
                    x={rect.x * scaleX}
                    y={rect.y * scaleY}
                    width={rect.w * scaleX}
                    height={rect.h * scaleY}
                    rx="4"
                    className="fill-amber-300/50 stroke-amber-500/80"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function safePage(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < MIN_PAGE) return MIN_PAGE;
  return Math.floor(num);
}

function normalizeTerms(terms?: string[], fallback?: string | null): string[] {
  const candidates = [...(terms || []), fallback || ""];

  return Array.from(
    new Set(
      candidates
        .flatMap((candidate) => String(candidate || "").split(/[;,/|()[\]{}]+/g))
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length >= 2)
        .map((candidate) => candidate.slice(0, 120)),
    ),
  ).slice(0, 8);
}
