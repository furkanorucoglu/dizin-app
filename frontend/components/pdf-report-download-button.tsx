"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  GitCompareArrows,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { downloadFile } from "@/lib/backend-http";

interface PdfReportDownloadButtonProps {
  projectId: string;
  className?: string;
}

type ExportKind = "pdf" | "docx" | "comparison";

const exportOptions: Array<{
  kind: ExportKind;
  title: string;
  description: string;
  icon: typeof FileText;
  tone: string;
}> = [
  {
    kind: "pdf",
    title: "PDF indir",
    description: "Son düzeltilmiş Türkçe dizin PDF olarak iner.",
    icon: Download,
    tone: "bg-slate-100 text-slate-900",
  },
  {
    kind: "docx",
    title: "Word indir",
    description: "Dizin, yüklediğin Word örneğindeki sade paragraf formatında iner.",
    icon: FileText,
    tone: "bg-blue-50 text-blue-700",
  },
  {
    kind: "comparison",
    title: "Karşılaştırmalı PDF ister misin?",
    description:
      "İlk yüklenen dizin solda, son düzeltilmiş dizin sağda olacak şekilde kıyas PDF’i iner.",
    icon: GitCompareArrows,
    tone: "bg-amber-50 text-amber-700",
  },
];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportModal({
  open,
  busy,
  onClose,
  onDownload,
}: {
  open: boolean;
  busy: ExportKind | null;
  onClose: () => void;
  onDownload: (kind: ExportKind) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-md sm:px-6 sm:py-10">
      <button
        type="button"
        className="fixed inset-0 h-full w-full cursor-default"
        aria-label="İndirme penceresini kapat"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <div className="relative w-full max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_28px_90px_-30px_rgba(15,23,42,0.55)] sm:max-h-[calc(100vh-5rem)] sm:p-7">
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="pr-12">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
              Dışa aktar
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Hangi dosyayı indirmek istiyorsun?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Normal PDF, Word dosyası veya ilk verilen dizin ile son düzeltilmiş
              dizini kıyaslayan karşılaştırmalı PDF oluşturabilirsin.
            </p>
          </div>

          <div className="mt-7 grid gap-4">
            {exportOptions.map((option) => {
              const Icon = option.icon;
              const isBusy = busy === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => onDownload(option.kind)}
                  disabled={!!busy}
                  className="group flex w-full items-start gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
                >
                  <span
                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${option.tone}`}
                  >
                    {isBusy ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-black text-slate-950">
                      {option.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PdfReportDownloadButton({
  projectId,
  className,
}: PdfReportDownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const handleDownload = async (kind: ExportKind) => {
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const blob = await downloadFile(
          `/api/projects/${projectId}/entries/export/pdf`,
        );
        saveBlob(blob, `dizin-${projectId}.pdf`);
      }

      if (kind === "docx") {
        const blob = await downloadFile(
          `/api/projects/${projectId}/entries/export/docx`,
        );
        saveBlob(blob, `dizin-${projectId}.docx`);
      }

      if (kind === "comparison") {
        const blob = await downloadFile(
          `/api/projects/${projectId}/entries/export/comparison-pdf`,
        );
        saveBlob(blob, `dizin-karsilastirma-${projectId}.pdf`);
      }

      toast.success("Dosya hazırlandı ve indiriliyor.");
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Dosya indirilemedi.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
        }
      >
        <Download className="h-4 w-4" />
        İndir
      </button>

      <ExportModal
        open={open}
        busy={busy}
        onClose={() => setOpen(false)}
        onDownload={handleDownload}
      />
    </>
  );
}
