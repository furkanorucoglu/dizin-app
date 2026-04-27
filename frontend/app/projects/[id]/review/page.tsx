"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Columns3,
  FileSearch,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { EntryList } from "@/components/entry-list";
import { EntryDetail } from "@/components/entry-detail";
import { PdfViewer } from "@/components/pdf-viewer";
import { ManualEditDialog } from "@/components/manual-edit-dialog";
import { PdfReportDownloadButton } from "@/components/pdf-report-download-button";
import type { IndexEntry } from "@/lib/types";

const ENTRY_LIMIT = 500;

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [enPage, setEnPage] = useState<number | null>(null);
  const [trPage, setTrPage] = useState<number | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
  });

  const entriesQuery = useQuery({
    queryKey: ["entries", projectId, query],
    queryFn: () => api.listEntries(projectId, { q: query || undefined, limit: ENTRY_LIMIT }),
    enabled: projectQuery.data?.status === "done",
  });

  const updateEntry = useMutation({
    mutationFn: (data: { id: number; pages: any[] }) => api.patchEntry(projectId, data.id, data.pages),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["entries", projectId] });
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated as IndexEntry);
      toast.success("Giriş güncellendi");
      setIsEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSelect = (entry: IndexEntry) => {
    setSelectedEntry(entry);

    const firstTrPage = firstPage(entry.translated_pages);
    const firstEnPage = firstPage(entry.original_pages);

    if (firstTrPage) setTrPage(firstTrPage);
    if (firstEnPage) setEnPage(firstEnPage);
  };

  const handleJumpToPage = (lang: "en" | "tr", page: number) => {
    if (lang === "en") setEnPage(page);
    else setTrPage(page);
  };

  const highlightTerms = useMemo(
    () => (selectedEntry ? buildHighlightTerms(selectedEntry) : []),
    [selectedEntry],
  );

  if (projectQuery.isLoading) {
    return <div className="surface-card h-[72vh] animate-pulse" />;
  }

  if (!projectQuery.data) {
    return <div className="surface-card p-6 text-sm text-slate-600">Proje bulunamadı.</div>;
  }

  const entries = entriesQuery.data?.items ?? [];
  const total = entriesQuery.data?.total ?? 0;
  const isShowingPartialList = total > entries.length;

  return (
    <div className="flex h-[calc(100vh-5.75rem)] min-h-[820px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white/75 shadow-xl shadow-slate-200/70 backdrop-blur">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="rounded-2xl"
          >
            <ArrowLeft className="h-4 w-4" /> Geri
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">
              {projectQuery.data.title} — İnceleme
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Dizin girişi seç, PDF konumunu doğrula, gerekirse manuel sayfa düzeltmesi yap.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarPill icon={<FileSearch className="h-3.5 w-3.5" />} label={`${total} giriş`} />
          {isShowingPartialList && (
            <ToolbarPill
              icon={<Search className="h-3.5 w-3.5" />}
              label={`İlk ${entries.length} kayıt gösteriliyor`}
            />
          )}
          {selectedEntry ? (
            <ConfidenceBadge value={selectedEntry.confidence} />
          ) : (
            <ToolbarPill icon={<Search className="h-3.5 w-3.5" />} label="Seçim bekleniyor" />
          )}
          <PdfReportDownloadButton
            projectId={projectId}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/projects/`)}
            className="rounded-2xl bg-white"
          >
            <CheckCircle2 className="h-4 w-4" /> Bitti
          </Button>
        </div>
      </header>

      {/*
        Review alanı ekranı maksimum kullanır.
        Sol liste ve detay paneli daralmadan kalır; kalan geniş alan PDF paneline verilir.
      */}
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns:
            "clamp(320px,19vw,390px) clamp(360px,22vw,470px) minmax(760px,1fr)",
        }}
      >
        <aside className="min-h-0 border-r border-slate-200 bg-slate-50/80">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Columns3 className="h-4 w-4" /> Dizin listesi
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <EntryList
                entries={entries as any}
                total={total}
                selectedId={selectedEntry?.id ?? null}
                onSelect={handleSelect as any}
                query={query}
                onQueryChange={setQuery}
              />
            </div>
          </div>
        </aside>

        <section className="min-h-0 border-r border-slate-200 bg-white/80">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 items-center justify-between gap-2 border-b border-slate-200 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-2">
                <Pencil className="h-4 w-4" /> Seçilen giriş
              </span>
              {updateEntry.isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <EntryDetail
                entry={selectedEntry as any}
                onEdit={() => setIsEditOpen(true)}
                onJumpToPage={handleJumpToPage}
              />
            </div>
          </div>
        </section>

        <main className="min-h-0 min-w-0 overflow-hidden bg-slate-100/80 p-2 xl:p-3">
          <PdfViewer
            projectId={projectId}
            initialEnPage={enPage}
            initialTrPage={trPage}
            highlightTerms={highlightTerms}
            className="h-full w-full"
          />
        </main>
      </div>

      {selectedEntry && (
        <ManualEditDialog
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          entry={selectedEntry as any}
          onSave={async (pages) => {
            await updateEntry.mutateAsync({ id: selectedEntry.id, pages });
          }}
        />
      )}
    </div>
  );
}

function firstPage(pages: any[] | undefined): number | null {
  const page = pages?.find((item) => Number(item?.start) > 0)?.start;
  return Number(page) > 0 ? Number(page) : null;
}

function buildHighlightTerms(entry: IndexEntry) {
  const candidates = [
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
    entry.headword,
    ...String(entry.headword || "").split(/[;,/|()\[\]{}]+/g),
  ];

  return Array.from(
    new Set(
      candidates
        .map((candidate) => String(candidate || "").trim())
        .filter((candidate) => candidate.length >= 2),
    ),
  ).slice(0, 6);
}

function ToolbarPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
      {icon} {label}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: string }) {
  const normalized = value === "high" || value === "medium" || value === "low" ? value : "medium";
  const map: Record<"high" | "medium" | "low", BadgeVariant> = {
    high: "success",
    medium: "warning",
    low: "danger",
  };
  const text = normalized === "high" ? "Yüksek güven" : normalized === "medium" ? "Orta güven" : "Düşük güven";
  return <Badge variant={map[normalized]}>{text}</Badge>;
}
