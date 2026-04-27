"use client";

import type { ReactNode } from "react";
import { BookOpen, Edit3, ExternalLink, FileText, Languages, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IndexEntry, PageRef } from "@/lib/types";

export function EntryDetail({
  entry,
  onEdit,
  onJumpToPage,
}: {
  entry: IndexEntry | null;
  onEdit: () => void;
  onJumpToPage: (lang: "en" | "tr", page: number) => void;
}) {
  if (!entry) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white text-slate-500 shadow-sm">
            <MousePointerClick className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-slate-950">Bir dizin girişi seç</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Soldaki listeden bir kelime seçtiğinde PDF otomatik ilgili sayfaya gider ve kelime renklendirilir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <ConfidenceBadge value={entry.confidence} />
              {entry.manually_edited && <Badge variant="default">Manuel düzenlendi</Badge>}
              {entry.is_proper_noun && <Badge variant="muted">Özel isim</Badge>}
            </div>
            <h2 className="break-words text-2xl font-semibold tracking-tight text-slate-950">{entry.headword}</h2>
            <p className="mt-2 text-xs text-slate-500">Paragraf #{entry.paragraph_index + 1}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0 rounded-2xl bg-white">
            <Edit3 className="h-4 w-4" /> Düzenle
          </Button>
        </div>

        {entry.aliases?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {entry.aliases.map((alias) => (
              <span key={alias} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {alias}
              </span>
            ))}
          </div>
        )}
      </section>

      <PageGroup
        title="İngilizce sayfalar"
        icon={<BookOpen className="h-4 w-4" />}
        pages={entry.original_pages}
        empty="Orijinal sayfa bulunamadı"
        onClick={(page) => onJumpToPage("en", page)}
      />

      <PageGroup
        title="Türkçe sayfalar"
        icon={<Languages className="h-4 w-4" />}
        pages={entry.translated_pages}
        empty="Türkçe sayfa bulunamadı"
        onClick={(page) => onJumpToPage("tr", page)}
      />

      {entry.raw_text && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileText className="h-4 w-4" /> Ham dizin satırı
          </div>
          <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{entry.raw_text}</p>
        </section>
      )}
    </div>
  );
}

function PageGroup({
  title,
  icon,
  pages,
  empty,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  pages: PageRef[];
  empty: string;
  onClick: (page: number) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
        {icon} {title}
      </div>
      {pages?.length ? (
        <div className="flex flex-wrap gap-2">
          {pages.map((page, index) => {
            const start = Number(page.start);
            const label = page.end && page.end !== page.start ? `${page.start}-${page.end}` : `${page.start}`;
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                onClick={() => start > 0 && onClick(start)}
                className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
              >
                {label}
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function ConfidenceBadge({ value }: { value: string }) {
  const normalized = value === "high" || value === "medium" || value === "low" ? value : "medium";
  return (
    <Badge variant={normalized === "high" ? "success" : normalized === "medium" ? "warning" : "danger"}>
      {normalized === "high" ? "Yüksek güven" : normalized === "medium" ? "Orta güven" : "Düşük güven"}
    </Badge>
  );
}
